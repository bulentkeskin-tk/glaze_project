# Glaze Installation Guide

This guide walks you through setting up Glaze in your own Slack workspace from scratch. Perfect for testing in a sandbox environment before deploying to production.

## What You'll Need

Before starting, make sure you have:

- A Slack workspace where you have admin permissions
- A Supabase account (free tier works fine)
- Python 3.11 or newer installed on your computer
- An OpenAI API key (optional, but recommended for AI-generated icebreakers)
- About 30 minutes

## Step 1: Set Up Your Supabase Database

Supabase is a free Postgres database that will store your user preferences and match history.

1. Go to [supabase.com](https://supabase.com) and sign up or log in
2. Click **"New Project"**
3. Choose an organization and give your project a name (e.g., "glaze-dev")
4. Set a strong database password and pick a region close to you
5. Wait 2-3 minutes for Supabase to provision your database

### Create the Database Tables

6. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
7. Click **"New Query"**
8. Open the file `supabase/schema.sql` from this repository and copy all its contents
9. Paste the SQL into the Supabase query editor
10. Click **"Run"** to create your tables

### Save Your Supabase Credentials

11. Click **"Project Settings"** (gear icon in the left sidebar)
12. Navigate to **"API"** in the settings menu
13. Copy and save these two values somewhere safe:
    - **URL** (like `https://xxxxx.supabase.co`)
    - **service_role key** (under "Project API keys" - this is the secret one, not the anon key)

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

## Step 3: Set Up Your Local Environment

Open your terminal and navigate to where you want to work on this project.

```bash
# Clone or navigate to your project directory
cd glaze_project

# Create a Python virtual environment
python -m venv .venv

# Activate it (Windows)
.venv\Scripts\activate

# Or activate it (Mac/Linux)
# source .venv/bin/activate

# Install all dependencies
pip install -r requirements.txt
```

## Step 4: Configure Your Environment Variables

1. Create a copy of the environment template:

```bash
# Windows
copy .env.example .env

# Mac/Linux
# cp .env.example .env
```

2. Open the `.env` file in your text editor and fill in these required values:

```env
# From Step 2 (Slack)
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here

# From Step 1 (Supabase)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Optional but recommended (OpenAI for AI icebreakers)
OPENAI_API_KEY=sk-your-openai-key-here

# You'll set this in the next step
GLAZE_DEFAULT_CHANNEL_ID=
```

### Get Your Channel ID

3. In Slack, create a test channel or use an existing one (e.g., `#glaze-test`)
4. Right-click the channel name and select **"Copy link"**
5. The URL looks like: `https://yourworkspace.slack.com/archives/C01234ABCDE`
6. The last part (`C01234ABCDE`) is your channel ID
7. Paste this into your `.env` file as `GLAZE_DEFAULT_CHANNEL_ID`

### Set an Admin Token

8. In your `.env` file, change `ADMIN_TRIGGER_TOKEN` to something secure:

```env
ADMIN_TRIGGER_TOKEN=some-random-secret-token-12345
```

This protects your admin endpoints from unauthorized access.

## Step 5: Expose Your Local Server to Slack

Slack needs to send events to your app, but your computer isn't accessible from the internet. We'll use a tunnel to expose your local server.

### Option A: Using ngrok (Recommended)

1. Download ngrok from [ngrok.com](https://ngrok.com)
2. In a **new terminal window**, run:

```bash
ngrok http 3000
```

3. You'll see a URL like `https://abc123.ngrok-free.app` - copy this

### Option B: Using Cloudflare Tunnel

1. Install Cloudflare Tunnel following their docs
2. Run: `cloudflare tunnel --url localhost:3000`
3. Copy the public URL provided

### Update Your Slack App URLs

4. Go back to [api.slack.com/apps](https://api.slack.com/apps) and select your app
5. In the left sidebar, click **"Event Subscriptions"**
6. Turn on **"Enable Events"**
7. In **Request URL**, enter: `https://your-ngrok-url.com/slack/events`
8. Wait for the green "Verified" checkmark
9. Click **"Save Changes"** at the bottom

10. In the left sidebar, click **"Interactivity & Shortcuts"**
11. Turn on **Interactivity**
12. In **Request URL**, enter: `https://your-ngrok-url.com/slack/interactivity`
13. Click **"Save Changes"**

14. In the left sidebar, click **"Slash Commands"**
15. For EACH command (`/glaze-off`, `/glaze-on`, etc.), click to edit it
16. Set **Request URL** to: `https://your-ngrok-url.com/slack/commands`
17. Click **"Save"**

## Step 6: Run Your App

You're ready! In your project terminal (with the virtual environment activated):

```bash
uvicorn app:app --reload --port 3000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:3000
INFO:     Application startup complete.
```

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

### Run Your First Matching Cycle (Manual Test)

11. Make sure you have at least **2 people** in your test channel
12. In your test channel, type `/glaze-run-now` and press Enter
13. The bot should create a group DM between pairs of users with an icebreaker question

**Important:** If you have an odd number of people, one person will be left unmatched. That's expected behavior.

### Check Thursday Nudges (Optional)

To test nudges without waiting until Thursday:

1. In your terminal, stop the app (Ctrl+C)
2. Edit `glaze/services/scheduler.py` and temporarily change line 93 from:
   ```python
   target_cycle = today - timedelta(days=3)
   ```
   to:
   ```python
   target_cycle = today
   ```
3. Restart the app: `uvicorn app:app --reload --port 3000`
4. Run a cycle with `/glaze-run-now`
5. Don't respond in the group DM
6. Call the nudge endpoint:
   ```bash
   curl -X POST http://localhost:3000/tasks/run-nudges \
     -H "X-Admin-Token: your-admin-token-here"
   ```
7. You should receive a nudge in the silent DM

## Step 8: What's Next?

### For Production Deployment

Once you're happy with testing locally, you'll want to:

1. **Deploy to a server**: Use AWS Lambda, Vercel, or any ASGI host (see README.md)
2. **Set up scheduled jobs**: Configure AWS EventBridge or Vercel Cron to call:
   - `/tasks/run-cycle` every Monday at 10 AM
   - `/tasks/run-nudges` every Thursday at 10 AM
3. **Update Slack URLs**: Point your Slack app to your production URL instead of ngrok
4. **Secure your secrets**: Use AWS Secrets Manager or similar instead of `.env` files

### Customization Options

You can customize behavior by editing `.env`:

- `GLAZE_DEFAULT_FREQUENCY` - Default matching cadence (weekly/biweekly/monthly)
- `GLAZE_CROSS_DEPARTMENT_WEIGHT` - Bonus score for cross-department matches (default: 20)
- `GLAZE_REPEAT_PENALTY_DAYS` - How strongly to avoid repeat pairings (default: 3650)

## Troubleshooting

**"URL verification failed"** when setting up Event Subscriptions:
- Make sure your app is running (`uvicorn app:app --reload --port 3000`)
- Make sure ngrok is running and hasn't expired
- Double-check the URL ends with `/slack/events`

**Bot doesn't respond to commands:**
- Check your terminal for errors
- Verify `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` are correct in `.env`
- Make sure you invited the bot to the channel

**"No matching engine" or database errors:**
- Verify your Supabase credentials in `.env`
- Check that you ran the `schema.sql` script successfully in Supabase
- Look at the Supabase logs in the dashboard

**AI icebreakers aren't working:**
- Verify your `OPENAI_API_KEY` is correct
- Check your OpenAI account has available credits
- The app will fall back to curated icebreakers if OpenAI fails

**Need help?**
Check the main README.md for architecture details, or review the code comments in the services folder.

## Success! 🎉

You now have Glaze running locally in your Slack workspace. Team members in your channel will be automatically enrolled, and you can trigger matching cycles whenever you want with `/glaze-run-now`.

When you're ready for production, deploy to a serverless platform and set up automated scheduling to make everything hands-off.
