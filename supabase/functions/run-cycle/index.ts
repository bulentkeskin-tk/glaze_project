// ── Run Cycle Edge Function ─────────────────────────────────────────────────
// Worker job: claims up to BATCH_SIZE pending pairs from glaze_pair_queue and
// sends Slack intro messages for each. Safe to run concurrently — the DB claim
// is atomic (FOR UPDATE SKIP LOCKED), so each pair is processed exactly once.
// 20 workers fire every Monday from 08:01–08:20 UTC.

import { Repository } from '../_shared/repository.ts';
import { SchedulerService } from '../_shared/scheduler.ts';
import { getSettings, jsonResponse, textResponse } from '../_shared/utils.ts';

const BATCH_SIZE = 50; // max pairs per worker — stays well within Slack Tier-3 limits

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
    const result = await scheduler.processQueue(BATCH_SIZE);
    const elapsed = Date.now() - t0;
    
    // Explicit logging for empty batch vs. actual processing
    if (result.cycle_date === null) {
      console.log(`[run-cycle] no pairs available (all processed or queue empty) elapsed=${elapsed}ms`);
    } else {
      console.log(`[run-cycle] done in ${elapsed}ms cycle=${result.cycle_date} processed=${result.pairs_processed} failed=${result.pairs_failed}`);
    }
    
    return jsonResponse(result);
  } catch (error) {
    console.error('Error processing queue:', error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
