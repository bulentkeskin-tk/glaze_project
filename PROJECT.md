# Glaze - Coffee Chat Matching Bot

A lightweight Slack app for automated 1-on-1 coffee chat pairings, built with TypeScript, Deno, and Supabase Edge Functions.

## Project Structure

```
glaze_project/
├── supabase/
│   ├── functions/              # Edge Functions (serverless endpoints)
│   │   ├── slack-events/       # Main Slack webhook handler
│   │   ├── run-cycle/          # Monday matching job
│   │   ├── run-nudges/         # Thursday reminder job
│   │   ├── about/              # Public info endpoint
│   │   └── _shared/            # Shared TypeScript modules
│   ├── migrations/             # Database schema
│   └── config.toml             # Supabase configuration
├── manifest/
│   └── slack_manifest.yaml     # Slack app configuration
├── deno.json                   # Deno tasks and settings
├── .env.example                # Environment variable template
├── README.md                   # Full documentation
├── QUICKSTART.md              # Fast setup guide
└── ARCHITECTURE.md            # Technical details

```

## Quick Start

1. **Prerequisites**: Supabase account, Slack workspace, [Supabase CLI](https://supabase.com/docs/guides/cli)

2. **Setup Database**:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

3. **Configure Secrets**:
   ```bash
   supabase secrets set \
     SLACK_BOT_TOKEN="xoxb-..." \
     SLACK_SIGNING_SECRET="..." \
     GLAZE_DEFAULT_CHANNEL_ID="C..." \
     ADMIN_TRIGGER_TOKEN="$(openssl rand -hex 32)"
   ```

4. **Deploy**:
   ```bash
   supabase functions deploy
   ```

5. **Configure Slack**: Update `manifest/slack_manifest.yaml` with your project ref, then create app

See [QUICKSTART.md](QUICKSTART.md) for detailed instructions.

## Key Features

- ✅ Automatic weekly/biweekly/monthly matching
- ✅ Smart pairing algorithm (no repeats, cross-department priority)
- ✅ AI-generated icebreakers (with fallback)
- ✅ User preferences (frequency, snooze, opt-out)
- ✅ Admin stats tab in the Slack home tab (workspace admins only)
- ✅ Scheduled reminders for silent pairs
- ✅ Privacy-first (no message content stored)

## Tech Stack

- **Runtime**: TypeScript with Deno
- **Hosting**: Supabase Edge Functions (serverless)
- **Database**: PostgreSQL (Supabase)
- **Scheduling**: pg_cron (built-in)
- **APIs**: Slack Web API, OpenAI (optional)

## Development

**Local development**:
```bash
supabase start           # Start local Supabase
supabase functions serve # Serve functions locally
```

**Deploy changes**:
```bash
supabase functions deploy
```

**View logs**:
```bash
supabase functions logs slack-events --follow
```

## Documentation

- [README.md](README.md) - Complete documentation
- [QUICKSTART.md](QUICKSTART.md) - 15-minute setup
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture

## License

Built for the "Glaze" bounty challenge. See [_docs/challenge.md](_docs/challenge.md) for requirements.
