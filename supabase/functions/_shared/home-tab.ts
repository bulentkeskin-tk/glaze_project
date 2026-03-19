// ── Home Tab UI: Slack Block Kit Builder ────────────────────────────────────

import type { UserPreference } from './types.ts';

export function buildHomeView(pref: UserPreference | null, botIconUrl?: string): Record<string, unknown> {
  const frequency = pref?.frequency || 'biweekly';
  const isActive = pref?.is_active ?? true;
  const snoozeUntil = pref?.snooze_until || null;

  const statusEmoji = isActive ? ':large_green_circle:' : ':double_vertical_bar:';
  const statusLabel = isActive ? 'Active' : 'Paused';
  const snoozeText = snoozeUntil ? `Snoozed until ${snoozeUntil}` : 'Not snoozed';

  const headerBlock: Record<string, unknown> = botIconUrl
    ? {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Glaze*\nAutomatically match teammates for coffee chats.' },
        accessory: { type: 'image', image_url: botIconUrl, alt_text: 'Glaze' },
      }
    : {
        type: 'header',
        text: { type: 'plain_text', text: '\u2615  Glaze', emoji: true },
      };

  const subtitleBlocks: Record<string, unknown>[] = botIconUrl
    ? []
    : [{ type: 'section', text: { type: 'mrkdwn', text: 'Automatically match teammates for coffee chats.' } }];

  return {
    type: 'home',
    blocks: [
      headerBlock,
      ...subtitleBlocks,
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Your status*\n${statusEmoji}  ${statusLabel}   ·   _${snoozeText}_`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Matching frequency*\nHow often you want to be paired with a teammate.',
        },
        accessory: {
          type: 'static_select',
          action_id: 'set_frequency',
          placeholder: { type: 'plain_text', text: 'Choose frequency' },
          initial_option: {
            text: { type: 'plain_text', text: capitalizeFirst(frequency) },
            value: frequency,
          },
          options: [
            { text: { type: 'plain_text', text: 'Weekly' }, value: 'weekly' },
            { text: { type: 'plain_text', text: 'Biweekly' }, value: 'biweekly' },
            { text: { type: 'plain_text', text: 'Monthly' }, value: 'monthly' },
          ],
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Snooze matching*\nTemporarily pause your matches for a set period.',
        },
        accessory: {
          type: 'static_select',
          action_id: 'set_snooze',
          placeholder: { type: 'plain_text', text: 'Snooze for…' },
          options: [
            { text: { type: 'plain_text', text: 'No snooze' }, value: '0' },
            { text: { type: 'plain_text', text: '1 week' }, value: '1' },
            { text: { type: 'plain_text', text: '2 weeks' }, value: '2' },
            { text: { type: 'plain_text', text: '3 weeks' }, value: '3' },
            { text: { type: 'plain_text', text: '4 weeks' }, value: '4' },
          ],
        },
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Toggle your participation in matching cycles.' }],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: 'set_active',
            text: { type: 'plain_text', text: '✓  Opt In', emoji: true },
            style: 'primary',
            value: 'true',
          },
          {
            type: 'button',
            action_id: 'set_inactive',
            text: { type: 'plain_text', text: '✕  Opt Out', emoji: true },
            style: 'danger',
            value: 'false',
          },
        ],
      },
    ],
  };
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
