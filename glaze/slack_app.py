from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException
from slack_bolt.adapter.fastapi.async_handler import AsyncSlackRequestHandler
from slack_bolt.async_app import AsyncApp

from glaze.db.repository import Repository
from glaze.routes.handlers import register_handlers
from glaze.services.scheduler import SchedulerService
from glaze.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    repository = Repository()

    slack_app = AsyncApp(token=settings.slack_bot_token, signing_secret=settings.slack_signing_secret)
    register_handlers(slack_app, repository)
    slack_handler = AsyncSlackRequestHandler(slack_app)

    app = FastAPI(title='Glaze')

    @app.get('/health')
    async def health() -> dict:
        return {'ok': True}

    @app.post('/slack/events')
    async def slack_events(req):
        return await slack_handler.handle(req)

    @app.post('/slack/commands')
    async def slack_commands(req):
        return await slack_handler.handle(req)

    @app.post('/slack/interactivity')
    async def slack_interactivity(req):
        return await slack_handler.handle(req)

    @app.post('/tasks/run-cycle')
    async def run_cycle(x_admin_token: str = Header(default='')) -> dict:
        if x_admin_token != settings.admin_trigger_token:
            raise HTTPException(status_code=401, detail='Unauthorized')
        scheduler = SchedulerService(slack_app.client, repository)
        return await scheduler.run_cycle(settings.glaze_default_channel_id)

    @app.post('/tasks/run-nudges')
    async def run_nudges(x_admin_token: str = Header(default='')) -> dict:
        if x_admin_token != settings.admin_trigger_token:
            raise HTTPException(status_code=401, detail='Unauthorized')
        scheduler = SchedulerService(slack_app.client, repository)
        return await scheduler.run_nudges()

    return app
