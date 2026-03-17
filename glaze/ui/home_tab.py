from __future__ import annotations

from glaze.db.repository import UserPreference


def build_home_view(pref: UserPreference | None) -> dict:
    frequency = pref.frequency if pref else 'biweekly'
    is_active = pref.is_active if pref else True
    snooze_until = pref.snooze_until.isoformat() if pref and pref.snooze_until else 'Not snoozed'

    status_text = 'Active' if is_active else 'Paused'

    return {
        'type': 'home',
        'blocks': [
            {
                'type': 'section',
                'text': {'type': 'mrkdwn', 'text': '*Welcome to Glaze*\nYour internal coffee chat bot.'},
            },
            {
                'type': 'section',
                'fields': [
                    {'type': 'mrkdwn', 'text': f'*Status*\n{status_text}'},
                    {'type': 'mrkdwn', 'text': f'*Frequency*\n{frequency.title()}'},
                    {'type': 'mrkdwn', 'text': f'*Snooze until*\n{snooze_until}'},
                ],
            },
            {'type': 'divider'},
            {
                'type': 'actions',
                'elements': [
                    {
                        'type': 'static_select',
                        'action_id': 'set_frequency',
                        'placeholder': {'type': 'plain_text', 'text': 'Set frequency'},
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
                    {
                        'type': 'static_select',
                        'action_id': 'set_snooze',
                        'placeholder': {'type': 'plain_text', 'text': 'Snooze'},
                        'options': [
                            {'text': {'type': 'plain_text', 'text': 'Off'}, 'value': '0'},
                            {'text': {'type': 'plain_text', 'text': '1 week'}, 'value': '1'},
                            {'text': {'type': 'plain_text', 'text': '2 weeks'}, 'value': '2'},
                            {'text': {'type': 'plain_text', 'text': '3 weeks'}, 'value': '3'},
                            {'text': {'type': 'plain_text', 'text': '4 weeks'}, 'value': '4'},
                        ],
                    },
                ],
            },
            {
                'type': 'actions',
                'elements': [
                    {
                        'type': 'button',
                        'action_id': 'set_active',
                        'text': {'type': 'plain_text', 'text': 'Opt In'},
                        'style': 'primary',
                        'value': 'true',
                    },
                    {
                        'type': 'button',
                        'action_id': 'set_inactive',
                        'text': {'type': 'plain_text', 'text': 'Opt Out'},
                        'style': 'danger',
                        'value': 'false',
                    },
                ],
            },
        ],
    }
