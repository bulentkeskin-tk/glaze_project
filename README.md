# Glaze

Glaze is a lightweight Slack app that creates recurring 1-on-1 coffee chat matches, similar to Donut, built with TypeScript, Deno, and Supabase Edge Functions.

## Features

- Auto-enroll members of a configured Slack channel
- Opt out / opt in with slash commands
- Weekly / bi-weekly / monthly frequency per user
- 1-4 week snooze
- No-repeat matching logic
- Optional cross-department prioritization using Slack profile fields
- Automatic group DM creation for each pair
- AI-generated icebreakers
- Thursday nudge when a pair has not started talking yet
- No message content stored in the database
- Admin stats tab in Slack home (workspace admins only)

## Stack

- TypeScript + Deno runtime
- Supabase Edge Functions (serverless)
- Supabase (Postgres database)
- Slack Web API (@slack/web-api)
- OpenAI API (optional for icebreakers)
- pg_cron for scheduled jobs

## Project layout

- `supabase/functions/` - Edge Functions (serverless endpoints)
  - `slack-events/` - handles Slack events, commands, and interactions
  - `run-cycle/` - Monday matching job (triggered by pg_cron)
  - `run-nudges/` - Thursday nudge job (triggered by pg_cron)
  - `about/` - public info endpoint
  - `_shared/` - shared TypeScript modules
    - `types.ts` - TypeScript interfaces
    - `utils.ts` - utilities and settings
    - `repository.ts` - database access layer
    - `matching.ts` - pairing algorithm
    - `icebreakers.ts` - AI and fallback icebreakers
    - `scheduler.ts` - cycle runner and nudge logic
    - `home-tab.ts` - Slack home tab UI builder
- `supabase/migrations/` - database migrations
- `manifest/slack_manifest.yaml` - Slack app manifest
- `deno.json` - Deno configuration

## Environment variables

These are configured as Supabase Edge Function secrets. See setup steps below.

Required:

- `SLACK_BOT_TOKEN` - Slack bot token (starts with `xoxb-`)
- `SLACK_SIGNING_SECRET` - Slack signing secret for request verification
- `GLAZE_DEFAULT_CHANNEL_ID` - Default Slack channel ID to sync members from
- `SUPABASE_URL` - Supabase project URL (auto-provided)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (auto-provided)
- `ADMIN_TRIGGER_TOKEN` - Secret token for scheduled job endpoints

Optional:

- `OPENAI_API_KEY` - OpenAI API key for AI-generated icebreakers (falls back to hardcoded list)
- `GLAZE_DEFAULT_FREQUENCY` - default `biweekly` (weekly|biweekly|monthly)
- `GLAZE_CROSS_DEPARTMENT_WEIGHT` - default `20` (bonus points for cross-department pairs)
- `GLAZE_REPEAT_PENALTY_DAYS` - default `3650` (penalty for repeat pairings)

## Prerequisites

- [Deno](https://deno.com/) installed locally
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- A Supabase project (create at [supabase.com](https://supabase.com))
- A Slack workspace with admin permissions

## Local development

1. **Install Supabase CLI** (if not already installed):
   ```bash
   # macOS/Linux
   brew install supabase/tap/supabase
   
   # Windows
   scoop install supabase
   ```

2. **Initialize Supabase** (if starting fresh):
   ```bash
   supabase init
   ```

3. **Link to your Supabase project**:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. **Set up environment variables**:
   Create `.env` file in the `supabase/functions` directory:
   ```bash
   cp .env.example supabase/functions/.env
   # Edit .env with your actual values
   ```

5. **Start local Supabase** (includes database, Edge Functions runtime, etc.):
   ```bash
   supabase start
   ```

6. **Run migrations**:
   ```bash
   supabase db push
   ```

7. **Serve Edge Functions locally**:
   ```bash
   supabase functions serve --no-verify-jwt
   ```

8. **Expose local endpoints to Slack** (in another terminal):
   ```bash
   # Using ngrok
   ngrok http 54321
   
   # Or using Cloudflare Tunnel
   cloudflare tunnel --url http://localhost:54321
   ```

9. **Configure Slack** to point to your ngrok/tunnel URL:
   - Events: `https://YOUR-URL.ngrok.io/functions/v1/slack-events`
   - Commands: `https://YOUR-URL.ngrok.io/functions/v1/slack-events`
   - Interactivity: `https://YOUR-URL.ngrok.io/functions/v1/slack-events`

## Setup steps

1. **Create a Supabase project**:
   - Go to [supabase.com](https://supabase.com) and create a new project
   - Note your project ref (from the URL) and service role key (from Settings > API)

2. **Create a Slack app**:
   - Go to [api.slack.com/apps](https://api.slack.com/apps)
   - Click "Create New App" → "From an app manifest"
   - Paste the content from `manifest/slack_manifest.yaml`
   - **Important**: Update the request URLs in the manifest to point to your Supabase project:
     - Replace `YOUR_PROJECT_REF` with your actual project ref
     - URLs format: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/slack-events`
   - Install the app to your workspace
   - Note the bot token (starts with `xoxb-`) and signing secret

3. **Run database migrations**:
   ```bash
   supabase db push
   ```

4. **Configure Edge Function secrets**:
   ```bash
   # Set all required secrets
   supabase secrets set \
     SLACK_BOT_TOKEN=xoxb-your-token \
     SLACK_SIGNING_SECRET=your-secret \
     GLAZE_DEFAULT_CHANNEL_ID=C1234567890 \
     ADMIN_TRIGGER_TOKEN=$(openssl rand -hex 32)
   
   # Optional: Set OpenAI key
   supabase secrets set OPENAI_API_KEY=sk-your-key
   ```

5. **Deploy Edge Functions**:
   ```bash
   supabase functions deploy slack-events
   supabase functions deploy run-cycle
   supabase functions deploy run-nudges
   supabase functions deploy about --no-verify-jwt
   ```

6. **Configure scheduled jobs**:
   - Open Supabase SQL Editor
   - Run the SQL from `supabase/migrations/20260318000001_configure_cron.sql`
   - Update the placeholders:
     - `YOUR_PROJECT_REF` → your project ref
     - `YOUR_SUPABASE_ANON_KEY` → your anon key (from Settings > API)
     - `YOUR_ADMIN_TRIGGER_TOKEN` → same token from step 4

7. **Invite the bot to your Slack channel**:
   ```
   /invite @Glaze
   ```

8. **Test the setup**:
   - Open the Glaze app home tab in Slack
   - Try a slash command: `/glaze-on`
   - If you are a workspace admin, you will see the Admin Stats section at the bottom of the home tab

## Slash commands

- `/glaze-on` - opt back in
- `/glaze-off` - opt out
- `/glaze-frequency weekly|biweekly|monthly`
- `/glaze-snooze 1|2|3|4`
- `/glaze-home` - refreshes the Home tab
- `/glaze-run-now` - admin command to trigger a cycle manually

## Scheduling

Glaze uses Supabase's built-in `pg_cron` extension to trigger Edge Functions on a schedule:

- **Monday 08:00 UTC**: Runs `/run-cycle` to create coffee chat pairs
- **Thursday 08:00 UTC**: Runs `/run-nudges` to send reminders to silent pairs

The schedule is configured in `supabase/migrations/20260318000001_configure_cron.sql`.

### Adjusting the schedule

To change the schedule times, update the cron expressions in the SQL file:

```sql
-- Change to Monday 10:00 UTC
'0 10 * * 1'  -- Monday at 10:00

-- Change to Friday 09:00 UTC
'0 9 * * 5'   -- Friday at 09:00
```

Then run the SQL in Supabase SQL Editor to update the jobs.

### Monitoring scheduled jobs

View scheduled jobs and their execution history:

```sql
-- List all jobs
SELECT * FROM cron.job;

-- View recent executions
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;
```

## Rotating keys

All secrets are managed through Supabase CLI:

```bash
# Update a single secret
supabase secrets set SLACK_BOT_TOKEN=xoxb-new-token

# Update multiple secrets at once
supabase secrets set \
  SLACK_BOT_TOKEN=xoxb-new-token \
  OPENAI_API_KEY=sk-new-key

# View current secrets (values are hidden)
supabase secrets list

# After updating secrets, redeploy affected functions
supabase functions deploy slack-events
supabase functions deploy run-cycle
supabase functions deploy run-nudges
```

### Rotating specific keys

**Slack Bot Token:**
1. Generate new token in Slack app settings (OAuth & Permissions)
2. Update secret: `supabase secrets set SLACK_BOT_TOKEN=xoxb-new-token`
3. Redeploy: `supabase functions deploy`

**Admin Trigger Token:**
1. Generate new token: `openssl rand -hex 32`
2. Update secret: `supabase secrets set ADMIN_TRIGGER_TOKEN=new-token`
3. Update the pg_cron SQL and re-run it in the SQL Editor
4. Redeploy: `supabase functions deploy`

## Production deployment

Glaze is deployed entirely on Supabase using Edge Functions. No separate hosting needed.

```bash
# Deploy all functions at once
supabase functions deploy
supabase functions deploy about --no-verify-jwt

# Or deploy individually
supabase functions deploy slack-events
supabase functions deploy run-cycle
supabase functions deploy run-nudges
supabase functions deploy about --no-verify-jwt
```

### CI/CD Integration

You can automate deployments using GitHub Actions:

```yaml
name: Deploy to Supabase

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: supabase/setup-cli@v1
      - run: supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### Monitoring

- **Function Logs**: View in Supabase dashboard → Edge Functions → Logs
- **Database Logs**: Supabase dashboard → Database → Logs
- **Scheduled Job Status**: Query `cron.job_run_details` table
- **Error Tracking**: Consider integrating Sentry by adding the Sentry Deno SDK to functions

### Performance

- Edge Functions have **cold starts** (~100-500ms for first request)
- Database queries are fast (< 50ms typical)
- Slack API calls are the slowest part (200-500ms)
- Total cycle runtime for 50 users: ~30-60 seconds

### Costs

With Supabase free tier:
- ✅ Edge Functions: 500K requests/month included
- ✅ Database: 500MB included
- ✅ Auth: Unlimited

Expected usage for typical workspace (< 100 users):
- ~400 requests/week (Slack interactions + scheduled jobs)
- < 10MB database storage
- **Should stay within free tier indefinitely**
- dm channel id and intro timestamp

Glaze does **not** persist Slack message bodies.

For Thursday nudges, the app reads recent conversation history from Slack, checks whether any human message exists, and discards the content immediately.

## Deployment notes

### AWS Lambda

Use `Mangum` with API Gateway or Lambda Function URLs.

Handler:

```python
from app import handler
```

### Vercel / any ASGI host

Deploy as a Python ASGI app and expose the same endpoints.

## Success checklist

- [ ] App installs from manifest
- [ ] Slash commands work
- [ ] Home tab shows preferences
- [ ] Match cycle creates DMs for active users
- [ ] Frequency changes affect next cycle
- [ ] Thursday nudges send only for silent pairs

## Tradeoffs / notes

- If your workspace has an odd number of participants, one person will be left unmatched for the cycle. The algorithm rotates leftovers fairly over time.
- Department matching is best-effort because Slack profile field names differ by workspace.
- AI icebreakers fall back to a curated local list if OpenAI is unavailable.
- Edge Functions have cold starts (~100-500ms) but scheduled jobs run warm.

## Additional Documentation

- [QUICKSTART.md](QUICKSTART.md) - 15-minute setup guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture details
- [Supabase Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Manual](https://deno.land/manual)
