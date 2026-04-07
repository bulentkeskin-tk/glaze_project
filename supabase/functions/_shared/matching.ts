// ── Matching Service: Pairing Algorithm ─────────────────────────────────────

import type { MatchingResult, PairEvent, UserPreference } from './types.ts';
import { daysSince, parseDate } from './utils.ts';

export class MatchingService {
  private pairHistory: PairEvent[];
  private historyMap: Map<string, string[]>;
  private crossDepartmentWeight: number;
  private repeatPenaltyDays: number;

  constructor(pairHistory: PairEvent[], crossDepartmentWeight: number, repeatPenaltyDays: number) {
    this.pairHistory = pairHistory;
    this.crossDepartmentWeight = crossDepartmentWeight;
    this.repeatPenaltyDays = repeatPenaltyDays;
    this.historyMap = this.buildHistoryMap(pairHistory);
  }

  // ── Helper: Create sorted pair key ──────────────────────────────────────

  private pairKey(a: string, b: string): string {
    return [a, b].sort().join('::');
  }

  // ── Build history map of who has met whom and when ──────────────────────

  private buildHistoryMap(rows: PairEvent[]): Map<string, string[]> {
    const history = new Map<string, string[]>();

    for (const row of rows) {
      const key = this.pairKey(row.user_a, row.user_b);
      if (!history.has(key)) {
        history.set(key, []);
      }
      history.get(key)!.push(row.cycle_date);
    }

    // Sort dates for each pair
    for (const dates of history.values()) {
      dates.sort();
    }

    return history;
  }

  // ── Score a potential pairing ────────────────────────────────────────────

  scorePair(a: UserPreference, b: UserPreference, today: string): [number, number] {
    const key = this.pairKey(a.slack_user_id, b.slack_user_id);
    const meetings = this.historyMap.get(key) || [];

    // Never met bonus: highest priority
    const neverMetBonus = meetings.length === 0 ? 1 : 0;

    // Days since last meeting (or very large if never met)
    const lastMetDays = meetings.length === 0 ? 10_000 : daysSince(meetings[meetings.length - 1], today);

    // Cross-department bonus
    let crossDeptBonus = 0;
    if (a.department && b.department && a.department !== b.department) {
      crossDeptBonus = this.crossDepartmentWeight;
    }

    // Primary score: never met bonus * penalty + cross dept + days
    const primaryScore = neverMetBonus * this.repeatPenaltyDays + crossDeptBonus + lastMetDays;

    // Secondary score: just days (for tiebreaker)
    return [primaryScore, lastMetDays];
  }

  // ── Make pairings using greedy algorithm ─────────────────────────────────

  makePairs(users: UserPreference[], today: string): MatchingResult {
    const remaining = [...users];
    const pairs: Array<[UserPreference, UserPreference]> = [];
    const leftovers: UserPreference[] = [];

    while (remaining.length >= 2) {
      // Simplified greedy: take first user and find their best match
      const first = remaining[0];
      let bestMatch: UserPreference | null = null;
      let bestScore: [number, number] | null = null;

      // Only check first user against all others (O(n) per iteration instead of O(n²))
      for (let j = 1; j < remaining.length; j++) {
        const candidate = remaining[j];
        const score = this.scorePair(first, candidate, today);

        if (!bestScore || this.compareScores(score, bestScore) > 0) {
          bestMatch = candidate;
          bestScore = score;
        }
      }

      if (!bestMatch) break;

      pairs.push([first, bestMatch]);

      // Remove both paired users
      const pairedIds = new Set([first.slack_user_id, bestMatch.slack_user_id]);
      const newRemaining = remaining.filter((u) => !pairedIds.has(u.slack_user_id));
      remaining.length = 0;
      remaining.push(...newRemaining);
    }

    leftovers.push(...remaining);

    return { pairs, leftovers };
  }

  // ── Compare two scores (returns 1 if s1 > s2, -1 if s1 < s2, 0 if equal) ─

  private compareScores(s1: [number, number], s2: [number, number]): number {
    if (s1[0] > s2[0]) return 1;
    if (s1[0] < s2[0]) return -1;
    if (s1[1] > s2[1]) return 1;
    if (s1[1] < s2[1]) return -1;
    return 0;
  }
}
