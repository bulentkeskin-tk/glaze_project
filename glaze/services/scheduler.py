from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from slack_sdk.web.async_client import AsyncWebClient

from glaze.db.repository import Repository
from glaze.services.icebreakers import IcebreakerService
from glaze.services.matching import MatchingService


class SchedulerService:
    def __init__(self, client: AsyncWebClient, repository: Repository) -> None:
        self.client = client
        self.repository = repository
        self.icebreakers = IcebreakerService()

    async def sync_channel_members(self, channel_id: str) -> None:
        cursor = None
        while True:
            response = await self.client.conversations_members(channel=channel_id, cursor=cursor, limit=200)
            for user_id in response['members']:
                user_info = await self.client.users_info(user=user_id)
                user = user_info['user']
                if user.get('is_bot') or user.get('deleted'):
                    continue
                profile = user.get('profile', {})
                department = self._extract_department(profile)
                self.repository.upsert_user_preference(
                    user_id,
                    is_active=True,
                    frequency='biweekly',
                    department=department,
                    full_name=profile.get('real_name') or profile.get('display_name') or user_id,
                )
            cursor = response.get('response_metadata', {}).get('next_cursor')
            if not cursor:
                break

    async def run_cycle(self, channel_id: str) -> dict:
        today = datetime.now(timezone.utc).date()
        await self.sync_channel_members(channel_id)
        pair_history = self.repository.list_recent_pairs()
        matching = MatchingService(pair_history)

        all_eligible = self.repository.eligible_users_for_cycle(today)
        pairs, leftovers = matching.make_pairs(all_eligible, today)

        created = []
        for a, b in pairs:
            dm = await self.client.conversations_open(users=[a.slack_user_id, b.slack_user_id])
            channel = dm['channel']['id']
            icebreaker = self.icebreakers.get_icebreaker()
            intro = await self.client.chat_postMessage(
                channel=channel,
                text=(
                    f"👋 You two have been matched for this Glaze coffee chat.\n\n"
                    f"<@{a.slack_user_id}> + <@{b.slack_user_id}>\n\n"
                    f"*Icebreaker:* {icebreaker}"
                ),
            )
            self.repository.record_pair_event(today, a.slack_user_id, b.slack_user_id, channel, intro['ts'])
            created.append({'channel': channel, 'a': a.slack_user_id, 'b': b.slack_user_id})

        return {
            'cycle_date': today.isoformat(),
            'eligible_users': len(all_eligible),
            'pairs_created': len(created),
            'leftovers': [u.slack_user_id for u in leftovers],
            'pairs': created,
        }

    async def run_nudges(self) -> dict:
        today = datetime.now(timezone.utc).date()
        target_cycle = today - timedelta(days=3)
        pair_rows = self.repository.list_pairs_for_nudges(target_cycle)
        nudged = []
        for row in pair_rows:
            history = await self.client.conversations_history(channel=row['dm_channel_id'], oldest=row['intro_ts'], limit=20)
            human_messages = [
                m for m in history['messages']
                if m.get('user') in {row['user_a'], row['user_b']} and m.get('subtype') is None
            ]
            if human_messages:
                continue
            await self.client.chat_postMessage(
                channel=row['dm_channel_id'],
                text='☕ Friendly nudge: looks like this chat has not started yet. Maybe pick a time before the week gets away from you?',
            )
            self.repository.mark_nudge_sent(row['id'])
            nudged.append(row['dm_channel_id'])
        return {'target_cycle': target_cycle.isoformat(), 'nudges_sent': len(nudged), 'channels': nudged}

    @staticmethod
    def _extract_department(profile: dict) -> str | None:
        if profile.get('department'):
            return profile['department']
        fields = profile.get('fields') or {}
        for field in fields.values():
            label = (field.get('label') or '').lower()
            if 'department' in label or 'team' in label:
                return field.get('value')
        return None
