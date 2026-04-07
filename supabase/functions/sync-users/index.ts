// ── Sync Users Edge Function ─────────────────────────────────────────────────
// Syncs Slack profiles for all channel members via users.info.
// Triggered by sync-orchestrator every 3 minutes while unsynced users remain.
// Processes users ordered by last_synced_at ASC NULLS FIRST, stopping before
// the 150s Supabase SLA. Retries on Slack 429 within the remaining time budget.

import { WebClient } from 'npm:@slack/web-api@7';
import { Repository } from '../_shared/repository.ts';
import { getSettings, jsonResponse, textResponse } from '../_shared/utils.ts';

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 3_000;    // 5 calls / 3s = 100 req/min — Slack Tier 4 limit
const MAX_DURATION_MS = 130_000; // stop at 130s, leaving buffer under Supabase 150s SLA
const FETCH_LIMIT = 500;         // users to fetch per run; time budget controls how many we actually process

Deno.serve(async (req) => {
  const settings = getSettings();

  const adminToken = req.headers.get('x-admin-token');
  if (adminToken !== settings.adminTriggerToken) {
    return textResponse('Unauthorized', 401);
  }

  const startTime = Date.now();
  const repository = new Repository(settings.supabaseUrl, settings.supabaseServiceRoleKey);
  const client = new WebClient(settings.slackBotToken, { retryConfig: { retries: 0 } });

  try {
    // Step 1: Enumerate channel members and register any new ones
    const memberIds = await fetchChannelMemberIds(client, settings.glazeDefaultChannelId);
    await repository.registerNewMembers(memberIds);

    // Step 2: Get users ordered by oldest sync first (never-synced first)
    const usersToSync = await repository.listUsersForSync(FETCH_LIMIT);

    if (usersToSync.length === 0) {
      return jsonResponse({ synced: 0, total: 0 });
    }

    // Step 3: Process in batches, stopping when time budget is exhausted
    let synced = 0;
    let stopped_early = false;
    for (let i = 0; i < usersToSync.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > MAX_DURATION_MS) {
        console.log(`[sync-users] time budget reached at user ${i}/${usersToSync.length}, stopping`);
        stopped_early = true;
        break;
      }

      const batch = usersToSync.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (user) => {
        try {
          const userInfo = await callWithRateLimitRetry(
            () => client.users.info({ user: user.slack_user_id }),
            startTime,
          );
          const u = (userInfo.user as any) || {};
          const profile = u.profile || {};

          await repository.upsertUserPreference(user.slack_user_id, {
            is_bot: !!u.is_bot,
            deleted: !!u.deleted,
            full_name: u.real_name || profile.real_name || profile.display_name || null,
            department: profile.title || null,
            team_id: u.team_id || null,
            tz: u.tz || null,
            is_restricted: u.is_restricted ?? null,
            is_app_user: u.is_app_user ?? null,
            status_text: profile.status_text || null,
            last_synced_at: new Date().toISOString(),
          });
          synced++;
        } catch (err: any) {
          console.error(`[sync-users] Failed to sync ${user.slack_user_id}:`, err?.message ?? err);
        }
      }));

      if (i + BATCH_SIZE < usersToSync.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[sync-users] synced=${synced}/${usersToSync.length} elapsed=${elapsed}s stopped_early=${stopped_early}`);
    return jsonResponse({ synced, total: usersToSync.length, elapsed_seconds: elapsed, stopped_early });
  } catch (error) {
    console.error('[sync-users] Error:', error);
    return jsonResponse({ error: String(error) }, 500);
  }
});

// Retries on Slack 429, waiting the Retry-After duration if the time budget allows.
async function callWithRateLimitRetry<T>(fn: () => Promise<T>, startTime: number): Promise<T> {
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const retryAfter: number | undefined = err?.retryAfter;
      if (retryAfter != null) {
        const waitMs = (retryAfter + 1) * 1000;
        const remaining = MAX_DURATION_MS - (Date.now() - startTime);
        if (waitMs > remaining) {
          throw new Error(`Rate limited (retry after ${retryAfter}s) with only ${Math.round(remaining / 1000)}s budget remaining`);
        }
        console.warn(`[sync-users] rate limited, waiting ${retryAfter}s`);
        await sleep(waitMs);
      } else {
        throw err;
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
