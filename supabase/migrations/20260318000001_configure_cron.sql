-- ── Scheduled Jobs Configuration ───────────────────────────────────────────
-- Configure pg_cron to call Edge Functions on a schedule
-- Run this after deploying your Edge Functions to Supabase

-- IMPORTANT: Replace these placeholders before running:
--   1. oozkjnyhvrndobksdyld - Get from Supabase dashboard URL (e.g., abcdefghijklmnopqrst)
--   2. YOUR_ADMIN_TRIGGER_TOKEN - Match the ADMIN_TRIGGER_TOKEN secret in your Edge Functions

-- Monday 08:00 UTC – Run the matching cycle
SELECT cron.schedule(
  'glaze-run-cycle',
  '0 8 * * 1',
  $$
    SELECT net.http_post(
      url     := 'https://oozkjnyhvrndobksdyld.supabase.co/functions/v1/run-cycle',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY", "x-admin-token": "YOUR_ADMIN_TRIGGER_TOKEN"}'::jsonb
    );
  $$
);

-- Thursday 08:00 UTC – Send nudges to silent pairs
SELECT cron.schedule(
  'glaze-run-nudges',
  '0 8 * * 4',
  $$
    SELECT net.http_post(
      url     := 'https://oozkjnyhvrndobksdyld.supabase.co/functions/v1/run-nudges',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY", "x-admin-token": "YOUR_ADMIN_TRIGGER_TOKEN"}'::jsonb
    );
  $$
);

-- Monday 5:00–5:21 UTC – Sync user profiles
-- 22 staggered jobs, one per minute. Each processes ~95 users at ~100 req/min
-- (5 concurrent calls, 3-second delay between batches — within Slack Tier 4 limit).
-- Total weekly capacity: 22 × 95 = 2,090 users, rotating oldest-synced-first.
DO $$
DECLARE
  i integer;
BEGIN
  FOR i IN 1..22 LOOP
    PERFORM cron.schedule(
      'glaze-sync-users-' || i,
      (i - 1) || ' 5 * * 1',
      $cmd$
        SELECT net.http_post(
          url     := 'https://oozkjnyhvrndobksdyld.supabase.co/functions/v1/sync-users',
          headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY", "x-admin-token": "YOUR_ADMIN_TRIGGER_TOKEN"}'::jsonb
        );
      $cmd$
    );
  END LOOP;
END;
$$;
-- ── Manage Jobs ──────────────────────────────────────────────────────────────

-- View all scheduled jobs
-- SELECT * FROM cron.job;

-- View recent job executions
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Remove a job (if needed)
-- SELECT cron.unschedule('glaze-run-cycle');
-- SELECT cron.unschedule('glaze-run-nudges');
-- Remove all 22 sync jobs:
-- DO $$ DECLARE i integer; BEGIN FOR i IN 1..22 LOOP PERFORM cron.unschedule('glaze-sync-users-' || i); END LOOP; END; $$;
