// ── Icebreaker Service: Generate conversation starters ──────────────────────

const FALLBACK_ICEBREAKERS = [
  'If you had to teach a 30-minute seminar with zero prep, what topic would you choose?',
  'What is one small tool, habit, or shortcut that saves you time every week?',
  'Which project taught you the most in the shortest amount of time?',
  'If you could instantly become great at one non-work skill, what would it be?',
  'What is something you changed your mind about in the last year?',
  'What kind of problem do you secretly enjoy solving?',
  'What is a surprisingly good piece of advice you have received at work?',
];

export class IcebreakerService {
  private openaiApiKey?: string;

  constructor(openaiApiKey?: string) {
    this.openaiApiKey = openaiApiKey;
  }

  async getIcebreaker(): Promise<string> {
    // If no OpenAI key, use fallback
    if (!this.openaiApiKey) {
      return this.getRandomFallback();
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content:
                'Generate exactly one short, friendly, workplace-safe icebreaker question for two coworkers ' +
                'meeting for a casual 1-on-1 coffee chat. Return only the question.',
            },
          ],
          max_tokens: 100,
          temperature: 0.9,
        }),
      });

      if (!response.ok) {
        console.error('OpenAI API error:', response.status, await response.text());
        return this.getRandomFallback();
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim();

      return text || this.getRandomFallback();
    } catch (error) {
      console.error('Error generating icebreaker:', error);
      return this.getRandomFallback();
    }
  }

  private getRandomFallback(): string {
    return FALLBACK_ICEBREAKERS[Math.floor(Math.random() * FALLBACK_ICEBREAKERS.length)];
  }
}
