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

  constructor(
    slackBotToken: string,
    repository: Repository,
    openaiApiKey: string | undefined,
    crossDepartmentWeight: number,
    repeatPenaltyDays: number,
  ) {
    this.client = new WebClient(slackBotToken);
    this.repository = repository;
    this.icebreakers = new IcebreakerService(openaiApiKey);
    this.crossDepartmentWeight = crossDepartmentWeight;
    this.repeatPenaltyDays = repeatPenaltyDays;
  }

  // ── Run matching cycle ───────────────────────────────────────────────────

  async runCycle(): Promise<CycleResult> {
    const cycleDate = today();

    const [pairHistory, allEligible] = await Promise.all([
      this.repository.listRecentPairs(8),
      this.repository.eligibleUsersForCycle(cycleDate),
    ]);
    const matching = new MatchingService(pairHistory, this.crossDepartmentWeight, this.repeatPenaltyDays);
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

}
