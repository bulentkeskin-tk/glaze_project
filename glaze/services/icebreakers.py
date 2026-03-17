from __future__ import annotations

import random
from typing import Sequence

from openai import OpenAI

from glaze.settings import get_settings

FALLBACK_ICEBREAKERS: Sequence[str] = [
    'If you had to teach a 30-minute seminar with zero prep, what topic would you choose?',
    'What is one small tool, habit, or shortcut that saves you time every week?',
    'Which project taught you the most in the shortest amount of time?',
    'If you could instantly become great at one non-work skill, what would it be?',
    'What is something you changed your mind about in the last year?',
    'What kind of problem do you secretly enjoy solving?',
    'What is a surprisingly good piece of advice you have received at work?',
]


class IcebreakerService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = OpenAI(api_key=self.settings.openai_api_key) if self.settings.openai_api_key else None

    def get_icebreaker(self) -> str:
        if not self.client:
            return random.choice(list(FALLBACK_ICEBREAKERS))
        try:
            response = self.client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {
                        'role': 'user',
                        'content': (
                            'Generate exactly one short, friendly, workplace-safe icebreaker question for two coworkers '
                            'meeting for a casual 1-on-1 coffee chat. Return only the question.'
                        ),
                    }
                ],
                max_tokens=100,
                temperature=0.9,
            )
            text = (response.choices[0].message.content or '').strip()
            return text if text else random.choice(list(FALLBACK_ICEBREAKERS))
        except Exception:
            return random.choice(list(FALLBACK_ICEBREAKERS))
