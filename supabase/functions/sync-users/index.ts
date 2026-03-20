// ── Sync Users Edge Function ─────────────────────────────────────────────────
// Syncs Slack profiles for all channel members. Run daily via pg_cron.
// Processes up to 1200 users per invocation ordered by last_synced_at ASC NULLS FIRST,
// so running twice (5:00 and 5:05 UTC) covers up to 2400 users per day.

import { WebClient } from 'npm:@slack/web-api@7';
import { Repository } from '../_shared/repository.ts';
import { extractDepartment, getSettings, jsonResponse, textResponse } from '../_shared/utils.ts';

const BATCH_SIZE = 20;    // concurrent Slack API calls per batch
const BATCH_DELAY_MS = 1000; // 1 second between batches
const SYNC_LIMIT = 1200;     // max users per invocation

Deno.serve(async (req) => {
  const settings = getSettings();

  const adminToken = req.headers.get('x-admin-token');
  if (adminToken !== settings.adminTriggerToken) {
    return textResponse('Unauthorized', 401);
  }

  const repository = new Repository(settings.supabaseUrl, settings.supabaseServiceRoleKey);
  const client = new WebClient(settings.slackBotToken);

  try {
    // Step 1: Enumerate channel members and register any that are new to the DB
    const memberIds = await fetchChannelMemberIds(client, settings.glazeDefaultChannelId);
    await repository.registerNewMembers(memberIds);

    // Step 2: Get users most in need of a sync (null last_synced_at first, then oldest)
    const usersToSync = await repository.listUsersForSync(SYNC_LIMIT);

    // Step 3: Process in parallel batches of BATCH_SIZE with 1-second delay between batches
    let synced = 0;
    for (let i = 0; i < usersToSync.length; i += BATCH_SIZE) {
      const batch = usersToSync.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (user) => {
        try {
          const profileInfo = await client.users.profile.get({ user: user.slack_user_id });
          const profile = (profileInfo.profile as any) || {};
          const full_name = profile.real_name || profile.display_name || null;
          const department = extractDepartment(profile, settings.glazeDepartmentFieldId);

          await repository.upsertUserPreference(user.slack_user_id, {
            full_name,
            department,
            last_synced_at: new Date().toISOString(),
          });
          synced++;
        } catch (err) {
          console.error(`[sync-users] Failed to sync ${user.slack_user_id}:`, err);
        }
      }));

      if (i + BATCH_SIZE < usersToSync.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    console.log(
      `[sync-users] channel_members=${memberIds.length} synced=${synced}/${usersToSync.length}`,
    );
    return jsonResponse({ channel_members: memberIds.length, synced, total: usersToSync.length });
  } catch (error) {
    console.error('[sync-users] Error:', error);
    return jsonResponse({ error: String(error) }, 500);
  }
});

async function fetchChannelMemberIds(client: WebClient, channelId: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;

  while (true) {
    const response = await client.conversations.members({ channel: channelId, cursor, limit: 200 });
    if (!response.members) break;
    ids.push(...response.members);
    cursor = response.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return ids;
}
