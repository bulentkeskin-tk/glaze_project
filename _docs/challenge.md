# Request For Build: Project "Glaze" (The Donut Replica)

> We love Donut, but it's way too expensive.

**Bounty: 3,500 EUR** to a team/person who builds a Donut alternative using AI co-pilot or fully vibe coded.

**Objective:** Build a lightweight, AI-assisted Slack integration that facilitates random 1-on-1 networking "coffee chats" within the company, bypassing the high per-seat costs of commercial alternatives.

---

## 1. User Preferences & Controls

### Opt-in / Opt-out Logic

- **Default State:** All users in a designated Slack channel are automatically "In."
- **The "Escape Hatch":** Users can type `/glaze-off` to pause or opt out entirely.

### Frequency Settings

Users can choose their cadence via a Slack Block Kit home tab or a simple command:

- Weekly
- Bi-weekly *(default)*
- Monthly

### Snooze Mode

Ability to pause matches for 1–4 weeks (for vacations or busy sprints).

---

## 2. The Matching Engine

- **The "No-Repeat" Logic:** The algorithm must prioritize pairing people who have never met, followed by those who haven't met in the longest time.
- **Cross-Department Logic *(Optional/Bonus)*:** If department data is available in Slack profiles, the algorithm should prioritize cross-functional matches over people in the same department.

---

## 3. User Experience (The "Vibe")

- **The Introduction:** At the start of the cycle (e.g., Monday 10:00 AM), the bot creates a Group DM for the pair.
- **Icebreakers:** The bot must post a randomly generated AI icebreaker question to kick off the chat (e.g., *"If you had to lead a 30-minute seminar on any topic with zero preparation, what would it be?"*).
- **The Nudge:** If the group DM has no activity by Thursday, the bot sends a gentle nudge in the DM to schedule the call.

---

## 4. Admin & Technical Requirements

| Area | Requirement |
|------|-------------|
| **Slack Manifest** | Provide a ready-to-use manifest for easy installation. |
| **Backend** | Preference for a serverless architecture (e.g., AWS Lambda, Vercel, or Cloudflare Workers) to keep hosting costs near zero. |
| **Database** | A simple Supabase or Firebase instance to track match history and user frequencies. |
| **Privacy** | No message data should be stored; the bot only tracks who met whom and when. |

---

## Delivery Requirements

- **Code Quality:** Must be "Vibe Coded" (readable, AI-extensible, and well-commented).
- **Documentation:** A simple README on how to rotate the API keys and change the matching schedule.
- **Timeline:** 14 days from kickoff.

---

## Success Criteria

- [ ] The bot successfully pairs 100% of active users in a test channel.
- [ ] Users can change their frequency via a Slack command and have it reflected in the next cycle.
- [ ] The "Group DM" creation triggers automatically without manual admin intervention.

---

*Open to everyone, not just builders.*
