-- ── Add nudge_claimed_at to pair events ─────────────────────────────────────
-- Enables atomic batch claiming for concurrent run-nudges worker invocations.
-- Same pattern as glaze_pair_queue but on the existing pair events table since
-- there is no need for a separate coordinator — the eligible set is already
-- well-defined by nudge_sent_at IS NULL.

ALTER TABLE glaze_pair_events ADD COLUMN IF NOT EXISTS nudge_claimed_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS glaze_pair_events_nudge_idx
  ON glaze_pair_events(cycle_date, nudge_sent_at, nudge_claimed_at);

-- ── Atomic claim function ─────────────────────────────────────────────────────
-- Claims up to p_batch_size rows for a given cycle that have not yet been nudged
-- and are not currently being processed by another worker.
-- Items stuck in claiming for >5 minutes are automatically reclaimed.

CREATE OR REPLACE FUNCTION claim_nudge_batch(p_cycle_date DATE, p_batch_size INT)
RETURNS SETOF glaze_pair_events AS $$
  UPDATE glaze_pair_events
  SET nudge_claimed_at = NOW()
  WHERE id IN (
    SELECT id FROM glaze_pair_events
    WHERE cycle_date = p_cycle_date
      AND nudge_sent_at IS NULL
      AND (
        nudge_claimed_at IS NULL
        OR nudge_claimed_at < NOW() - INTERVAL '5 minutes'
      )
    ORDER BY id
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE SQL;

-- ── Update Thursday nudge cron ────────────────────────────────────────────────
-- Replace the single glaze-run-nudges job with 20 staggered workers.
-- Each claims 50 pairs → 20 × 50 = 1,000 pairs/Thursday.
-- Workers start 1 minute apart to spread Slack Tier-3 load across the hour.
--
-- IMPORTANT: Replace placeholders before running:
--   oozkjnyhvrndobksdyld   → your Supabase project ref
--   YOUR_SUPABASE_ANON_KEY → anon key from Supabase dashboard
--   YOUR_ADMIN_TRIGGER_TOKEN → match ADMIN_TRIGGER_TOKEN secret

SELECT cron.unschedule('glaze-run-nudges');

DO $$
DECLARE
  i integer;
BEGIN
  FOR i IN 1..20 LOOP
    PERFORM cron.schedule(
      'glaze-run-nudges-' || i,
      (i - 1) || ' 8 * * 4',
      $cmd$
        SELECT net.http_post(
          url     := 'https://oozkjnyhvrndobksdyld.supabase.co/functions/v1/run-nudges',
          headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY", "x-admin-token": "YOUR_ADMIN_TRIGGER_TOKEN"}'::jsonb
        );
      $cmd$
    );
  END LOOP;
END;
$$;
