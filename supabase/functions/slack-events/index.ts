// ── Slack Events Edge Function ──────────────────────────────────────────────
// Handles all Slack interactions: events, commands, and block actions

import { WebClient } from 'npm:@slack/web-api@7';
import { Repository } from '../_shared/repository.ts';
import { SchedulerService } from '../_shared/scheduler.ts';
import { buildHomeView } from '../_shared/home-tab.ts';
import { getSettings, jsonResponse, textResponse, verifySlackSignature, addWeeks, parseDate } from '../_shared/utils.ts';

const VALID_FREQUENCIES = new Set(['weekly', 'biweekly', 'monthly']);

// Cache bot icon URL within a warm function instance
let cachedBotIconUrl: string | null | undefined; // undefined = not fetched, null = fetch failed

async function getBotIconUrl(client: WebClient): Promise<string | undefined> {
  if (cachedBotIconUrl !== undefined) return cachedBotIconUrl ?? undefined;
  try {
    const auth = await client.auth.test();
    const info = await client.bots.info({ bot: auth.bot_id as string });
    cachedBotIconUrl = (info.bot as any)?.icons?.image_72 ?? null;
  } catch {
    cachedBotIconUrl = null;
  }
  return cachedBotIconUrl ?? undefined;
}

async function fetchUserProfile(
  client: WebClient,
  userId: string,
  departmentFieldId: string | null,
): Promise<{ full_name: string | null; department: string | null }> {
  try {
    const info = await client.users.profile.get({ user: userId });
    const profile = (info.profile as any) || {};
    const full_name = profile.real_name || profile.display_name || null;
    const fields = profile.fields || {};

    let department: string | null = null;
    if (departmentFieldId && fields[departmentFieldId]?.value) {
      department = fields[departmentFieldId].value;
    } else {
      // Fallback: check profile.department or any field with a matching label
      department = profile.department || null;
      if (!department) {
        for (const field of Object.values(fields)) {
          const f = field as any;
          const label = (f.label || '').toLowerCase();
          if (label.includes('department') || label.includes('team')) {
            department = f.value || null;
            break;
          }
        }
      }
    }

    return { full_name, department };
  } catch {
    return { full_name: null, department: null };
  }
}

Deno.serve(async (req) => {
  const settings = getSettings();
  const repository = new Repository(settings.supabaseUrl, settings.supabaseServiceRoleKey);
  const client = new WebClient(settings.slackBotToken);

  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  // Get raw body for signature verification
  const bodyText = await req.text();
  const contentType = req.headers.get('content-type') || '';

  // Parse body: Slack sends events as JSON, but interactive payloads and slash
  // commands as application/x-www-form-urlencoded with an optional `payload` field.
  let body: any = {};
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = new URLSearchParams(bodyText);
    const payloadStr = formData.get('payload');
    if (payloadStr) {
      body = JSON.parse(payloadStr); // block_actions, shortcuts, etc.
    } else {
      // Slash commands — expose as body.command for unified handling below
      body = {
        type: 'slash_command',
        command: formData.get('command'),
        text: formData.get('text'),
        user_id: formData.get('user_id'),
        channel_id: formData.get('channel_id'),
        response_url: formData.get('response_url'),
      };
    }
  } else if (bodyText) {
    body = JSON.parse(bodyText);
  }

  // Verify Slack signature
  const signature = req.headers.get('x-slack-signature');
  const timestamp = req.headers.get('x-slack-request-timestamp');

  if (signature && timestamp) {
    const isValid = await verifySlackSignature(settings.slackSigningSecret, signature, timestamp, bodyText);
    if (!isValid) {
      return textResponse('Invalid signature', 401);
    }
  }

  // Handle URL verification challenge
  if (body.type === 'url_verification') {
    return jsonResponse({ challenge: body.challenge });
  }

  // ── Handle Slack Events ────────────────────────────────────────────────

  if (body.type === 'event_callback' && body.event) {
    const event = body.event;

    // App home opened
    if (event.type === 'app_home_opened') {
      const userId = event.user;
      let pref = await repository.getUserPreference(userId);

      if (!pref) {
        const profile = await fetchUserProfile(client, userId, settings.glazeDepartmentFieldId);
        await repository.upsertUserPreference(userId, {
          is_active: true,
          frequency: 'biweekly',
          ...profile,
        });
        pref = await repository.getUserPreference(userId);
      }

      // Show stats section to all users
      const botIconUrl = await getBotIconUrl(client);
      const view = buildHomeView(pref, botIconUrl);

      await client.views.publish({ user_id: userId, view });

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: true });
  }

  // ── Handle Block Actions ───────────────────────────────────────────────

  if (body.type === 'block_actions' || body.payload) {
    const payload = body.payload ? JSON.parse(body.payload) : body;
    const userId = payload.user.id;
    const action = payload.actions?.[0];

    if (!action) {
      return jsonResponse({ ok: true });
    }

    const botIconUrl = await getBotIconUrl(client);

    // Set frequency
    if (action.action_id === 'set_frequency') {
      const value = action.selected_option.value;
      await repository.upsertUserPreference(userId, { frequency: value });
      const pref = await repository.getUserPreference(userId);
      await client.views.publish({
        user_id: userId,
        view: buildHomeView(pref, botIconUrl),
      });
      return jsonResponse({ ok: true });
    }

    // Set snooze
    if (action.action_id === 'set_snooze') {
      const weeks = parseInt(action.selected_option.value);
      const snoozeUntil = weeks === 0 ? null : addWeeks(new Date(), weeks);
      await repository.upsertUserPreference(userId, { snooze_until: snoozeUntil });
      const pref = await repository.getUserPreference(userId);
      await client.views.publish({
        user_id: userId,
        view: buildHomeView(pref, botIconUrl),
      });
      return jsonResponse({ ok: true });
    }

    // Set active
    if (action.action_id === 'set_active') {
      await repository.upsertUserPreference(userId, { is_active: true, snooze_until: null });
      const pref = await repository.getUserPreference(userId);
      await client.views.publish({
        user_id: userId,
        view: buildHomeView(pref, botIconUrl),
      });
      return jsonResponse({ ok: true });
    }

    // Set inactive
    if (action.action_id === 'set_inactive') {
      await repository.upsertUserPreference(userId, { is_active: false });
      const pref = await repository.getUserPreference(userId);
      await client.views.publish({
        user_id: userId,
        view: buildHomeView(pref, botIconUrl),
      });
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: true });
  }

  // ── Handle Slash Commands ──────────────────────────────────────────────

  // /glaze-off
  if (body.command === '/glaze-off') {
    const existingPref = await repository.getUserPreference(body.user_id);
    await repository.upsertUserPreference(body.user_id, { is_active: false });
    const name = existingPref?.full_name ?? body.user_id;
    console.log(`[glaze-off] ${name} opted out`);
    return textResponse('You are now opted out of Glaze.');
  }

  // /glaze-on
  if (body.command === '/glaze-on') {
    const profile = await fetchUserProfile(client, body.user_id, settings.glazeDepartmentFieldId);
    await repository.upsertUserPreference(body.user_id, { is_active: true, snooze_until: null, ...profile });
    const name = profile.full_name ?? body.user_id;
    console.log(`[glaze-on] ${name} opted in`);
    return textResponse('You are back in for Glaze.');
  }

  // /glaze-frequency
  if (body.command === '/glaze-frequency') {
    const parts = (body.text || '').trim().toLowerCase().split(/\s+/);
    if (parts.length !== 1 || !VALID_FREQUENCIES.has(parts[0])) {
      return textResponse('Usage: /glaze-frequency weekly|biweekly|monthly');
    }
    await repository.upsertUserPreference(body.user_id, { frequency: parts[0] });
    return textResponse(`Your Glaze frequency is now set to ${parts[0]}.`);
  }

  // /glaze-snooze
  if (body.command === '/glaze-snooze') {
    const text = (body.text || '').trim();
    if (!['1', '2', '3', '4'].includes(text)) {
      return textResponse('Usage: /glaze-snooze 1|2|3|4');
    }
    const weeks = parseInt(text);
    const until = addWeeks(new Date(), weeks);
    await repository.upsertUserPreference(body.user_id, { snooze_until: until });
    return textResponse(`Glaze snoozed for ${weeks} week(s), until ${until}.`);
  }

  // /glaze-run-now
  if (body.command === '/glaze-run-now') {
    if (settings.glazeAdminUserIds.size > 0 && !settings.glazeAdminUserIds.has(body.user_id)) {
      return textResponse('⛔ You are not authorized to run this command.');
    }
    const responseUrl = body.response_url;

    // Run the cycle after responding to avoid Slack's 3s timeout
    EdgeRuntime.waitUntil((async () => {
      try {
        const scheduler = new SchedulerService(
          settings.slackBotToken,
          repository,
          settings.openaiApiKey,
          settings.glazeCrossDepartmentWeight,
          settings.glazeRepeatPenaltyDays,
          settings.glazeDepartmentFieldId,
        );
        const result = await scheduler.runCycle();

        const summary = [
          `✅ *Glaze cycle complete* — ${result.cycle_date}`,
          `• Pairs created: ${result.pairs_created}`,
          `• Eligible users: ${result.eligible_users}`,
          `• Leftovers: ${result.leftovers.length}`,
        ].join('\n');

        console.log(
          `[glaze-run-now] cycle=${result.cycle_date} eligible=${result.eligible_users} pairs=${result.pairs_created} leftovers=${result.leftovers.length}`,
        );

        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: summary }),
        });
      } catch (err) {
        console.error('glaze-run-now error:', err);
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `❌ Glaze cycle failed: ${String(err)}` }),
        });
      }
    })());

    return textResponse('⏳ Running Glaze cycle…');
  }

  // /glaze-refresh-profiles
  if (body.command === '/glaze-refresh-profiles') {
    if (settings.glazeAdminUserIds.size > 0 && !settings.glazeAdminUserIds.has(body.user_id)) {
      return textResponse('⛔ You are not authorized to run this command.');
    }
    const responseUrl = body.response_url;

    EdgeRuntime.waitUntil((async () => {
      try {
        const allPrefs = await repository.listPreferences();
        let added = 0, updated = 0, unchanged = 0;

        for (const pref of allPrefs) {
          const profile = await fetchUserProfile(client, pref.slack_user_id, settings.glazeDepartmentFieldId);
          const fields: Partial<typeof pref> = {};
          if (profile.full_name !== null) fields.full_name = profile.full_name;
          if (profile.department !== null) fields.department = profile.department;

          if (Object.keys(fields).length === 0) {
            unchanged++;
            continue;
          }

          const nameChanged = fields.full_name !== undefined && fields.full_name !== pref.full_name;
          const deptChanged = fields.department !== undefined && fields.department !== pref.department;

          if (!nameChanged && !deptChanged) {
            unchanged++;
            continue;
          }

          await repository.upsertUserPreference(pref.slack_user_id, fields);

          const hadAny = pref.full_name !== null || pref.department !== null;
          if (hadAny) {
            updated++;
          } else {
            added++;
          }
        }

        const summary = [
          `✅ *Profile refresh complete* — ${allPrefs.length} user(s) in DB`,
          `• Added: ${added}`,
          `• Updated: ${updated}`,
          `• Unchanged: ${unchanged}`,
        ].join('\n');

        console.log(
          `[glaze-refresh-profiles] total=${allPrefs.length} added=${added} updated=${updated} unchanged=${unchanged}`,
        );

        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: summary }),
        });
      } catch (err) {
        console.error('glaze-refresh-profiles error:', err);
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `❌ Profile refresh failed: ${String(err)}` }),
        });
      }
    })());

    return textResponse('⏳ Refreshing profiles…');
  }

  // Default response
  return jsonResponse({ ok: true });
});
