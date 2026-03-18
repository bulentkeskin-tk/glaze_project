from __future__ import annotations

from glaze.db.repository import UserPreference


def build_home_view(pref: UserPreference | None) -> dict:
    frequency = pref.frequency if pref else 'biweekly'
    is_active = pref.is_active if pref else True
    snooze_until = pref.snooze_until.isoformat() if pref and pref.snooze_until else None

    status_emoji = ':large_green_circle:' if is_active else ':double_vertical_bar:'
    status_label = 'Active' if is_active else 'Paused'
    snooze_text = f'Snoozed until {snooze_until}' if snooze_until else 'Not snoozed'

    return {
        'type': 'home',
        'blocks': [
            {
                'type': 'header',
                'text': {'type': 'plain_text', 'text': '☕  Glaze', 'emoji': True},
            },
            {
                'type': 'section',
                'text': {'type': 'mrkdwn', 'text': 'Automatically match teammates for coffee chats.'},
            },
            {'type': 'divider'},
            {
                'type': 'section',
                'text': {
                    'type': 'mrkdwn',
                    'text': f'*Your status*\n{status_emoji}  {status_label}   ·   _{snooze_text}_',
                },
            },
            {'type': 'divider'},
            {
                'type': 'section',
                'text': {
                    'type': 'mrkdwn',
                    'text': '*Matching frequency*\nHow often you want to be paired with a teammate.',
                },
                'accessory': {
                    'type': 'static_select',
                    'action_id': 'set_frequency',
                    'placeholder': {'type': 'plain_text', 'text': 'Choose frequency'},
                    'initial_option': {
                        'text': {'type': 'plain_text', 'text': frequency.title()},
                        'value': frequency,
                    },
                    'options': [
                        {'text': {'type': 'plain_text', 'text': 'Weekly'}, 'value': 'weekly'},
                        {'text': {'type': 'plain_text', 'text': 'Biweekly'}, 'value': 'biweekly'},
                        {'text': {'type': 'plain_text', 'text': 'Monthly'}, 'value': 'monthly'},
                    ],
                },
            },
            {
                'type': 'section',
                'text': {
                    'type': 'mrkdwn',
                    'text': '*Snooze matching*\nTemporarily pause your matches for a set period.',
                },
                'accessory': {
                    'type': 'static_select',
                    'action_id': 'set_snooze',
                    'placeholder': {'type': 'plain_text', 'text': 'Snooze for…'},
                    'options': [
                        {'text': {'type': 'plain_text', 'text': 'No snooze'}, 'value': '0'},
                        {'text': {'type': 'plain_text', 'text': '1 week'}, 'value': '1'},
                        {'text': {'type': 'plain_text', 'text': '2 weeks'}, 'value': '2'},
                        {'text': {'type': 'plain_text', 'text': '3 weeks'}, 'value': '3'},
                        {'text': {'type': 'plain_text', 'text': '4 weeks'}, 'value': '4'},
                    ],
                },
            },
            {'type': 'divider'},
            {
                'type': 'context',
                'elements': [{'type': 'mrkdwn', 'text': 'Toggle your participation in matching cycles.'}],
            },
            {
                'type': 'actions',
                'elements': [
                    {
                        'type': 'button',
                        'action_id': 'set_active',
                        'text': {'type': 'plain_text', 'text': '✓  Opt In', 'emoji': True},
                        'style': 'primary',
                        'value': 'true',
                    },
                    {
                        'type': 'button',
                        'action_id': 'set_inactive',
                        'text': {'type': 'plain_text', 'text': '✕  Opt Out', 'emoji': True},
                        'style': 'danger',
                        'value': 'false',
                    },
                ],
            },
        ],
    }
