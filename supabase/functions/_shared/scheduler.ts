// ── Scheduler Service: Cycle Runner & Nudge Logic ───────────────────────────

import { WebClient } from 'npm:@slack/web-api@7';
import type { NudgeResult, ProcessQueueResult, QueueCycleResult, UserPreference } from './types.ts';
import { today } from './utils.ts';
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
    
    // Handle empty batch — return null cycle_date
    if (items.length === 0) {
      return {
        cycle_date: null,
        pairs_processed: 0,
        pairs_failed: 0,
        pairs: [],
      };
    }

    // Generate batch of icebreakers for all claimed pairs at once
    const icebreakers = await this.icebreakers.getBatchIcebreakers(items.length);
    console.log(`[run-cycle] generated ${icebreakers.length} icebreakers for ${items.length} pairs`);

    const cycleDate = items[0].cycle_date;
    const results: Array<{ channel: string; a: string; b: string }> = [];
    let failed = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const icebreaker = icebreakers[i];
      
      try {
        const dm = await this.client.conversations.open({
          users: [item.user_a, item.user_b].join(','),
        });

        const channel = dm.channel?.id;
        if (!channel) {
          const errMsg = 'Failed to open DM';
          console.error(`${errMsg} for pair:`, item.user_a, item.user_b);
          await this.repository.markQueueItemFailed(item.id, errMsg);
          failed++;
          continue;
        }

        const intro = await this.client.chat.postMessage({
          channel,
          text:
            `👋 You two have been matched for this Glaze coffee chat.\n\n` +
            `<@${item.user_a}> + <@${item.user_b}>\n\n` +
            `*Icebreaker:* ${icebreaker}`,
        });

        if (!intro.ts) {
          const errMsg = 'Failed to send intro message';
          console.error(`${errMsg} for pair:`, item.user_a, item.user_b);
          await this.repository.markQueueItemFailed(item.id, errMsg);
          failed++;
          continue;
        }

        // Record in pair_events so the Thursday nudge job can find this pair
        await this.repository.recordPairEvent(item.cycle_date, item.user_a, item.user_b, channel, intro.ts, icebreaker);
        await this.repository.markQueueItemDone(item.id, channel, intro.ts);

        console.log(`[run-cycle] intro sent channel=${channel} users=${item.user_a}+${item.user_b} icebreaker="${icebreaker}"`);
        results.push({ channel, a: item.user_a, b: item.user_b });
      } catch (error) {
        const errMsg = String(error);
        console.error('Error processing pair:', item.user_a, item.user_b, error);
        await this.repository.markQueueItemFailed(item.id, errMsg);
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

  // ── Run Thursday nudges (worker) ────────────────────────────────────────
  // Claims up to batchSize pairs from last week's cycle and nudges any that
  // have had no human messages since the intro. Safe to run concurrently —
  // DB claim is atomic (FOR UPDATE SKIP LOCKED).

  // Conversation activity thresholds
  private static readonly BOOST_MESSAGE_MIN = 1;  // at least this many human msgs to consider a boost
  private static readonly BOOST_MESSAGE_MAX = 3;  // conversation is self-sustaining above this

  async runNudges(batchSize = 50, verbose = false): Promise<NudgeResult> {
    const targetCycle = await this.repository.getLatestCycleDate();
    if (!targetCycle) {
      console.log('[run-nudges] no cycle found in glaze_pair_events, skipping');
      return { target_cycle: null, nudges_sent: 0, boosts_sent: 0, channels: [] };
    }

    const pairRows = await this.repository.claimNudgeBatch(targetCycle, batchSize);
    console.log(`[run-nudges] claimed ${pairRows.length} pairs for cycle ${targetCycle}`);
    const nudged: string[] = [];
    const boosted: string[] = [];

    for (const row of pairRows) {
      const history = await this.client.conversations.history({
        channel: row.dm_channel_id,
        oldest: row.intro_ts,
        limit: 20,
      });

      const humanMessages = (history.messages || []).filter(
        (m: any) =>
          (m.user === row.user_a || m.user === row.user_b) &&
          !m.subtype
      );

      const msgCount = humanMessages.length;

      if (msgCount === 0) {
        // Silent pair — send the standard nudge
        await this.client.chat.postMessage({
          channel: row.dm_channel_id,
          text: '☕ Friendly nudge: looks like this chat has not started yet. Maybe pick a time before the week gets away from you?',
        });
        await this.repository.markNudgeSent(row.id);
        nudged.push(row.dm_channel_id);
        console.log(`[run-nudges] nudged channel=${row.dm_channel_id} users=${row.user_a}+${row.user_b}`);
        continue;
      }

      if (
        verbose &&
        msgCount >= SchedulerService.BOOST_MESSAGE_MIN &&
        msgCount <= SchedulerService.BOOST_MESSAGE_MAX
      ) {
        // Fetch display names in parallel — fall back to Slack user ID if not found
        const [prefA, prefB] = await Promise.all([
          this.repository.getUserPreference(row.user_a),
          this.repository.getUserPreference(row.user_b),
        ]);
        const nameMap = new Map([
          [row.user_a, prefA?.full_name || row.user_a],
          [row.user_b, prefB?.full_name || row.user_b],
        ]);

        // Conversation started but still quiet — let the LLM decide whether to chime in
        const structuredMessages = (humanMessages as any[])
          .filter((m) => m.text)
          .map((m) => ({ name: nameMap.get(m.user) || m.user, text: m.text as string }));
        console.log(`[run-nudges] boost check channel=${row.dm_channel_id} msgs=${msgCount}`);
        const boost = await this.icebreakers.getConversationBoost(structuredMessages);
        if (boost) {
          await this.client.chat.postMessage({
            channel: row.dm_channel_id,
            text: boost,
          });
          boosted.push(row.dm_channel_id);
          console.log(`[run-nudges] boost sent channel=${row.dm_channel_id}`);
        } else {
          console.log(`[run-nudges] boost skipped (LLM returned NULL) channel=${row.dm_channel_id}`);
        }
      } else if (msgCount > SchedulerService.BOOST_MESSAGE_MAX) {
        console.log(`[run-nudges] skipped (active) channel=${row.dm_channel_id} msgs=${msgCount}`);
      }

      // Mark as handled (whether we boosted or left it alone)
      await this.repository.markNudgeSent(row.id);
    }

    return {
      target_cycle: targetCycle,
      nudges_sent: nudged.length,
      boosts_sent: boosted.length,
      channels: [...nudged, ...boosted],
    };
  }

}
