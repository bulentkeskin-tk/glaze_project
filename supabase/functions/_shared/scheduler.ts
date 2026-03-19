// ── Scheduler Service: Cycle Runner & Nudge Logic ───────────────────────────

import { WebClient } from 'npm:@slack/web-api@7';
import type { CycleResult, NudgeResult, UserPreference } from './types.ts';
import { addWeeks, parseDate, today } from './utils.ts';
import { Repository } from './repository.ts';
import { MatchingService } from './matching.ts';
import { IcebreakerService } from './icebreakers.ts';

export class SchedulerService {
  private client: WebClient;
  private repository: Repository;
  private icebreakers: IcebreakerService;
  private crossDepartmentWeight: number;
  private repeatPenaltyDays: number;
  private departmentFieldId: string | null;

  constructor(
    slackBotToken: string,
    repository: Repository,
    openaiApiKey: string | undefined,
    crossDepartmentWeight: number,
    repeatPenaltyDays: number,
    departmentFieldId: string | null = null,
  ) {
    this.client = new WebClient(slackBotToken);
    this.repository = repository;
    this.icebreakers = new IcebreakerService(openaiApiKey);
    this.crossDepartmentWeight = crossDepartmentWeight;
    this.repeatPenaltyDays = repeatPenaltyDays;
    this.departmentFieldId = departmentFieldId;
  }

  // ── Sync channel members to database ─────────────────────────────────────

  async syncChannelMembers(channelId: string): Promise<void> {
    let cursor: string | undefined = undefined;

    while (true) {
      const response = await this.client.conversations.members({
        channel: channelId,
        cursor,
        limit: 200,
      });

      if (!response.members) break;

      for (const userId of response.members) {
        // Get user profile (users.profile.get returns custom fields; users.info does not)
        const userInfo = await this.client.users.info({ user: userId });
        const user = userInfo.user;

        if (!user || user.is_bot || user.deleted) continue;

        const profileInfo = await this.client.users.profile.get({ user: userId });
        const profile = (profileInfo.profile as any) || {};
        const department = this.extractDepartment(profile);

        await this.repository.upsertUserPreference(userId, {
          is_active: true,
          frequency: 'biweekly',
          department,
          full_name: profile.real_name || profile.display_name || userId,
        });
      }

      cursor = response.response_metadata?.next_cursor;
      if (!cursor) break;
    }
  }

  // ── Run matching cycle ───────────────────────────────────────────────────

  async runCycle(): Promise<CycleResult> {
    const cycleDate = today();

    const pairHistory = await this.repository.listRecentPairs();
    const matching = new MatchingService(pairHistory, this.crossDepartmentWeight, this.repeatPenaltyDays);

    const allEligible = await this.repository.eligibleUsersForCycle(cycleDate);
    const { pairs, leftovers } = matching.makePairs(allEligible, cycleDate);

    const created: Array<{ channel: string; a: string; b: string }> = [];

    for (const [a, b] of pairs) {
      // Open DM with both users
      const dm = await this.client.conversations.open({
        users: [a.slack_user_id, b.slack_user_id].join(','),
      });

      const channel = dm.channel?.id;
      if (!channel) {
        console.error('Failed to open DM for pair:', a.slack_user_id, b.slack_user_id);
        continue;
      }

      // Get icebreaker
      const icebreaker = await this.icebreakers.getIcebreaker();

      // Send intro message
      const intro = await this.client.chat.postMessage({
        channel,
        text:
          `👋 You two have been matched for this Glaze coffee chat.\n\n` +
          `<@${a.slack_user_id}> + <@${b.slack_user_id}>\n\n` +
          `*Icebreaker:* ${icebreaker}`,
      });

      if (!intro.ts) {
        console.error('Failed to send intro message for pair:', a.slack_user_id, b.slack_user_id);
        continue;
      }

      // Record in database
      await this.repository.recordPairEvent(cycleDate, a.slack_user_id, b.slack_user_id, channel, intro.ts);

      created.push({ channel, a: a.slack_user_id, b: b.slack_user_id });
    }

    return {
      cycle_date: cycleDate,
      eligible_users: allEligible.length,
      pairs_created: created.length,
      leftovers: leftovers.map((u) => u.slack_user_id),
      pairs: created,
    };
  }

  // ── Run Thursday nudges ──────────────────────────────────────────────────

  async runNudges(): Promise<NudgeResult> {
    const currentDate = today();
    const targetCycle = addWeeks(parseDate(currentDate), -1).split('T')[0]; // Last week's cycle

    const pairRows = await this.repository.listPairsForNudges(targetCycle);
    const nudged: string[] = [];

    for (const row of pairRows) {
      // Check conversation history
      const history = await this.client.conversations.history({
        channel: row.dm_channel_id,
        oldest: row.intro_ts,
        limit: 20,
      });

      // Look for human messages (not bot messages)
      const humanMessages = (history.messages || []).filter(
        (m: any) =>
          (m.user === row.user_a || m.user === row.user_b) &&
          !m.subtype // Exclude bot messages and other subtypes
      );

      // If there are human messages, skip the nudge
      if (humanMessages.length > 0) continue;

      // Send nudge
      await this.client.chat.postMessage({
        channel: row.dm_channel_id,
        text: '☕ Friendly nudge: looks like this chat has not started yet. Maybe pick a time before the week gets away from you?',
      });

      await this.repository.markNudgeSent(row.id);
      nudged.push(row.dm_channel_id);
    }

    return {
      target_cycle: targetCycle,
      nudges_sent: nudged.length,
      channels: nudged,
    };
  }

  // ── Extract department from Slack profile ────────────────────────────────

  private extractDepartment(profile: any): string | null {
    const fields = profile.fields || {};

    if (this.departmentFieldId && fields[this.departmentFieldId]?.value) {
      return fields[this.departmentFieldId].value;
    }

    if (profile.department) return profile.department;

    for (const field of Object.values(fields)) {
      const f = field as any;
      const label = (f.label || '').toLowerCase();
      if (label.includes('department') || label.includes('team')) {
        return f.value || null;
      }
    }

    return null;
  }
}
