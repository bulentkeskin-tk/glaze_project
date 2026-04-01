-- ══════════════════════════════════════════════════════════════════════════════
-- Glaze – Complete Database Schema
-- ══════════════════════════════════════════════════════════════════════════════
-- This file creates the complete database schema for the Glaze coffee chat
-- matching application. Run this to set up a fresh database.

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE glaze_user_preferences (
    slack_user_id text PRIMARY KEY,
    is_active boolean NOT NULL DEFAULT true,
    frequency text NOT NULL DEFAULT 'biweekly' CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
    snooze_until date NULL,
    department text NULL,
    full_name text NULL,
    last_synced_at timestamptz NULL,
    team_id text NULL,
    tz text NULL,
    is_restricted boolean NULL,
    is_app_user boolean NULL,
    status_text text NULL,
    is_bot boolean NOT NULL DEFAULT false,
    deleted boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE glaze_pair_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cycle_date date NOT NULL,
    user_a text NOT NULL,
    user_b text NOT NULL,
    dm_channel_id text NOT NULL,
    intro_ts text NOT NULL,
    nudge_sent_at timestamptz NULL,
    nudge_claimed_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT glaze_pair_events_unique UNIQUE (cycle_date, user_a, user_b)
);

CREATE TABLE glaze_pair_queue (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cycle_date date NOT NULL,
    user_a text NOT NULL,
    user_b text NOT NULL,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    dm_channel_id text NULL,
    intro_ts text NULL,
    claimed_at timestamptz NULL,
    completed_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX glaze_pair_events_user_a_idx ON glaze_pair_events(user_a);
CREATE INDEX glaze_pair_events_user_b_idx ON glaze_pair_events(user_b);
CREATE INDEX glaze_pair_events_cycle_date_idx ON glaze_pair_events(cycle_date);
CREATE INDEX glaze_pair_events_nudge_idx ON glaze_pair_events(cycle_date, nudge_sent_at, nudge_claimed_at);

CREATE INDEX idx_glaze_user_preferences_last_synced_at ON glaze_user_preferences (last_synced_at ASC NULLS FIRST);
CREATE INDEX idx_glaze_user_preferences_active_users ON glaze_user_preferences (is_bot, deleted);

CREATE INDEX glaze_pair_queue_status_idx ON glaze_pair_queue(status, cycle_date);

-- ── Functions ─────────────────────────────────────────────────────────────────

-- Trigger function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    new.updated_at = now();
    RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Atomic claim function for pair queue batch processing
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

-- Atomic claim function for nudge batch processing
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

-- ── Triggers ──────────────────────────────────────────────────────────────────

CREATE TRIGGER glaze_user_preferences_updated_at
BEFORE UPDATE ON glaze_user_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- RLS is enabled for all tables. Access is granted only to the service role
-- through Edge Functions that handle their own authorization.

ALTER TABLE glaze_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE glaze_pair_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE glaze_pair_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to user preferences"
    ON glaze_user_preferences FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to pair events"
    ON glaze_pair_events FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to pair queue"
    ON glaze_pair_queue FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- ══════════════════════════════════════════════════════════════════════════════
-- Scheduled Jobs Configuration (pg_cron)
-- ══════════════════════════════════════════════════════════════════════════════
-- IMPORTANT: Replace these placeholders before running:
--   • oozkjnyhvrndobksdyld → your Supabase project ref
--   • YOUR_SUPABASE_ANON_KEY → anon key from Supabase dashboard
--   • YOUR_ADMIN_TRIGGER_TOKEN → match ADMIN_TRIGGER_TOKEN secret in Edge Functions
--
-- Uncomment the sections below after deploying your Edge Functions.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Matching Cycle Jobs ───────────────────────────────────────────────────────
-- Monday 08:00 UTC – Coordinator: compute matches and fill the queue

/*
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
*/

-- Monday 08:01–08:20 UTC – Workers: claim and send messages (20 workers)
-- Throughput: 20 workers × 50 pairs = 1,000 pairs per cycle

/*
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
*/

-- ── Nudge Jobs ────────────────────────────────────────────────────────────────
-- Thursday 08:00–08:19 UTC – Send nudges to silent pairs (20 workers)
-- Each claims 50 pairs → 20 × 50 = 1,000 pairs/Thursday

/*
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
*/

-- ── User Sync Jobs ────────────────────────────────────────────────────────────
-- Monday 5:00–7:59 UTC – Orchestrate user profile sync (every 3 minutes)
-- Fires every 3 minutes. Checks if any users are unsynced in the past 7 days;
-- if so, triggers sync-users (which runs for up to 130s within its own budget).
-- sync-users processes ~220 users per run at 100 req/min (Slack Tier 4).
-- 2,000 users fully synced in ~27 minutes across multiple orchestrator triggers.

/*
SELECT cron.schedule(
    'glaze-sync-orchestrator',
    '*/3 5-7 * * 1',
    $$
        SELECT net.http_post(
            url     := 'https://oozkjnyhvrndobksdyld.supabase.co/functions/v1/sync-orchestrator',
            headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY", "x-admin-token": "YOUR_ADMIN_TRIGGER_TOKEN"}'::jsonb
        );
    $$
);
*/

-- ── Cron Management ───────────────────────────────────────────────────────────
-- View all scheduled jobs:
-- SELECT * FROM cron.job;

-- View recent job executions:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Remove jobs (if needed):
-- SELECT cron.unschedule('glaze-queue-cycle');
-- SELECT cron.unschedule('glaze-sync-orchestrator');
-- DO $$
-- DECLARE i integer;
-- BEGIN
--     FOR i IN 1..20 LOOP
--         PERFORM cron.unschedule('glaze-run-cycle-' || i);
--         PERFORM cron.unschedule('glaze-run-nudges-' || i);
--     END LOOP;
-- END;
-- $$;
