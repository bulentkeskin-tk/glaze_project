// ── Sync Orchestrator Edge Function ──────────────────────────────────────────
// Checks if any users haven't been synced in the past 7 days.
// If so, triggers sync-users and returns immediately (fire-and-forget).
// Called by pg_cron every 3 minutes on Monday mornings (5:00–7:59 UTC).

import { Repository } from '../_shared/repository.ts';
import { getSettings, jsonResponse, textResponse } from '../_shared/utils.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

Deno.serve(async (req) => {
  const settings = getSettings();

  const adminToken = req.headers.get('x-admin-token');
  if (adminToken !== settings.adminTriggerToken) {
    return textResponse('Unauthorized', 401);
  }

  const repository = new Repository(settings.supabaseUrl, settings.supabaseServiceRoleKey);

  try {
    const unsyncedCount = await repository.countUsersNeedingSync();

    if (unsyncedCount === 0) {
      console.log('[sync-orchestrator] All users synced within the past week, nothing to do');
      return jsonResponse({ unsynced_count: 0, triggered: false });
    }

    // Fire sync-users without blocking — it runs within its own 150s budget
    const syncUrl = `${settings.supabaseUrl}/functions/v1/sync-users`;
    EdgeRuntime.waitUntil(
      fetch(syncUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('GLAZE_ANON_KEY')}`,
          'x-admin-token': settings.adminTriggerToken,
        },
      }).then((res) => {
        console.log(`[sync-orchestrator] sync-users responded ${res.status}`);
      }).catch((err) => {
        console.error('[sync-orchestrator] Failed to trigger sync-users:', err);
      }),
    );

    console.log(`[sync-orchestrator] triggered sync-users, unsynced_count=${unsyncedCount}`);
    return jsonResponse({ unsynced_count: unsyncedCount, triggered: true });
  } catch (error) {
    console.error('[sync-orchestrator] Error:', error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
