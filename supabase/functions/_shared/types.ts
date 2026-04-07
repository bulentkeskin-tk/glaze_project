// ── Shared Types for Glaze Application ──────────────────────────────────────

export interface UserPreference {
  slack_user_id: string;
  is_active: boolean;
  is_bot: boolean;
  deleted: boolean;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  snooze_until: string | null;
  full_name: string | null;
  department: string | null;  // populated from profile.title
  team_id: string | null;
  tz: string | null;
  is_restricted: boolean | null;
  is_app_user: boolean | null;
  status_text: string | null;
  last_synced_at: string | null;
}

export interface PairEvent {
  id: number;
  cycle_date: string;
  user_a: string;
  user_b: string;
  dm_channel_id: string;
  intro_ts: string;
  icebreaker: string | null;
  nudge_sent_at: string | null;
  created_at: string;
}

export interface Settings {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  slackBotToken: string;
  slackSigningSecret: string;
  glazeDefaultChannelId: string;
  openaiApiKey?: string;
  adminTriggerToken: string;
  glazeAdminUserIds: Set<string>;
  glazeDefaultFrequency: string;
  glazeCrossDepartmentWeight: number;
  glazeRepeatPenaltyDays: number;
  verbose: boolean;
}

export interface MatchingResult {
  pairs: Array<[UserPreference, UserPreference]>;
  leftovers: UserPreference[];
}

export interface PairQueueItem {
  id: number;
  cycle_date: string;
  user_a: string;
  user_b: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  retry_count: number;
  error_message: string | null;
  dm_channel_id: string | null;
  intro_ts: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface QueueCycleResult {
  cycle_date: string;
  eligible_users: number;
  pairs_queued: number;
  leftovers: string[];
}

export interface ProcessQueueResult {
  cycle_date: string | null;
  pairs_processed: number;
  pairs_failed: number;
  pairs: Array<{ channel: string; a: string; b: string }>;
}

export interface NudgeResult {
  target_cycle: string | null;
  nudges_sent: number;
  boosts_sent: number;
  channels: string[];
}

// Slack payload types
export interface SlackCommand {
  token: string;
  command: string;
  text: string;
  user_id: string;
  user_name: string;
  team_id: string;
  channel_id: string;
  response_url: string;
  trigger_id: string;
}

export interface SlackEvent {
  type: string;
  user?: string;
  channel?: string;
  tab?: string;
  view?: unknown;
  [key: string]: unknown;
}

export interface SlackAction {
  type: string;
  actions: Array<{
    action_id: string;
    block_id: string;
    type: string;
    selected_option?: {
      text: { type: string; text: string };
      value: string;
    };
    value?: string;
  }>;
  user: {
    id: string;
    username: string;
    name: string;
  };
  channel?: { id: string; name: string };
  message?: unknown;
  view?: unknown;
  response_url?: string;
  trigger_id?: string;
}

export interface SlackPayload {
  type: 'url_verification' | 'event_callback' | 'block_actions' | 'view_submission';
  token?: string;
  challenge?: string;
  event?: SlackEvent;
  payload?: string;
}
