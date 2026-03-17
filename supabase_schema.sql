create table if not exists glaze_user_preferences (
    slack_user_id text primary key,
    is_active boolean not null default true,
    frequency text not null default 'biweekly' check (frequency in ('weekly', 'biweekly', 'monthly')),
    snooze_until date null,
    department text null,
    full_name text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists glaze_pair_events (
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

create index if not exists glaze_pair_events_user_a_idx on glaze_pair_events(user_a);
create index if not exists glaze_pair_events_user_b_idx on glaze_pair_events(user_b);
create index if not exists glaze_pair_events_cycle_date_idx on glaze_pair_events(cycle_date);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

 drop trigger if exists glaze_user_preferences_updated_at on glaze_user_preferences;
 create trigger glaze_user_preferences_updated_at
 before update on glaze_user_preferences
 for each row execute function set_updated_at();
