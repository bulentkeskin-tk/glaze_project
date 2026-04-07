# Project Architecture

## Overview

Glaze is a TypeScript/Deno application running entirely on Supabase Edge Functions. This provides:

- ✅ **Zero server management** - fully serverless
- ✅ **Lower costs** - free tier covers most workspaces
- ✅ **Better performance** - edge deployment closer to users
- ✅ **Simpler deployment** - single command deploy
- ✅ **Built-in scheduling** - pg_cron for automated jobs

## Architecture

### Stack
- **Runtime**: TypeScript with Deno
- **Hosting**: Supabase Edge Functions (serverless)
- **Database**: Supabase Postgres
- **Scheduling**: pg_cron (built-in)
- **Slack API**: @slack/web-api
- **AI**: OpenAI API (optional)

### File Structure

```
glaze_project/
├── supabase/
│   ├── functions/
│   │   ├── slack-events/index.ts      # Slack webhook handler
│   │   ├── run-cycle/index.ts         # Monday matching job
│   │   ├── run-nudges/index.ts        # Thursday nudge job
│   │   ├── about/index.ts             # Public info endpoint
│   │   └── _shared/                   # Shared modules
│   │       ├── types.ts               # TypeScript interfaces
│   │       ├── utils.ts               # Utilities
│   │       ├── repository.ts          # Database layer
│   │       ├── matching.ts            # Pairing algorithm
│   │       ├── icebreakers.ts         # AI icebreakers
│   │       ├── scheduler.ts           # Cycle logic
│   │       └── home-tab.ts            # Slack UI
│   ├── migrations/
│   │   ├── 20260318000000_initial_schema.sql
│   │   └── 20260318000001_configure_cron.sql
│   └── config.toml
├── manifest/
│   └── slack_manifest.yaml            # Slack app config
├── deno.json                          # Deno configuration
├── .env.example                       # Environment template
├── README.md                          # Full documentation
└── QUICKSTART.md                      # 15-min setup guide
```

### Edge Functions

Four Edge Functions handle all functionality:

1. **`slack-events`** - Handles all Slack interactions (events, commands, actions)
2. **`run-cycle`** - Monday matching job (called by pg_cron)
3. **`run-nudges`** - Thursday nudge job (called by pg_cron)
4. **`about`** - Public endpoint returning app version as JSON

### Dependencies

All dependencies are imported directly in code using npm: specifiers:
- `@supabase/supabase-js@2` - Database client
- `@slack/web-api@7` - Slack API
- `openai` - AI icebreakers (optional)

No package.json or node_modules needed - Deno handles everything.

### Environment Variables

Managed via Supabase secrets:
```bash
supabase secrets set SLACK_BOT_TOKEN=xoxb-...
supabase secrets set SLACK_SIGNING_SECRET=...
# etc.
```

All secrets are injected into Edge Functions at runtime.

### Scheduling

Built-in pg_cron calls Edge Functions directly:
- **Monday 08:00 UTC**: `/run-cycle` creates coffee chat pairs
- **Thursday 08:00 UTC**: `/run-nudges` sends reminders

Configured via SQL migration in `supabase/migrations/`.

### Admin Stats

Workspace admins and owners see an additional **Admin Stats** section at the bottom of the Glaze home tab in Slack. This section shows:
- Total users, active, snoozed, opted-out counts
- Total pairs created

No separate login or web UI needed — stats are surfaced directly inside Slack.

## Getting Started

Follow the [QUICKSTART.md](QUICKSTART.md) guide for deployment.

## Testing Checklist

After deployment, verify:

- [ ] Slash commands work (`/glaze-on`, `/glaze-off`, etc.)
- [ ] Home tab displays correctly
- [ ] Frequency and snooze settings save properly
- [ ] Manual cycle run creates pairs (`/glaze-run-now`)
- [ ] Scheduled Monday cycle runs automatically
- [ ] Thursday nudges send to silent pairs
- [ ] Admin stats visible in home tab (for workspace admins)
- [ ] Icebreakers generate (or fall back to hardcoded list)
- [ ] User sync from channel works
- [ ] Cross-department matching works (if configured)

## Rollback Plan

If issues arise, you can quickly roll back:

1. Re-deploy Python version to original host
2. Key Benefits

1. **Cost Savings**
   - Supabase free tier covers most workspaces
   - No infrastructure costs
   - No server maintenance

2. **Simplified Operations**
   - Single command deployment
   - Built-in logs and monitoring
   - No DevOps required

3. **Better Developer Experience**
   - TypeScript type safety
   - Fast local development (`supabase start`)
   - Hot reload in development

4. **Performance**
   - Edge deployment (low latency)
   - Efficient database queries
   - Automatic scaling

5. **Maintenance**
   - Fewer dependencies
   - Clean code structure
   - Easy to extend

## Common Tasks

**Deploy changes:**
```bash
supabase functions deploy
```

**View logs:**
```bash
supabase functions logs slack-events
```

**Update secrets:**
```bash
supabase secrets set KEY=value
```

**Run migrations:**
```bash
supabase db push
```

**Local development:**
```bash
supabase start
supabase functions serve
```

## Resources

- [README.md](README.md) - Full documentation
- [QUICKSTART.md](QUICKSTART.md) - 15-minute setup guide
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Manual](https://deno.land/manual)