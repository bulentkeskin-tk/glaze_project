// ── Run Cycle Edge Function ─────────────────────────────────────────────────
// Triggered by pg_cron on Monday mornings to create coffee chat matches

import { Repository } from '../_shared/repository.ts';
import { SchedulerService } from '../_shared/scheduler.ts';
import { getSettings, jsonResponse, textResponse } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  const settings = getSettings();

  // Verify admin token
  const adminToken = req.headers.get('x-admin-token');
  if (adminToken !== settings.adminTriggerToken) {
    return textResponse('Unauthorized', 401);
  }

  // Initialize services
  const repository = new Repository(settings.supabaseUrl, settings.supabaseServiceRoleKey);
  const scheduler = new SchedulerService(
    settings.slackBotToken,
    repository,
    settings.openaiApiKey,
    settings.glazeCrossDepartmentWeight,
    settings.glazeRepeatPenaltyDays,
    settings.glazeDepartmentFieldId,
  );

  try {
    // Run the cycle
    const result = await scheduler.runCycle();
    
    console.log('Cycle completed:', result);
    
    return jsonResponse(result);
  } catch (error) {
    console.error('Error running cycle:', error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
