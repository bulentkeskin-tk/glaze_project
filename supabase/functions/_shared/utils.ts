// ── Environment & Settings Utilities ────────────────────────────────────────

import type { Settings } from './types.ts';

export function getSettings(): Settings {
  return {
    supabaseUrl: Deno.env.get('SUPABASE_URL')!,
    supabaseServiceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    slackBotToken: Deno.env.get('SLACK_BOT_TOKEN')!,
    slackSigningSecret: Deno.env.get('SLACK_SIGNING_SECRET')!,
    glazeDefaultChannelId: Deno.env.get('GLAZE_DEFAULT_CHANNEL_ID')!,
    openaiApiKey: Deno.env.get('OPENAI_API_KEY'),
    adminTriggerToken: Deno.env.get('ADMIN_TRIGGER_TOKEN') || 'change-me',
    glazeAdminUserIds: new Set(
      (Deno.env.get('GLAZE_ADMIN_USER_IDS') || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
    glazeDefaultFrequency: Deno.env.get('GLAZE_DEFAULT_FREQUENCY') || 'biweekly',
    glazeCrossDepartmentWeight: parseInt(Deno.env.get('GLAZE_CROSS_DEPARTMENT_WEIGHT') || '20'),
    glazeRepeatPenaltyDays: parseInt(Deno.env.get('GLAZE_REPEAT_PENALTY_DAYS') || '3650'),
    glazeDepartmentFieldId: Deno.env.get('GLAZE_DEPARTMENT_FIELD_ID') || null,
  };
}

// ── Date Utilities ───────────────────────────────────────────────────────────

export function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00Z');
}

export function addWeeks(date: Date, weeks: number): string {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + weeks * 7);
  return result.toISOString().split('T')[0];
}

export function daysSince(dateStr: string, referenceDate: string): number {
  const past = parseDate(dateStr).getTime();
  const ref = parseDate(referenceDate).getTime();
  return Math.floor((ref - past) / (1000 * 60 * 60 * 24));
}

// ── Slack Signature Verification ────────────────────────────────────────────

export async function verifySlackSignature(
  signingSecret: string,
  requestSignature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  // Check timestamp is within 5 minutes
  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp);
  if (Math.abs(currentTime - requestTime) > 300) {
    return false;
  }

  // Compute expected signature
  const sigBasestring = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigBasestring));
  const expectedSignature = `v0=${Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;

  return expectedSignature === requestSignature;
}

// ── Department Extraction ────────────────────────────────────────────────────

export function extractDepartment(profile: any, departmentFieldId: string | null): string | null {
  const fields = profile.fields || {};

  if (departmentFieldId && fields[departmentFieldId]?.value) {
    return fields[departmentFieldId].value;
  }

  if (profile.department) return profile.department;

  for (const field of Object.values(fields)) {
    const f = field as any;
    const label = (f.label || '').toLowerCase();
    if (label.includes('department') || label.includes('team')) {
      return f.value || null;
    }
  }

  return null;
}

// ── Response Helpers ─────────────────────────────────────────────────────────

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function textResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}
