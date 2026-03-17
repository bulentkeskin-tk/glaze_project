from __future__ import annotations

from collections import defaultdict
from datetime import date
from itertools import combinations

from glaze.db.repository import UserPreference
from glaze.settings import get_settings


class MatchingService:
    def __init__(self, pair_history: list[dict]) -> None:
        self.pair_history = pair_history
        self.settings = get_settings()
        self.history_map = self._build_history_map(pair_history)

    @staticmethod
    def _pair_key(a: str, b: str) -> tuple[str, str]:
        return tuple(sorted((a, b)))

    def _build_history_map(self, rows: list[dict]) -> dict[tuple[str, str], list[date]]:
        history: dict[tuple[str, str], list[date]] = defaultdict(list)
        for row in rows:
            key = self._pair_key(row['user_a'], row['user_b'])
            history[key].append(date.fromisoformat(row['cycle_date']))
        for values in history.values():
            values.sort()
        return dict(history)

    def score_pair(self, a: UserPreference, b: UserPreference, today: date) -> tuple[int, int]:
        key = self._pair_key(a.slack_user_id, b.slack_user_id)
        meetings = self.history_map.get(key, [])
        never_met_bonus = 1 if not meetings else 0
        last_met_days = 10_000 if not meetings else (today - meetings[-1]).days
        cross_dept_bonus = 0
        if a.department and b.department and a.department != b.department:
            cross_dept_bonus = self.settings.glaze_cross_department_weight
        return (never_met_bonus * self.settings.glaze_repeat_penalty_days + cross_dept_bonus + last_met_days, last_met_days)

    def make_pairs(self, users: list[UserPreference], today: date) -> tuple[list[tuple[UserPreference, UserPreference]], list[UserPreference]]:
        remaining = users[:]
        pairs: list[tuple[UserPreference, UserPreference]] = []
        leftovers: list[UserPreference] = []

        while len(remaining) >= 2:
            best_pair: tuple[UserPreference, UserPreference] | None = None
            best_score: tuple[int, int] | None = None
            for a, b in combinations(remaining, 2):
                score = self.score_pair(a, b, today)
                if best_score is None or score > best_score:
                    best_pair = (a, b)
                    best_score = score
            if not best_pair:
                break
            a, b = best_pair
            pairs.append((a, b))
            remaining = [u for u in remaining if u.slack_user_id not in {a.slack_user_id, b.slack_user_id}]

        leftovers.extend(remaining)
        return pairs, leftovers
