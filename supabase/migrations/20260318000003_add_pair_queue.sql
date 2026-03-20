-- ── Add Pair Queue Table ─────────────────────────────────────────────────────
-- Decouples matching (coordinator) from Slack messaging (workers) so we can
-- spread 1,000+ pairs across 20 parallel worker invocations.

CREATE TABLE glaze_pair_queue (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cycle_date    DATE NOT NULL,
  user_a        TEXT NOT NULL,
  user_b        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  dm_channel_id TEXT NULL,
  intro_ts      TEXT NULL,
  claimed_at    TIMESTAMPTZ NULL,
  completed_at  TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX glaze_pair_queue_status_idx ON glaze_pair_queue(status, cycle_date);

ALTER TABLE glaze_pair_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to pair queue"
  ON glaze_pair_queue FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- ── Atomic claim function ─────────────────────────────────────────────────────
-- Multiple worker invocations call this concurrently. FOR UPDATE SKIP LOCKED
-- ensures each pair is claimed by exactly one worker.
-- Items stuck in 'processing' for >5 minutes are reclaimed automatically.

CREATE OR REPLACE FUNCTION claim_pair_queue_batch(p_batch_size INT)
RETURNS SETOF glaze_pair_queue AS $$
  UPDATE glaze_pair_queue
  SET status = 'processing', claimed_at = NOW()
  WHERE id IN (
    SELECT id FROM glaze_pair_queue
    WHERE status = 'pending'
       OR (status = 'processing' AND claimed_at < NOW() - INTERVAL '5 minutes')
    ORDER BY id
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE SQL;

-- ── Update cron schedule ──────────────────────────────────────────────────────
-- Replace the single Monday run-cycle job with:
--   1 coordinator (queue-cycle) at 08:00 – runs matching, writes pairs to queue
--  20 workers     (run-cycle)   at 08:01-08:20 – each claims up to 50 pairs and
--                                                 sends Slack messages
--
-- Throughput: 20 workers × 50 pairs = 1,000 pairs per cycle
-- Rate limit:  2 Slack Tier-3 calls per pair → 100 calls/min per worker,
--              but workers start 1 min apart so peak is ~50 calls/min (safe).
--
-- IMPORTANT: Replace placeholders before running:
--   oozkjnyhvrndobksdyld   → your Supabase project ref
--   YOUR_SUPABASE_ANON_KEY → anon key from Supabase dashboard
--   YOUR_ADMIN_TRIGGER_TOKEN → match ADMIN_TRIGGER_TOKEN secret

SELECT cron.unschedule('glaze-run-cycle');

-- Monday 08:00 UTC – Coordinator: compute matches and fill the queue
SELECT cron.schedule(
  'glaze-queue-cycle',
  '0 8 * * 1',
  $$
    SELECT net.http_post(
      url     := 'https://oozkjnyhvrndobksdyld.supabase.co/functions/v1/queue-cycle',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY", "x-admin-token": "YOUR_ADMIN_TRIGGER_TOKEN"}'::jsonb
    );
  $$
);

-- Monday 08:01–08:20 UTC – Workers: claim and send messages
DO $$
DECLARE
  i integer;
BEGIN
  FOR i IN 1..20 LOOP
    PERFORM cron.schedule(
      'glaze-run-cycle-' || i,
      i || ' 8 * * 1',
      $cmd$
        SELECT net.http_post(
          url     := 'https://oozkjnyhvrndobksdyld.supabase.co/functions/v1/run-cycle',
          headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY", "x-admin-token": "YOUR_ADMIN_TRIGGER_TOKEN"}'::jsonb
        );
      $cmd$
    );
  END LOOP;
END;
$$;
