// ── Queue Cycle Edge Function ────────────────────────────────────────────────
// Coordinator job: runs the matching algorithm across all eligible users and
// writes all pairs to glaze_pair_queue. Makes zero Slack API calls.
// Triggered by pg_cron at Monday 08:00 UTC, one minute before the workers.

import { Repository } from '../_shared/repository.ts';
import { SchedulerService } from '../_shared/scheduler.ts';
import { getSettings, jsonResponse, textResponse } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  const settings = getSettings();

  const adminToken = req.headers.get('x-admin-token');
  if (adminToken !== settings.adminTriggerToken) {
    return textResponse('Unauthorized', 401);
  }

  const repository = new Repository(settings.supabaseUrl, settings.supabaseServiceRoleKey);
  const scheduler = new SchedulerService(
    settings.slackBotToken,
    repository,
    settings.openaiApiKey,
    settings.glazeCrossDepartmentWeight,
    settings.glazeRepeatPenaltyDays,
  );

  try {
    const result = await scheduler.queueCycle();
    console.log(`[queue-cycle] cycle=${result.cycle_date} eligible=${result.eligible_users} pairs=${result.pairs_queued} leftovers=${result.leftovers.join(',')}`);
    return jsonResponse(result);
  } catch (error) {
    console.error('Error queuing cycle:', error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
