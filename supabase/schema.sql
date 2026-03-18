-- ── Teardown (drop everything in safe dependency order) ──────────────────────
select cron.unschedule('glaze-run-cycle')  where exists (select 1 from cron.job where jobname = 'glaze-run-cycle');
select cron.unschedule('glaze-run-nudges') where exists (select 1 from cron.job where jobname = 'glaze-run-nudges');

drop trigger if exists glaze_user_preferences_updated_at on glaze_user_preferences;
drop function if exists set_updated_at();

drop table if exists glaze_pair_events;
drop table if exists glaze_user_preferences;

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Tables ────────────────────────────────────────────────────────────────────
create table glaze_user_preferences (
    slack_user_id text primary key,
    is_active boolean not null default true,
    frequency text not null default 'biweekly' check (frequency in ('weekly', 'biweekly', 'monthly')),
    snooze_until date null,
    department text null,
    full_name text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table glaze_pair_events (
    id bigint generated always as identity primary key,
    cycle_date date not null,
    user_a text not null,
    user_b text not null,
    dm_channel_id text not null,
    intro_ts text not null,
    nudge_sent_at timestamptz null,
    created_at timestamptz not null default now(),
    constraint glaze_pair_events_unique unique (cycle_date, user_a, user_b)
);

create index glaze_pair_events_user_a_idx on glaze_pair_events(user_a);
create index glaze_pair_events_user_b_idx on glaze_pair_events(user_b);
create index glaze_pair_events_cycle_date_idx on glaze_pair_events(cycle_date);

-- ── Trigger ───────────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger glaze_user_preferences_updated_at
before update on glaze_user_preferences
for each row execute function set_updated_at();

-- ── Scheduled jobs (pg_cron + pg_net) ────────────────────────────────────────
-- Run this block once in the Supabase SQL Editor after setting your APP_BASE_URL
-- and ADMIN_TRIGGER_TOKEN values below.

-- Monday 08:00 UTC – run the match cycle
select cron.schedule(
  'glaze-run-cycle',
  '0 8 * * 1',
  $$
    select net.http_post(
      url     := 'https://nonconvergent-dilative-michell.ngrok-free.dev/tasks/run-cycle',
      headers := '{"x-admin-token": "your-admin-trigger-token"}'::jsonb
    );
  $$
);

-- Thursday 08:00 UTC – send nudges to silent pairs
select cron.schedule(
  'glaze-run-nudges',
  '0 8 * * 4',
  $$
    select net.http_post(
      url     := 'https://nonconvergent-dilative-michell.ngrok-free.dev/tasks/run-nudges',
      headers := '{"x-admin-token": "your-admin-trigger-token"}'::jsonb
    );
  $$
);

-- To inspect scheduled jobs:      select * from cron.job;
-- To inspect recent run results:  select * from cron.job_run_details order by start_time desc limit 20;
-- To remove a job:                select cron.unschedule('glaze-run-cycle');
