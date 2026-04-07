// ── Run Nudges Edge Function ────────────────────────────────────────────────
// Worker job: claims up to BATCH_SIZE silent pairs from last week's cycle and
// sends a nudge message to each. Safe to run concurrently — DB claim is atomic
// (FOR UPDATE SKIP LOCKED), so each pair is nudged exactly once.
// 20 workers fire every Thursday from 08:00–08:19 UTC.

import { Repository } from '../_shared/repository.ts';
import { SchedulerService } from '../_shared/scheduler.ts';
import { getSettings, jsonResponse, textResponse } from '../_shared/utils.ts';

// Worst case: 2 Tier-3 calls/pair (history + postMessage) × 50 = 100 calls
// 100 ÷ 50 req/min = 2 min — safely within the 150s edge function timeout.
const BATCH_SIZE = 50;

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
    const t0 = Date.now();
    const result = await scheduler.runNudges(BATCH_SIZE, settings.verbose);
    const elapsed = Date.now() - t0;
    console.log(`[run-nudges] done in ${elapsed}ms cycle=${result.target_cycle} nudged=${result.nudges_sent} boosted=${result.boosts_sent}`);
    return jsonResponse(result);
  } catch (error) {
    console.error('Error running nudges:', error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
