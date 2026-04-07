# Quick Start Guide: Glaze on Supabase

Get Glaze running in under 15 minutes.

## Prerequisites

- Supabase account ([sign up free](https://supabase.com))
- Slack workspace (admin access)
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- [Deno](https://deno.com) installed (for local development)

## Step 1: Create Supabase Project (2 min)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New project"
3. Choose name, database password, region
4. Wait for project to be ready (~1 minute)
5. Note your **project ref** from URL: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`

## Step 2: Set Up Database (2 min)

```bash
# Clone/navigate to project directory
cd glaze_project

# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations to create tables
supabase db push
```

## Step 3: Create Slack App (3 min)

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From an app manifest"
3. Select your workspace
4. Open `manifest/slack_manifest.yaml`
5. Replace `YOUR_PROJECT_REF` with your actual project ref
6. Paste the updated manifest
7. Click "Create"
8. Install app to workspace
9. Copy **Bot User OAuth Token** (starts with `xoxb-`)
10. Copy **Signing Secret** from Basic Information

## Step 4: Configure Secrets (2 min)

```bash
# Generate a secure admin token
ADMIN_TOKEN=$(openssl rand -hex 32)

# Set all secrets at once
supabase secrets set \
  SLACK_BOT_TOKEN="xoxb-your-token-here" \
  SLACK_SIGNING_SECRET="your-signing-secret-here" \
  GLAZE_DEFAULT_CHANNEL_ID="C1234567890" \
  ADMIN_TRIGGER_TOKEN="$ADMIN_TOKEN"

# Optional: Add OpenAI for AI icebreakers
supabase secrets set OPENAI_API_KEY="sk-your-key-here"
```

**Get your channel ID**: Right-click on channel → View channel details → Copy ID (bottom of dialog)

## Step 5: Deploy Edge Functions (2 min)

```bash
# Deploy all functions
supabase functions deploy slack-events
supabase functions deploy run-cycle
supabase functions deploy run-nudges
supabase functions deploy about --no-verify-jwt
```

## Step 6: Configure Scheduled Jobs (2 min)

1. Open Supabase dashboard → SQL Editor
2. Open `supabase/migrations/20260318000001_configure_cron.sql`
3. Replace placeholders:
   - `YOUR_PROJECT_REF` → your project ref
   - `YOUR_SUPABASE_ANON_KEY` → from Settings → API → anon public
   - `YOUR_ADMIN_TRIGGER_TOKEN` → same token from Step 4
4. Run the SQL

## Step 7: Test It (2 min)

```bash
# In Slack:
1. Type: /invite @Glaze  (in your target channel)
2. Open Glaze app home tab
3. Try: /glaze-on
4. Try: /glaze-run-now  (creates test pairs)
```

If you are a workspace admin, you will see an **Admin Stats** section at the bottom of the home tab.

## Verification Checklist

- [ ] `/glaze-on` command works
- [ ] Home tab shows your preferences
- [ ] `/glaze-run-now` creates a pair (if ≥2 active users)
- [ ] Bot sent intro message with icebreaker

## What Happens Next?

- **Monday 08:00 UTC**: Automatic matching cycle runs
- **Thursday 08:00 UTC**: Nudges sent to silent pairs
- **Users can**:
  - Adjust frequency (weekly/biweekly/monthly)
  - Snooze for 1-4 weeks
  - Opt out anytime

## Troubleshooting

**"Command failed" in Slack**
- Check Edge Function logs: Supabase dashboard → Edge Functions → Logs
- Verify secrets are set: `supabase secrets list`

**"No pairs created"**
- Need at least 2 active users
- Check users opted in via home tab

**Scheduled jobs not running**
- Verify pg_cron config: `SELECT * FROM cron.job;`

## Next Steps

**Customize:**
- Adjust schedule times in pg_cron SQL
- Change matching weights in secrets (GLAZE_CROSS_DEPARTMENT_WEIGHT)
- Add custom icebreakers in `_shared/icebreakers.ts`

**Monitor:**
- Edge Function logs (Supabase dashboard)
- Database queries (SQL Editor)
- Scheduled job history (`cron.job_run_details`)

**Scale:**
- Add more channels (update channel ID secret per deployment)
- Invite more users (free tier covers 500K requests/month)
- Customize matching algorithm (`_shared/matching.ts`)

## Support

- 📖 Full docs: [README.md](README.md)
- 🏗️ Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- 🐛 Issues: Check Edge Function logs first

---

**That's it! Glaze is now running on Supabase.** ☕
