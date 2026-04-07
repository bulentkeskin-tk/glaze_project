# Glaze Installation Guide

This guide walks you through setting up Glaze in your own Slack workspace from scratch. Perfect for testing in a sandbox environment before deploying to production.

## What You'll Need

Before starting, make sure you have:

- A Slack workspace where you have admin permissions
- A Supabase account (free tier works fine)
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- [Deno](https://deno.com) installed (optional, only for local development)
- An OpenAI API key (optional, but recommended for AI-generated icebreakers)
- About 20 minutes

## Step 1: Set Up Your Supabase Project

Supabase will host your database and Edge Functions (serverless backend).

1. Go to [supabase.com](https://supabase.com) and sign up or log in
2. Click **"New Project"**
3. Choose an organization and give your project a name (e.g., "glaze-dev")
4. Set a strong database password and pick a region close to you
5. Wait 2-3 minutes for Supabase to provision your project
6. Once ready, note your **Project Reference ID** from the URL (e.g., `https://supabase.com/dashboard/project/abcdefghijk` → the ID is `abcdefghijk`)

### Install Supabase CLI

If you haven't already installed the Supabase CLI:

```bash
# macOS/Linux
brew install supabase/tap/supabase

# Windows (using Scoop)
scoop install supabase

# Or download from: https://github.com/supabase/cli/releases
```

### Link Your Project

7. Open your terminal in the `glaze_project` directory
8. Link to your Supabase project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

(Replace `YOUR_PROJECT_REF` with the ID you noted in step 6
6. In the file, **replace** every instance of `YOUR_PROJECT_REF` with your actual Supabase project reference
7. Copy the updated YAML content
8. Paste it into Slack (replacing all the YAML there)

## Step 2: Create the Database Tables

9. Run the database migrations:

```bash
supabase db push
```

This creates all necessary tables (`glaze_user_preferences`, `glaze_pair_events`) and enables pg_cron for scheduled jobs.

### Save Your Supabase Credentials

10. In the Supabase dashboard, click **"Project Settings"** (gear icon)
11. Navigate to **"API"** in the settings menu
12. Copy and save these values:
    - **URL** (like `https://xxxxx.supabase.co`)
    - **anon public** key (you'll need this for pg_cron later)
    - **service_role key** (secret key - keep this secure)

## Step 2: Create Your Slack App

Now let's create the Slack app that will power Glaze.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **"Create New App"**
2. Choose **"From an app manifest"**
3. Select your workspace from the dropdown
4. Switch to the **YAML tab**
5. Open `manifest/slack_manifest.yaml` from this repository and copy its entire contents
6. **Replace** all the YAML in Slack with what you just copied
7. Click **"Next"**, review the permissions, then click **"Create"**

### Install the App to Your Workspace

8. On the app settings page, click **"Install to Workspace"** (green button)
9. Review the permissions and click **"Allow"**

### Save Your Slack Credentials

10. In the left sidebar, click **"Basic Information"**
11. Scroll to **"App Credentials"** and copy your **Signing Secret** - save this
12. In the left sidebar, click **"OAuth & Permissions"**
13. Copy the **Bot User OAuth Token** (starts with `xoxb-`) - save this

## Step 3: Configure Edge Function Secrets

Edge Functions need access to your Slack and OpenAI credentials. We'll store these as Supabase secrets.

### Get Your Channel ID

First, you need your Slack channel ID:

1. In Slack, create or navigate to your test channel (e.g., `#glaze`)
2. Right-click the channel name and select **"Copy link"**
3. The URL looks like: `https://travelperk.slack.com/archives/C0AMVRJMUU9`
4. The last part (`C0AMVRJMUU9`) is your channel ID - save this

### Set All Secrets

Now set all the secrets at once:

```bash
# Generate a secure random token for admin endpoints
ADMIN_TOKEN=$(openssl rand -hex 32)

# Set all secrets (replace the values with your actual credentials)
supabase secrets set \
  SLACK_BOT_TOKEN="xoxb-your-token-here" \
  SLACK_SIGNING_SECRET="your-signing-secret-here" \
  GLAZE_DEFAULT_CHANNEL_ID="C1234567890" \
  ADMIN_TRIGGER_TOKEN="$ADMIN_TOKEN"

# Optional: Add OpenAI for AI-generated icebreakers
supabase secrets set OPENAI_API_KEY="sk-your-key-here"
```

**Important:** Save the `ADMIN_TRIGGER_TOKEN` value - you'll need it in Step 5.

You can verify secrets were set:

```bash
supabase secrets list
```

## Step 4: Deploy Edge Functions

Deploy all Edge Functions to Supabase:

```bash
supabase functions deploy slack-events
supabase functions deploy run-cycle
supabase functions deploy run-nudges
supabase functions deploy about --no-verify-jwt
```

You should see success messages for each deployment. Your functions are now live!

## Step 5: Configure Scheduled Jobs

Set up pg_cron to automatically run matching cycles every Monday and send nudges every Thursday.

1. In the Supabase dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Open `supabase/migrations/20260318000001_configure_cron.sql` from the project
4. In the SQL, replace these placeholders:
   - `YOUR_PROJECT_REF` → your Supabase project reference
   - `YOUR_SUPABASE_ANON_KEY` → your anon key from Step 1
   - `YOUR_ADMIN_TRIGGER_TOKEN` → the token generated in Step 3
5. Paste the updated SQL into Supabase and click **"Run"**

You can verify the jobs were created:

```sql
SELECT * FROM cron.job;
```

You should see two jobs: `glaze-run-cycle` and `glaze-run-nudges`.

## Step 7: Test Everything Works

### Invite the Bot to Your Channel

1. In Slack, go to your test channel
2. Type `/invite @Glaze` and press Enter
3. The bot should join the channel

### Open the Home Tab

4. In Slack's left sidebar, find **"Apps"** and click **Glaze**
5. You should see a home tab with your preferences (Status: Active, Frequency: Biweekly)
6. Try changing your frequency using the dropdown - it should update immediately

### Test Slash Commands

7. In any channel, type `/glaze-off` and press Enter
8. You should get a confirmation message
9. Check the home tab - your status should now be "Paused"
10. Type `/glaze-on` to re-activate
6: Test Everything Works

### Invite the Bot to Your Channel

1. In Slack, go to your test channel
2. Type `/invite @Glaze` and press Enter
3. The bot should join the channel

### Open the Home Tab

4. In Slack's left sidebar, find **"Apps"** and click **Glaze**
5. You should see a home tab with your preferences (Status: Active, Frequency: Biweekly)
6. Try changing your frequency using the dropdown - it should update immediately

### Test Slash Commands

7. In any channel, type `/glaze-off` and press Enter
8. You should get a confirmation message
9. Check the home tab - your status should now be "Paused"
10. Type `/glaze-on` to re-activate

### Run Your First Matching Cycle (Manual Test)

11. Make sure you have at least **2 people** in your test channel who are opted in
12. In your test channel, type `/glaze-run-now` and press Enter
13. The bot should create a group DM between pairs of users with an icebreaker question

**Important:** If you have an odd number of people, one person will be left unmatched. That's expected behavior.

### Check Admin Stats (Workspace Admins Only)

14. In Slack, open the **Glaze** app home tab
15. If you are a workspace admin or owner, you will see an **Admin Stats** section at the bottom showing user counts and total pairs created

### Test Scheduled Jobs (Optional)

To manually trigger the scheduled endpoints:

```bash
# Test the Monday cycle
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/run-cycle \
  -H "x-admin-token: YOUR_ADMIN_TRIGGER_TOKEN"

# Test Thursday nudges
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/run-nudges \
  -H "x-admin-token: YOUR_ADMIN_TRIGGER_TOKEN"
```e for cross-department matches (default: 20)
- `GLAZE_REPEAT_PENALTY_DAYS` - How strongly to avoid repeat pairings (default: 3650)

## Troubleshooting

**"URL v7: Monitor and Maintain

### View Logs

Check Edge Function logs in real-time:

```bash
supabase functions logs slack-events --follow
```

Or view logs in the Supabase dashboard: **Edge Functions** → Select function → **Logs**

### Monitor Scheduled Jobs

Check pg_cron job history:

```sql
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;
```

### Update Secrets
Slack says "URL verification failed" or commands don't work:**
- Check that you updated `YOUR_PROJECT_REF` in `slack_manifest.yaml`
- Verify Edge Functions are deployed: `supabase functions list`
- View function logs: `supabase functions logs slack-events`
- Ensure secrets are set: `supabase secrets list`
in production on Supabase! Team members in your channel will be automatically enrolled, and matching cycles will run every Monday at 08:00 UTC with Thursday nudges.

### What Happens Next

- **Monday 08:00 UTC**: Automatic matching cycle creates pairs
- **Thursday 08:00 UTC**: Nudges sent to silent pairs from Monday
- **Users can**: Adjust frequency, snooze, or opt out anytime via slash commands or home tab

### Optional: Local Development

If you want to develop locally:

1. Install Deno: https://deno.com
2. Start local Supabase: `supabase start`
3. Serve functions: `supabase functions serve --no-verify-jwt`
4. Use ngrok to expose locally: `ngrok http 54321`
5. Update Slack URLs temporarily to ngrok URL

See [README.md](../README.md) for full local development instructions
- Check Edge Function logs for errors
- Make sure you invited the bot to the channel
- Try redeploying: `supabase functions deploy slack-events`

**Database errors:**
- Verify migrations ran successfully: `supabase db diff`
- Check Supabase dashboard → **Database** → **Tables** for `glaze_user_preferences` and `glaze_pair_events`
- View database logs in Supabase dashboard

**Scheduled jobs not running:**
- Verify pg_cron is configured: `SELECT * FROM cron.job;`
- Check job execution history: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;`
- Ensure `ADMIN_TRIGGER_TOKEN` matches in both secrets and cron SQL

**AI icebreakers aren't working:**
- Verify `OPENAI_API_KEY` is set correctly
- Check your OpenAI account has available credits
- The app will fall back to curated icebreakers if OpenAI fails
- View logs to see the actual error

**Need help?**
- Check [README.md](../README.md) for full documentation
- Review [ARCHITECTURE.md](../ARCHITECTURE.md) for technical details
- View function logs for detailed error messages

# Change repeat penalty (days)
supabase secrets set GLAZE_REPEAT_PENALTY_DAYS="5000"

# Redeploy after changing settings
supabase functions deploy
```
**Need help?**
Check the main README.md for architecture details, or review the code comments in the services folder.

## Success! 🎉

You now have Glaze running locally in your Slack workspace. Team members in your channel will be automatically enrolled, and you can trigger matching cycles whenever you want with `/glaze-run-now`.

When you're ready for production, deploy to a serverless platform and set up automated scheduling to make everything hands-off.
