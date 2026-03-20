// ── Scheduler Service: Cycle Runner & Nudge Logic ───────────────────────────

import { WebClient } from 'npm:@slack/web-api@7';
import type { NudgeResult, ProcessQueueResult, QueueCycleResult, UserPreference } from './types.ts';
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

  // ── Queue matching cycle (coordinator) ──────────────────────────────────
  // Runs the full matching algorithm across all eligible users and writes
  // all pairs to glaze_pair_queue. Makes zero Slack API calls.

  async queueCycle(): Promise<QueueCycleResult> {
    const cycleDate = today();

    const [pairHistory, allEligible] = await Promise.all([
      this.repository.listRecentPairs(8),
      this.repository.eligibleUsersForCycle(cycleDate),
    ]);

    const matching = new MatchingService(pairHistory, this.crossDepartmentWeight, this.repeatPenaltyDays);
    const { pairs, leftovers } = matching.makePairs(allEligible, cycleDate);

    await this.repository.createPairQueue(cycleDate, pairs);

    return {
      cycle_date: cycleDate,
      eligible_users: allEligible.length,
      pairs_queued: pairs.length,
      leftovers: leftovers.map((u) => u.slack_user_id),
    };
  }

  // ── Process queue batch (worker) ─────────────────────────────────────────
  // Claims up to batchSize pending pairs from the queue and sends Slack
  // messages for each. Safe to run concurrently — DB claim is atomic.

  async processQueue(batchSize = 50): Promise<ProcessQueueResult> {
    const items = await this.repository.claimQueueBatch(batchSize);
    const cycleDate = items[0]?.cycle_date ?? today();
    const results: Array<{ channel: string; a: string; b: string }> = [];
    let failed = 0;

    for (const item of items) {
      try {
        const dm = await this.client.conversations.open({
          users: [item.user_a, item.user_b].join(','),
        });

        const channel = dm.channel?.id;
        if (!channel) {
          console.error('Failed to open DM for pair:', item.user_a, item.user_b);
          await this.repository.markQueueItemFailed(item.id);
          failed++;
          continue;
        }

        const icebreaker = await this.icebreakers.getIcebreaker();

        const intro = await this.client.chat.postMessage({
          channel,
          text:
            `👋 You two have been matched for this Glaze coffee chat.\n\n` +
            `<@${item.user_a}> + <@${item.user_b}>\n\n` +
            `*Icebreaker:* ${icebreaker}`,
        });

        if (!intro.ts) {
          console.error('Failed to send intro message for pair:', item.user_a, item.user_b);
          await this.repository.markQueueItemFailed(item.id);
          failed++;
          continue;
        }

        // Record in pair_events so the Thursday nudge job can find this pair
        await this.repository.recordPairEvent(item.cycle_date, item.user_a, item.user_b, channel, intro.ts);
        await this.repository.markQueueItemDone(item.id, channel, intro.ts);

        results.push({ channel, a: item.user_a, b: item.user_b });
      } catch (error) {
        console.error('Error processing pair:', item.user_a, item.user_b, error);
        await this.repository.markQueueItemFailed(item.id);
        failed++;
      }
    }

    return {
      cycle_date: cycleDate,
      pairs_processed: results.length,
      pairs_failed: failed,
      pairs: results,
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
