// ── Icebreaker Service: Generate conversation starters ──────────────────────

const FALLBACK_ICEBREAKERS = [
  'If you had to teach a 30-minute seminar with zero prep, what topic would you choose?',
  'What is one small tool, habit, or shortcut that saves you time every week?',
  'Which project taught you the most in the shortest amount of time?',
  'If you could instantly become great at one non-work skill, what would it be?',
  'What is something you changed your mind about in the last year?',
  'What kind of problem do you secretly enjoy solving?',
  'What is a surprisingly good piece of advice you have received at work?',
  'What is something you do differently than most people in your role?',
  'If you could shadow anyone at this company for a day, who would it be and why?',
  'What is a technology or trend you were skeptical about but now embrace?',
  'What is the most interesting thing you have learned from a mistake?',
  'If you could bring back one discontinued product or feature, what would it be?',
  'What is a book, podcast, or article that actually changed how you work?',
  'What skill do you have that might surprise your coworkers?',
  'What is something you automate that most people do manually?',
  'If you could delete one meeting type from existence, which would it be?',
  'What is an unpopular opinion you hold about your industry or field?',
  'What is the best feedback you have ever received, and why did it stick with you?',
  'If you could design a new work tradition or ritual, what would it be?',
  'What is something you are currently trying to get better at?',
  'What is a city you visited that completely changed your perspective on travel?',
  'If you could only travel to one country for the rest of your life, which would it be?',
  'What is the most underrated travel destination you have been to?',
  'What travel experience taught you something unexpected about yourself?',
  'What is your most memorable business trip story?',
  'If you could design the perfect business travel experience, what would it include?',
  'What is something about the travel industry that most people do not understand?',
  'What travel trend do you think will become obsolete in the next decade?',
  'What is the best local food you have discovered while traveling for work?',
  'If you could solve one pain point in business travel, what would it be?',
  'What is a travel hack or tip that you swear by?',
  'What is the most interesting cultural difference you have noticed while traveling?',
  'If you could work remotely from anywhere for a month, where would you go?',
  'What is a lesson from travel that you apply to your everyday work?',
  'What destination has been on your list forever but you have not made it to yet?',
  'What is your go-to strategy for staying productive while traveling?',
  'If you could bring one aspect of another country\'s work culture back here, what would it be?',
  'What is the most surprisingly efficient airport or transit system you have experienced?',
  'What travel story do you love telling people?',
  'How has your approach to travel changed since working at Perk?',
];

export class IcebreakerService {
  private openaiApiKey?: string;

  constructor(openaiApiKey?: string) {
    this.openaiApiKey = openaiApiKey;
  }

  // ── Batch icebreaker generation ──────────────────────────────────────────
  // Generates multiple unique icebreakers in a single API call for better
  // diversity and performance. Used by queueCycle to pre-generate all
  // icebreakers for a matching cycle.

  async getBatchIcebreakers(count: number): Promise<string[]> {
    // If no OpenAI key, use fallback
    if (!this.openaiApiKey) {
      return Array.from({ length: count }, () => this.getRandomFallback());
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
              role: 'system',
              content:
                'You are generating icebreaker questions for coffee chats at Perk, a corporate travel company. ' +
                'Questions should be short, friendly, workplace-safe, and help coworkers get to know each other. ' +
                'Mix general career questions with travel-related topics.',
            },
            {
              role: 'user',
              content:
                `Generate exactly ${count} unique, diverse icebreaker questions for coworkers meeting for a 1-on-1 coffee chat. ` +
                'Return ONLY a JSON array of strings, with each string being one question. ' +
                'Do not use markdown formatting or code blocks. Do not wrap the JSON in backticks. ' +
                'Make sure all questions are different from each other. ' +
                'Example format: ["question 1?", "question 2?", "question 3?"]',
            },
          ],
          max_tokens: 1500,
          temperature: 1.0,
        }),
      });

      if (!response.ok) {
        console.error('OpenAI API error (batch):', response.status, await response.text());
        return Array.from({ length: count }, () => this.getRandomFallback());
      }

      const data = await response.json();
      let text = data.choices?.[0]?.message?.content?.trim();

      if (!text) {
        console.error('[icebreakers] batch generation returned empty');
        return Array.from({ length: count }, () => this.getRandomFallback());
      }

      // Strip markdown code blocks if present (```json...``` or ```...```)
      text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

      // Parse JSON array from response
      const questions = JSON.parse(text) as string[];
      
      if (!Array.isArray(questions) || questions.length === 0) {
        console.error('[icebreakers] batch generation did not return valid array');
        return Array.from({ length: count }, () => this.getRandomFallback());
      }

      console.log(`[icebreakers] generated ${questions.length} batch icebreakers`);
      
      // If we got fewer questions than requested, pad with fallbacks
      if (questions.length < count) {
        const needed = count - questions.length;
        const fallbacks = Array.from({ length: needed }, () => this.getRandomFallback());
        return [...questions, ...fallbacks];
      }
      
      return questions.slice(0, count);
    } catch (error) {
      console.error('Error generating batch icebreakers:', error);
      return Array.from({ length: count }, () => this.getRandomFallback());
    }
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

      console.log(`[icebreakers] generated icebreaker: "${text || '(empty, using fallback)'}"`);
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
    console.log(`[icebreakers] boost input transcript:\n${transcript}`);

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

      console.log(`[icebreakers] boost response: "${text || '(empty)'}"`);
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
