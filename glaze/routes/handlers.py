from __future__ import annotations

from datetime import datetime, timedelta, timezone

from slack_bolt.async_app import AsyncApp
from slack_sdk.web.async_client import AsyncWebClient

from glaze.db.repository import Repository
from glaze.services.scheduler import SchedulerService
from glaze.ui.home_tab import build_home_view

VALID_FREQUENCIES = {'weekly', 'biweekly', 'monthly'}


def register_handlers(app: AsyncApp, repository: Repository) -> None:
    @app.event('app_home_opened')
    async def app_home_opened(event, client: AsyncWebClient, logger):
        user_id = event['user']
        pref = repository.get_user_preference(user_id)
        if not pref:
            repository.upsert_user_preference(user_id, is_active=True, frequency='biweekly')
            pref = repository.get_user_preference(user_id)
        await client.views_publish(user_id=user_id, view=build_home_view(pref))

    @app.action('set_frequency')
    async def set_frequency(ack, body, client: AsyncWebClient):
        await ack()
        user_id = body['user']['id']
        value = body['actions'][0]['selected_option']['value']
        repository.upsert_user_preference(user_id, frequency=value)
        pref = repository.get_user_preference(user_id)
        await client.views_publish(user_id=user_id, view=build_home_view(pref))

    @app.action('set_snooze')
    async def set_snooze(ack, body, client: AsyncWebClient):
        await ack()
        user_id = body['user']['id']
        weeks = int(body['actions'][0]['selected_option']['value'])
        snooze_until = None if weeks == 0 else (datetime.now(timezone.utc).date() + timedelta(weeks=weeks)).isoformat()
        repository.upsert_user_preference(user_id, snooze_until=snooze_until)
        pref = repository.get_user_preference(user_id)
        await client.views_publish(user_id=user_id, view=build_home_view(pref))

    @app.action('set_active')
    async def set_active(ack, body, client: AsyncWebClient):
        await ack()
        user_id = body['user']['id']
        repository.upsert_user_preference(user_id, is_active=True, snooze_until=None)
        pref = repository.get_user_preference(user_id)
        await client.views_publish(user_id=user_id, view=build_home_view(pref))

    @app.action('set_inactive')
    async def set_inactive(ack, body, client: AsyncWebClient):
        await ack()
        user_id = body['user']['id']
        repository.upsert_user_preference(user_id, is_active=False)
        pref = repository.get_user_preference(user_id)
        await client.views_publish(user_id=user_id, view=build_home_view(pref))

    @app.command('/glaze-off')
    async def glaze_off(ack, command, respond):
        await ack()
        repository.upsert_user_preference(command['user_id'], is_active=False)
        await respond('You are now opted out of Glaze.')

    @app.command('/glaze-on')
    async def glaze_on(ack, command, respond):
        await ack()
        repository.upsert_user_preference(command['user_id'], is_active=True, snooze_until=None)
        await respond('You are back in for Glaze.')

    @app.command('/glaze-frequency')
    async def glaze_frequency(ack, command, respond):
        await ack()
        parts = (command.get('text') or '').strip().lower().split()
        if len(parts) != 1 or parts[0] not in VALID_FREQUENCIES:
            await respond('Usage: /glaze-frequency weekly|biweekly|monthly')
            return
        repository.upsert_user_preference(command['user_id'], frequency=parts[0])
        await respond(f'Your Glaze frequency is now set to {parts[0]}.')

    @app.command('/glaze-snooze')
    async def glaze_snooze(ack, command, respond):
        await ack()
        text = (command.get('text') or '').strip()
        if text not in {'1', '2', '3', '4'}:
            await respond('Usage: /glaze-snooze 1|2|3|4')
            return
        weeks = int(text)
        until = (datetime.now(timezone.utc).date() + timedelta(weeks=weeks)).isoformat()
        repository.upsert_user_preference(command['user_id'], snooze_until=until)
        await respond(f'Glaze snoozed for {weeks} week(s), until {until}.')

    @app.command('/glaze-home')
    async def glaze_home(ack, command, client: AsyncWebClient, respond):
        await ack()
        pref = repository.get_user_preference(command['user_id'])
        await client.views_publish(user_id=command['user_id'], view=build_home_view(pref))
        await respond('Your Glaze Home tab has been refreshed.')

    @app.command('/glaze-run-now')
    async def glaze_run_now(ack, command, client: AsyncWebClient, respond):
        await ack()
        scheduler = SchedulerService(client, repository)
        result = await scheduler.run_cycle(command['channel_id'])
        await respond(f"Glaze run complete. Created {result['pairs_created']} pairs.")
