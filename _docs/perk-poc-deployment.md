# Glaze — Perk Internal POC Deployment Plan

This document describes the current Glaze project and proposes changes to deploy it as an internal Proof of Concept (POC) at Perk. It also documents database data and risks.

**Deployment platform:** The POC will be deployed **fully on Supabase** (database, compute, and scheduling). Perk uses AWS for production workloads, but using Supabase for this POC will speed up delivery by keeping everything in one place. For the POC, the admin panel is removed; data is accessed by querying the DB via the Supabase Dashboard. A proper admin UI can be added in a second phase if the POC proves successful.

## Summary Checklist

| # | Action | Phase |
|---|--------|--------|
| 1 | **Migrate to Node.js:** Port the Glaze app from Python (FastAPI + Slack Bolt) to Node.js for Supabase Edge Functions (Deno/TypeScript). | POC |
| 2 | **Deploy fully on Supabase:** Create POC project; DB from `supabase/schema.sql`; Edge Functions for Slack + tasks only (no admin routes); pg_cron for run-cycle and run-nudges; secrets in Supabase. | POC |
| 3 | Document DB data (this doc, Section 3) and how to view it (Supabase Dashboard: Table Editor, SQL Editor). Share with security/compliance if needed. | POC |
| 4 | Harden secrets: strong `ADMIN_TRIGGER_TOKEN`, no secrets in repo; use Supabase Edge Function secrets (or project env). | POC |
| 5 | Configure Slack app request URLs to point at Supabase Edge Function URLs. | POC |
| 6 | (Optional) Move repo under Perk GitHub org; re-secure secrets and update docs. | Phase 2 |
| 7 | (Optional) If POC succeeds, add admin panel (e.g. Supabase Auth + allow-list) in a later phase. | Phase 2 |

---

## 1. Current Project Overview

### 1.1 What Glaze Is

**Glaze** is a lightweight Slack app that creates recurring 1-on-1 coffee chat matches (similar to Donut). Team members in a configured Slack channel are auto-enrolled; the app pairs them on a schedule and opens group DMs with AI-generated icebreakers.

### 1.2 Main Features

- **Auto-enrollment** of members in a configured Slack channel  
- **Opt in / opt out** and **snooze** (1–4 weeks) via slash commands and Home tab  
- **Configurable frequency** per user: weekly, bi-weekly, or monthly  
- **No-repeat matching** so the same pair is not matched again within a configurable window  
- **Cross-department prioritization** (optional) using Slack profile fields  
- **Automatic group DM** creation for each pair with an intro message  
- **AI-generated icebreakers** (OpenAI, with curated fallback)  
- **Thursday nudge** for pairs that have not exchanged messages yet  
- **No Slack message content** is stored in the database  

### 1.3 Tech Stack

| Layer        | Technology                          |
|-------------|--------------------------------------|
| Runtime     | Python 3.11+                         |
| Web / API   | FastAPI                              |
| Slack       | Slack Bolt for Python                |
| Database    | Supabase (PostgreSQL)                |
| AI (optional) | OpenAI for icebreakers            |
| Deployment  | **POC: Supabase** (DB, Edge Functions, pg_cron). Current code: ASGI (e.g. Mangum for Lambda). |

### 1.4 Architecture (High Level)

- **Slack users** interact via commands, events, and the Home tab → requests hit the **Glaze API** (FastAPI today; Edge Functions for POC).
- The API talks to **Supabase** for preferences and pair history, and to **OpenAI** (optional) for icebreakers.
- **Scheduled tasks** (`/tasks/run-cycle`, `/tasks/run-nudges`) are triggered by cron (e.g. Supabase `pg_cron` + `pg_net`) and protected by `X-Admin-Token`.
- **POC:** No in-app admin panel. Admins view data via the **Supabase Dashboard** (Table Editor, SQL Editor, optional DB views). See section 2.2.

### 1.5 Authentication (Current / POC)

- **Slack → Glaze:** Requests are verified with Slack’s **Signing Secret** (HMAC). Identity is the Slack user ID from the token/event; no separate user auth.
- **Scheduled endpoints** (`/tasks/run-cycle`, `/tasks/run-nudges`): Protected by `X-Admin-Token` header matching `ADMIN_TRIGGER_TOKEN`.
- **Admin data access (POC):** No admin panel or app auth. Access to user/pair data is by **Supabase project access** (dashboard login); see 2.2.

---

## 2. Proposed Changes for Perk POC

### 2.1 Deploy Fully on Supabase (DB, Compute, Scheduling)

**Goal:** Run the entire POC on Supabase so Perk can ship quickly without wiring AWS (Lambda, API Gateway, Secrets Manager, etc.). Perk’s standard is AWS; Supabase is an exception for this POC to reduce setup and ops.

**What runs on Supabase:**

| Component | Supabase offering | Notes |
|-----------|-------------------|--------|
| **Database** | Supabase Postgres | Existing `glaze_user_preferences` and `glaze_pair_events`; schema in `supabase/schema.sql`. |
| **Compute (API)** | Supabase Edge Functions | Handlers for Slack events/commands and task endpoints only (no admin routes). |
| **Scheduling** | pg_cron + pg_net | Already in schema: Monday run-cycle, Thursday run-nudges; call Edge Function URLs with `X-Admin-Token`. |
| **Secrets** | Supabase Edge Function secrets | Slack tokens, Supabase service role key, OpenAI key, admin trigger token. |

**API compute — current vs. target:**  
The app is currently **Python (FastAPI + Slack Bolt)**. Supabase Edge Functions are **Deno/TypeScript**. For the POC, the API must run on Supabase: the app will be **ported to Edge Functions**. Implement only Slack event/command handlers and `/tasks/run-cycle`, `/tasks/run-nudges` (no admin dashboard or auth). Use the Supabase JS client and Slack SDK from Deno. Data is viewed via the Supabase Dashboard (see 2.2).

**Deliverables:**

- Supabase project for POC: DB created from `supabase/schema.sql`, secrets configured.
- Edge Functions for Slack + tasks only (port of current Python app logic, excluding admin routes).
- pg_cron jobs pointing at the Edge Function base URL, with `X-Admin-Token` set.
- Brief runbook: how to deploy/update, where secrets live, how to view data (Supabase Dashboard).

---

### 2.2 Remove Admin Panel for POC; Access Data via Supabase Dashboard

**Goal:** Simplify the POC by **removing the admin panel** (and thus all admin auth). Instead, anyone who needs to inspect user or pair data does so by **querying the database via Supabase**. An in-app admin UI can be added in a **second phase** if the POC is successful.

**What Supabase offers for viewing data:**

- **Table Editor** — In the Supabase Dashboard, each table can be opened in a spreadsheet-like view: browse rows and columns, sort, and filter. No SQL required. Tables `glaze_user_preferences` and `glaze_pair_events` appear there after the schema is applied.
- **SQL Editor** — Run arbitrary SQL in the dashboard: ad-hoc queries, aggregations (e.g. counts by status, pairs per cycle), and execution history. Useful for one-off checks or replicating the kind of stats the current admin panel shows.
- **Database views (optional)** — PostgreSQL `CREATE VIEW` can define saved queries (e.g. active users count, pairs this month). Views show up in the Table Editor like tables, so admins can open them without writing SQL. Supabase does not provide a separate dashboard product (e.g. charts); the dashboard is the project UI with Table Editor + SQL Editor. For POC, browsing the two tables and running a few saved or ad-hoc queries is enough.

**Suggested approach:**

1. **Do not port** the admin routes (`/admin`, `/admin/login`, `/admin/logout`) to Edge Functions. Drop `ADMIN_DASHBOARD_PASSWORD` and any session logic from the ported code.
2. **Restrict data access** to people who have **Supabase project access** (dashboard login). Control who is a project member in Supabase (e.g. invite by email). No app-level auth for admin in the POC.
3. **Document** for the team: to view Glaze data, open the Supabase project, then Table Editor or SQL Editor; see Section 3 for table definitions. Optionally add a few example SQL queries or a view in the schema for common stats.
4. **Phase 2:** If the POC works and a dedicated admin UI is needed (e.g. charts, @perk.com-only access), add it then (e.g. Supabase Auth + admin allow-list, or a simple protected dashboard).


**Deliverables:**  
- No admin panel or admin auth in the POC codebase.  
- Runbook: how to open the Supabase project and use Table Editor / SQL Editor to inspect `glaze_user_preferences` and `glaze_pair_events`. Optionally: one or more DB views or saved SQL snippets for common checks.  
- Note in this doc that an admin panel is out of scope for POC and planned for phase 2 if needed.

---

### 2.3 Consider Moving the Repo Under Perk’s GitHub Organization (Phase 2)

**Goal:** Align ownership and access with Perk’s security and compliance by hosting the repo under the organization (e.g. `perk-inc/glaze` or similar).

**Why phase 2:**  
- Moving repos often involves **security and compliance** (SSO, branch protection, secrets, audit).  
- Doing this in a **second phase** keeps the POC unblocked: deploy and validate Glaze first, then move the repo once security and compliance are ready.

**Suggested approach for phase 2:**

1. Create (or use) a repo under the Perk GitHub org.
2. **Mirror or migrate** the code (new clone, push to org repo; or GitHub’s transfer/mirror tools).
3. **Secrets and CI:** Re-create or reconnect any secrets (e.g. Slack tokens, Supabase keys, `ADMIN_TRIGGER_TOKEN`) in the org’s preferred store (e.g. GitHub Actions secrets, Vercel/AWS env).
4. **Permissions:** Define who in Perk can push/maintain the repo; use org-level rules if applicable.
5. **Docs:** Update README and this doc with the new repo URL and any org-specific setup steps.

**Risks if done later:**  
- Code stays in a personal or non-org repo longer (access and audit may be less aligned with Perk policy).  
- No functional impact on the POC itself.

---

### 2.4 Document the Information Stored in the Database

See **Section 3** below for the full data inventory. Summary:

- **glaze_user_preferences:** Slack user ID, participation state, frequency, snooze date, optional department and full name, timestamps.
- **glaze_pair_events:** Cycle date, two Slack user IDs, DM channel ID, intro message timestamp, nudge timestamp, created_at.

No message content or PII beyond what’s listed is stored.

---

## 3. Database Data Documentation

Glaze uses two tables in Supabase (PostgreSQL). Schema is in `supabase/schema.sql`.

### 3.1 Table: `glaze_user_preferences`

Stores one row per Slack user who has interacted with Glaze (enrollment, Home tab, or slash commands).

| Column          | Type         | Description |
|-----------------|--------------|-------------|
| `slack_user_id` | `text` (PK)  | Slack user ID (e.g. `U01234ABCD`). Unique per workspace. |
| `is_active`     | `boolean`    | Whether the user is opted in (`true`) or opted out (`false`). |
| `frequency`     | `text`       | Matching cadence: `weekly`, `biweekly`, or `monthly`. |
| `snooze_until`   | `date` (nullable) | If set, user is excluded from matching until this date (inclusive). |
| `department`     | `text` (nullable) | From Slack profile (custom field). Used for cross-department matching. |
| `full_name`      | `text` (nullable) | Display name from Slack. |
| `created_at`     | `timestamptz`| First time the row was created. |
| `updated_at`     | `timestamptz`| Last time the row was updated (trigger-maintained). |

**Source of data:**  
- `slack_user_id`, `full_name`, `department`: from Slack API (e.g. on enrollment or when building Home tab).  
- `is_active`, `frequency`, `snooze_until`: set by user via slash commands or Home tab actions.

**Retention / sensitivity:**  
- Identifiers are Slack IDs and display names (no email in this table).  
- For a POC, you may want to document retention (e.g. “preferences and profile data kept for duration of POC”).

---

### 3.2 Table: `glaze_pair_events`

One row per pair per cycle: who was matched, which DM was created, and whether a nudge was sent.

| Column           | Type           | Description |
|------------------|----------------|-------------|
| `id`             | `bigint` (PK)  | Auto-generated identity. |
| `cycle_date`     | `date`         | Cycle (match run) date. |
| `user_a`         | `text`         | Slack user ID of first user in the pair. |
| `user_b`         | `text`         | Slack user ID of second user in the pair. |
| `dm_channel_id`  | `text`         | Slack DM channel ID for the group DM (e.g. `G01234ABCD`). |
| `intro_ts`       | `text`         | Slack message timestamp of the intro message in that DM. |
| `nudge_sent_at`  | `timestamptz` (nullable) | When the Thursday nudge was sent for this pair, if any. |
| `created_at`     | `timestamptz`  | When the row was inserted. |

**Unique constraint:** `(cycle_date, user_a, user_b)`.

**Source of data:**  
- Filled by the matching/scheduler service when a cycle runs; `nudge_sent_at` is set when the nudge job runs for that pair.

**What is not stored:**  
- No message body or conversation content. For nudges, the app may read recent conversation metadata from Slack to decide if anyone has replied, but it does not persist that content in the DB.

---

### 3.3 Data Summary for Compliance / Privacy

- **Identifiers:** Slack user IDs, Slack channel IDs, Slack message timestamps.  
- **Profile-like data:** Display name, department (from Slack).  
- **Behavioral/usage data:** Opt-in state, frequency, snooze, pair history, nudge status.  
- **POC data access:** No in-app admin UI; data is viewed via Supabase Dashboard (Table Editor / SQL Editor) by whoever has Supabase project access.  
- **Not stored:** Slack message content or content of DMs.

For the POC, you may want a short “Data stored by Glaze” section in your internal wiki or privacy notes, pointing to this document.

---

## 4. Risks for This POC

### 4.1 Authentication & Access

- **Supabase project access:** Anyone with access to the Supabase project (dashboard login) can view all user and pair data. For POC there is no in-app admin panel or app-level auth. **Mitigation:** Restrict Supabase project membership to the small set of people who need to inspect Glaze data; add a proper admin UI (e.g. Supabase Auth + allow-list) in phase 2 if the POC succeeds.
- **Task trigger token:** If `ADMIN_TRIGGER_TOKEN` is guessable or leaked, someone could trigger match cycles or nudge runs. **Mitigation:** Use a long random value, store in Supabase Edge Function secrets, and restrict who can configure pg_cron or invoke the task endpoints.

### 4.2 Data & Privacy

- **Slack IDs and names:** Stored in Supabase; in theory they could be linked to individuals. **Mitigation:** Document as above; ensure Supabase project and keys are restricted to Perk and POC scope.
- **Nudge logic:** The app may need to call Slack to check if a pair has chatted; only metadata is used and no content is stored. **Mitigation:** Keep current design (no persistence of message content) and note in internal docs.

### 4.3 Infrastructure & Ops (Supabase as POC Platform)

- **Supabase:** Project is single-tenant; DB and Edge Functions live in one project. Misconfiguration or key leak could expose all POC data. **Mitigation:** Use a dedicated Supabase project for this POC; rotate keys if compromise suspected; consider RLS for extra isolation.
- **Secrets:** Store Slack tokens, Supabase service role key, OpenAI key, and admin trigger token in **Supabase Edge Function secrets** (or Supabase project env), not in repo or client. **Mitigation:** Never commit real values; use Supabase dashboard or CLI for secrets.
- **Edge Function limits:** The API runs as Edge Functions; be aware of Supabase limits (e.g. execution time, memory, cold starts). Slack request timeouts may require tuning. **Mitigation:** Follow Supabase Edge Function best practices; keep handlers lean; consider splitting heavy work (e.g. run-cycle) across multiple invocations if needed.
- **Slack app scope:** App is installed in one workspace. If the Slack app is shared or misconfigured, other workspaces could be affected. **Mitigation:** Use a dedicated Slack app for Perk POC; follow Slack’s security best practices.
- **Perk uses AWS:** This POC runs on Supabase, not AWS. If Perk later standardizes on AWS-only, the app may need to be moved (e.g. Lambda + RDS or Aurora, Secrets Manager). **Mitigation:** Treat as POC; document the decision and any migration path if the POC becomes production.

### 4.4 Repo Location (Phase 2)

- **Delaying org move:** Code may live outside Perk’s GitHub org until phase 2, which can complicate access control and audit. **Mitigation:** Treat phase 2 as planned; once security is ready, move repo and re-secure secrets as in 2.3.

### 4.5 Product / Adoption

- **Odd number of users:** One person may be unmatched per cycle. **Mitigation:** Document in user-facing comms; consider “rotation” of who is left out (current logic aims for fairness).
- **Slack dependency:** Glaze only works where Slack is used. **Mitigation:** Acceptable for a Slack-centric POC; no change needed for POC scope.

