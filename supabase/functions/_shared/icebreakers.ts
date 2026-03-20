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

  // ── Conversation boost ────────────────────────────────────────────────────
  // Given recent message texts from a DM, asks the LLM to generate one short
  // follow-up question or light joke to keep the conversation going — or
  // returns null if the conversation doesn't need a nudge.
  // Only called when VERBOSE=1 and 1–3 human messages exist.

  async getConversationBoost(messages: { name: string; text: string }[]): Promise<string | null> {
    if (!this.openaiApiKey) return null;

    const transcript = messages.map((m) => `${m.name}: ${m.text}`).join('\n');

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
              role: 'system',
              content:
                'You are a friendly Slack bot helping two coworkers get to know each other over a coffee chat. ' +
                'You will see the start of their conversation. Your job is to add ONE short, warm follow-up ' +
                'question or light workplace-safe joke that feels natural given what they have already said. ' +
                'Only respond if it genuinely adds value — if the conversation is already flowing well or your ' +
                'message would feel forced, respond with exactly the word NULL and nothing else.',
            },
            {
              role: 'user',
              content: `Here is their conversation so far:\n\n${transcript}`,
            },
          ],
          max_tokens: 120,
          temperature: 0.8,
        }),
      });

      if (!response.ok) {
        console.error('OpenAI API error (boost):', response.status, await response.text());
        return null;
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim();

      if (!text || text.toUpperCase() === 'NULL') return null;
      return text;
    } catch (error) {
      console.error('Error generating conversation boost:', error);
      return null;
    }
  }

  private getRandomFallback(): string {
    return FALLBACK_ICEBREAKERS[Math.floor(Math.random() * FALLBACK_ICEBREAKERS.length)];
  }
}
