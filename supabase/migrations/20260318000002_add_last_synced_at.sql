-- Add last_synced_at to track when each user's Slack profile was last synced
ALTER TABLE glaze_user_preferences
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- Index for efficient ORDER BY last_synced_at ASC NULLS FIRST in the sync job
CREATE INDEX IF NOT EXISTS idx_glaze_user_preferences_last_synced_at
  ON glaze_user_preferences (last_synced_at ASC NULLS FIRST);
