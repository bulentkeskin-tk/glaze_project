// ── Repository: Database Access Layer ───────────────────────────────────────

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { PairEvent, PairQueueItem, UserPreference } from './types.ts';
import { addWeeks, parseDate, today } from './utils.ts';

export class Repository {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseServiceRoleKey: string) {
    this.client = createClient(supabaseUrl, supabaseServiceRoleKey);
  }

  // ── User Preferences ─────────────────────────────────────────────────────

  async upsertUserPreference(slackUserId: string, fields: Partial<UserPreference>): Promise<void> {
    const payload = { slack_user_id: slackUserId, ...fields };
    const { error } = await this.client
      .from('glaze_user_preferences')
      .upsert(payload, { onConflict: 'slack_user_id' });

    if (error) {
      console.error('Error upserting user preference:', error);
      throw new Error(`Failed to upsert user preference: ${error.message}`);
    }
  }

  async getUserPreference(slackUserId: string): Promise<UserPreference | null> {
    const { data, error } = await this.client
      .from('glaze_user_preferences')
      .select('*')
      .eq('slack_user_id', slackUserId)
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      console.error('Error fetching user preference:', error);
      throw new Error(`Failed to fetch user preference: ${error.message}`);
    }

    return data as UserPreference;
  }

  async listPreferences(): Promise<UserPreference[]> {
    const { data, error } = await this.client
      .from('glaze_user_preferences')
      .select('*')
      .eq('is_bot', false)
      .eq('deleted', false)
      .not('status_text', 'ilike', '%vacation%')
      .not('status_text', 'ilike', '%out%')
      .not('status_text', 'ilike', '%OOO%')
      .not('status_text', 'ilike', '%leave%')
      .not('status_text', 'ilike', '%back%')
      .not('status_text', 'ilike', '%pto%');

    if (error) {
      console.error('Error listing preferences:', error);
      throw new Error(`Failed to list preferences: ${error.message}`);
    }

    return (data || []) as UserPreference[];
  }

  async eligibleUsersForCycle(cycleDate: string, frequency?: string): Promise<UserPreference[]> {
    // Two parallel queries instead of 1 + N sequential queries
    const [prefs, recentPairs] = await Promise.all([
      this.listPreferences(),
      this.listRecentPairs(4), // 4 weeks covers all frequencies (weekly=1, biweekly=2, monthly=4)
    ]);

    // Build userId -> most recent cycle_date map entirely in memory
    const lastPaired = new Map<string, string>();
    for (const row of recentPairs) {
      const update = (userId: string) => {
        const current = lastPaired.get(userId);
        if (!current || row.cycle_date > current) lastPaired.set(userId, row.cycle_date);
      };
      update(row.user_a);
      update(row.user_b);
    }

    const eligible: UserPreference[] = [];

    for (const pref of prefs) {
      if (!pref.is_active) continue;
      if (pref.snooze_until && pref.snooze_until >= cycleDate) continue;
      if (frequency && pref.frequency !== frequency) continue;

      const lastCycleDate = lastPaired.get(pref.slack_user_id);
      if (!lastCycleDate) {
        // Never paired — always eligible
        eligible.push(pref);
        continue;
      }

      const weeks = pref.frequency === 'weekly' ? 1 : pref.frequency === 'biweekly' ? 2 : 4;
      const requiredDate = addWeeks(parseDate(lastCycleDate), weeks);
      if (cycleDate >= requiredDate) {
        eligible.push(pref);
      }
    }

    return eligible;
  }

  async listUsersForSync(limit: number): Promise<UserPreference[]> {
    const { data, error } = await this.client
      .from('glaze_user_preferences')
      .select('*')
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .limit(limit);
    // Note: intentionally does NOT filter is_bot/deleted so we can sync and update those fields

    if (error) {
      console.error('Error listing users for sync:', error);
      throw new Error(`Failed to list users for sync: ${error.message}`);
    }

    return (data || []) as UserPreference[];
  }

  async countUsersNeedingSync(withinDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await this.client
      .from('glaze_user_preferences')
      .select('*', { count: 'exact', head: true })
      .eq('is_bot', false)
      .eq('deleted', false)
      .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`);

    if (error) {
      console.error('Error counting users needing sync:', error);
      throw new Error(`Failed to count users needing sync: ${error.message}`);
    }

    return count ?? 0;
  }

  async registerNewMembers(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    const payload = userIds.map((id) => ({
      slack_user_id: id,
      is_active: true,
      frequency: 'biweekly' as const,
    }));

    const { error } = await this.client
      .from('glaze_user_preferences')
      .upsert(payload, { onConflict: 'slack_user_id', ignoreDuplicates: true });

    if (error) {
      console.error('Error registering new members:', error);
      throw new Error(`Failed to register new members: ${error.message}`);
    }
  }

  // ── Pair Queue ────────────────────────────────────────────────────────────

  async createPairQueue(cycleDate: string, pairs: Array<[UserPreference, UserPreference]>): Promise<void> {
    // Clear stuck items from any previous unfinished run before inserting fresh ones
    await this.client
      .from('glaze_pair_queue')
      .delete()
      .neq('cycle_date', cycleDate)
      .in('status', ['pending', 'processing']);

    if (pairs.length === 0) return;

    const payload = pairs.map(([a, b]) => ({
      cycle_date: cycleDate,
      user_a: a.slack_user_id,
      user_b: b.slack_user_id,
      status: 'pending',
    }));

    const { error } = await this.client.from('glaze_pair_queue').insert(payload);
    if (error) {
      console.error('Error creating pair queue:', error);
      throw new Error(`Failed to create pair queue: ${error.message}`);
    }
  }

  async claimQueueBatch(batchSize: number): Promise<PairQueueItem[]> {
    const { data, error } = await this.client.rpc('claim_pair_queue_batch', { p_batch_size: batchSize });
    if (error) {
      console.error('Error claiming queue batch:', error);
      throw new Error(`Failed to claim queue batch: ${error.message}`);
    }
    return (data || []) as PairQueueItem[];
  }

  async markQueueItemDone(id: number, dmChannelId: string, introTs: string): Promise<void> {
    const { error } = await this.client
      .from('glaze_pair_queue')
      .update({ status: 'done', dm_channel_id: dmChannelId, intro_ts: introTs, completed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to mark queue item done: ${error.message}`);
  }

  async markQueueItemFailed(id: number): Promise<void> {
    const { error } = await this.client
      .from('glaze_pair_queue')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to mark queue item failed: ${error.message}`);
  }

  // ── Pair Events ──────────────────────────────────────────────────────────

  async recordPairEvent(
    cycleDate: string,
    userA: string,
    userB: string,
    dmChannelId: string,
    introTs: string,
  ): Promise<void> {
    const payload = {
      cycle_date: cycleDate,
      user_a: userA,
      user_b: userB,
      dm_channel_id: dmChannelId,
      intro_ts: introTs,
      nudge_sent_at: null,
    };

    const { error } = await this.client.from('glaze_pair_events').insert(payload);

    if (error) {
      console.error('Error recording pair event:', error);
      throw new Error(`Failed to record pair event: ${error.message}`);
    }
  }

  async listRecentPairs(weeks = 8): Promise<PairEvent[]> {
    const cutoffDate = addWeeks(parseDate(today()), -weeks);
    
    const { data, error } = await this.client
      .from('glaze_pair_events')
      .select('*')
      .gte('cycle_date', cutoffDate)
      .order('cycle_date', { ascending: false });

    if (error) {
      console.error('Error listing recent pairs:', error);
      throw new Error(`Failed to list recent pairs: ${error.message}`);
    }

    return (data || []) as PairEvent[];
  }

  async listPairsForNudges(cycleDate: string): Promise<PairEvent[]> {
    const { data, error } = await this.client
      .from('glaze_pair_events')
      .select('*')
      .eq('cycle_date', cycleDate)
      .is('nudge_sent_at', null);

    if (error) {
      console.error('Error listing pairs for nudges:', error);
      throw new Error(`Failed to list pairs for nudges: ${error.message}`);
    }

    return (data || []) as PairEvent[];
  }

  async claimNudgeBatch(cycleDate: string, batchSize: number): Promise<PairEvent[]> {
    const { data, error } = await this.client.rpc('claim_nudge_batch', {
      p_cycle_date: cycleDate,
      p_batch_size: batchSize,
    });
    if (error) {
      console.error('Error claiming nudge batch:', error);
      throw new Error(`Failed to claim nudge batch: ${error.message}`);
    }
    return (data || []) as PairEvent[];
  }

  async markNudgeSent(pairEventId: number): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client
      .from('glaze_pair_events')
      .update({ nudge_sent_at: now })
      .eq('id', pairEventId);

    if (error) {
      console.error('Error marking nudge sent:', error);
      throw new Error(`Failed to mark nudge sent: ${error.message}`);
    }
  }

  // ── Admin Stats ──────────────────────────────────────────────────────────

  async getAdminStats(): Promise<{
    users: { total: number; active: number; snoozed: number; opted_out: number };
    pairs: { total: number };
  }> {
    const todayStr = today();
    const prefs = await this.listPreferences();

    const active = prefs.filter(
      (p) => p.is_active && (!p.snooze_until || p.snooze_until < todayStr),
    ).length;
    const snoozed = prefs.filter(
      (p) => p.is_active && p.snooze_until && p.snooze_until >= todayStr,
    ).length;
    const opted_out = prefs.filter((p) => !p.is_active).length;

    const { count, error } = await this.client
      .from('glaze_pair_events')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Error counting pair events:', error);
      throw new Error(`Failed to count pair events: ${error.message}`);
    }

    return {
      users: { total: prefs.length, active, snoozed, opted_out },
      pairs: { total: count ?? 0 },
    };
  }
}
