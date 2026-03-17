from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from supabase import Client, create_client

from glaze.settings import get_settings


@dataclass
class UserPreference:
    slack_user_id: str
    is_active: bool
    frequency: str
    snooze_until: date | None
    department: str | None = None
    full_name: str | None = None


class Repository:
    def __init__(self) -> None:
        settings = get_settings()
        self.client: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    def upsert_user_preference(self, slack_user_id: str, **fields: Any) -> None:
        payload = {'slack_user_id': slack_user_id, **fields}
        self.client.table('glaze_user_preferences').upsert(payload, on_conflict='slack_user_id').execute()

    def get_user_preference(self, slack_user_id: str) -> UserPreference | None:
        result = (
            self.client.table('glaze_user_preferences')
            .select('*')
            .eq('slack_user_id', slack_user_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        row = result.data[0]
        return UserPreference(
            slack_user_id=row['slack_user_id'],
            is_active=row['is_active'],
            frequency=row['frequency'],
            snooze_until=date.fromisoformat(row['snooze_until']) if row.get('snooze_until') else None,
            department=row.get('department'),
            full_name=row.get('full_name'),
        )

    def list_preferences(self) -> list[UserPreference]:
        result = self.client.table('glaze_user_preferences').select('*').execute()
        prefs: list[UserPreference] = []
        for row in result.data or []:
            prefs.append(
                UserPreference(
                    slack_user_id=row['slack_user_id'],
                    is_active=row['is_active'],
                    frequency=row['frequency'],
                    snooze_until=date.fromisoformat(row['snooze_until']) if row.get('snooze_until') else None,
                    department=row.get('department'),
                    full_name=row.get('full_name'),
                )
            )
        return prefs

    def eligible_users_for_cycle(self, cycle_date: date, frequency: str | None = None) -> list[UserPreference]:
        prefs = self.list_preferences()
        eligible: list[UserPreference] = []
        for pref in prefs:
            if not pref.is_active:
                continue
            if pref.snooze_until and pref.snooze_until >= cycle_date:
                continue
            if frequency and pref.frequency != frequency:
                continue
            if self.should_include_user_in_cycle(pref.slack_user_id, pref.frequency, cycle_date):
                eligible.append(pref)
        return eligible

    def should_include_user_in_cycle(self, slack_user_id: str, frequency: str, cycle_date: date) -> bool:
        if frequency == 'weekly':
            return True
        latest = (
            self.client.table('glaze_pair_events')
            .select('cycle_date')
            .or_(f'user_a.eq.{slack_user_id},user_b.eq.{slack_user_id}')
            .order('cycle_date', desc=True)
            .limit(1)
            .execute()
        )
        if not latest.data:
            return True
        last_cycle = date.fromisoformat(latest.data[0]['cycle_date'])
        weeks = 2 if frequency == 'biweekly' else 4
        return cycle_date >= last_cycle + timedelta(weeks=weeks)

    def record_pair_event(
        self,
        cycle_date: date,
        user_a: str,
        user_b: str,
        dm_channel_id: str,
        intro_ts: str,
    ) -> None:
        payload = {
            'cycle_date': cycle_date.isoformat(),
            'user_a': user_a,
            'user_b': user_b,
            'dm_channel_id': dm_channel_id,
            'intro_ts': intro_ts,
            'nudge_sent_at': None,
        }
        self.client.table('glaze_pair_events').insert(payload).execute()

    def list_recent_pairs(self) -> list[dict[str, Any]]:
        result = self.client.table('glaze_pair_events').select('*').execute()
        return result.data or []

    def list_pairs_for_nudges(self, cycle_date: date) -> list[dict[str, Any]]:
        result = (
            self.client.table('glaze_pair_events')
            .select('*')
            .eq('cycle_date', cycle_date.isoformat())
            .is_('nudge_sent_at', 'null')
            .execute()
        )
        return result.data or []

    def mark_nudge_sent(self, pair_event_id: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.client.table('glaze_pair_events').update({'nudge_sent_at': now}).eq('id', pair_event_id).execute()
