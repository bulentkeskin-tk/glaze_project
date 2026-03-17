from datetime import date

from glaze.db.repository import UserPreference
from glaze.services.matching import MatchingService


def test_prefers_never_met_pairs():
    users = [
        UserPreference('U1', True, 'weekly', None, 'Eng', 'A'),
        UserPreference('U2', True, 'weekly', None, 'Sales', 'B'),
        UserPreference('U3', True, 'weekly', None, 'Eng', 'C'),
        UserPreference('U4', True, 'weekly', None, 'Sales', 'D'),
    ]
    history = [
        {'user_a': 'U1', 'user_b': 'U2', 'cycle_date': '2026-01-01'},
        {'user_a': 'U3', 'user_b': 'U4', 'cycle_date': '2026-01-01'},
    ]
    svc = MatchingService(history)
    pairs, leftovers = svc.make_pairs(users, date(2026, 3, 17))
    pair_ids = {tuple(sorted((a.slack_user_id, b.slack_user_id))) for a, b in pairs}
    assert ('U1', 'U2') not in pair_ids
    assert ('U3', 'U4') not in pair_ids
    assert leftovers == []
