/**
 * Erzeugt aus den Lead-Stammdaten den bisherigen Verlauf (Nachrichten + Timeline)
 * mit Zeitstempeln relativ zum Demo-Start – so wirkt die Demo an jedem Tag „frisch“.
 */

import { FOUNDERS } from './founders';
import { FIRST_MESSAGE_TEMPLATES, FOLLOW_UP_TEMPLATES } from './templates';
import { FIT_INFO, hashString, signalDetail, signalLabel } from '../lib/leadInfo';
import { fillTemplate, variablesForLead } from '../lib/template';
import type { Lead, Message, TimelineEvent } from '../state/types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface LeadHistory {
  messages: Message[];
  events: TimelineEvent[];
  acceptedAt?: number;
  lastOwnMessageAt?: number;
}

export function buildHistory(lead: Lead, now: number): LeadHistory {
  const jitter = (salt: string, maxMinutes: number) => (hashString(lead.id + salt) % maxMinutes) * MINUTE;
  const variables = variablesForLead(lead);
  const messages: Message[] = [];
  const events: TimelineEvent[] = [];
  const founder = FOUNDERS[lead.owner];

  let scrapedAt: number;
  let connectionSentAt: number | undefined;
  let acceptedAt: number | undefined;
  let lastOwnMessageAt: number | undefined;

  if (lead.stage === 'lead') {
    scrapedAt = now - 4 * HOUR - jitter('scrape', 90);
  } else {
    let ownMessageTimes: number[] = [];
    if (lead.stage === 'first') {
      acceptedAt = now - 23 * HOUR - jitter('accept', 50);
    } else {
      const count = 1 + (lead.followUps?.length ?? 0);
      let last: number;
      if (lead.stage === 'followup') {
        last = now - (lead.daysSilent ?? 2) * DAY - jitter('last', 180);
      } else {
        const firstReply = lead.replies?.[0];
        const replyAt = now - (firstReply?.hoursAgo ?? 1) * HOUR - jitter('reply', 40);
        last = replyAt - 26 * HOUR - jitter('last', 120);
      }
      ownMessageTimes = [last];
      for (let i = 1; i < count; i++) {
        ownMessageTimes.unshift(ownMessageTimes[0] - 3 * DAY - jitter(`fu${i}`, 120));
      }
      acceptedAt = ownMessageTimes[0] - 20 * HOUR - jitter('accept', 60);
      lastOwnMessageAt = last;
    }
    connectionSentAt = acceptedAt - 2 * DAY - jitter('sent', 120);
    scrapedAt = connectionSentAt - DAY - jitter('scrape', 120);

    if (lead.template && ownMessageTimes.length > 0) {
      const template = FIRST_MESSAGE_TEMPLATES[lead.template];
      messages.push({
        id: `${lead.id}-m0`,
        from: 'founder',
        founder: lead.owner,
        text: fillTemplate(template.text, variables),
        at: ownMessageTimes[0],
        label: `Erstnachricht · ${template.name}`,
      });
      (lead.followUps ?? []).forEach((variant, index) => {
        const stage = (index + 1) as 1 | 2 | 3;
        messages.push({
          id: `${lead.id}-m${index + 1}`,
          from: 'founder',
          founder: lead.owner,
          text: fillTemplate(FOLLOW_UP_TEMPLATES[stage][variant].text, variables),
          at: ownMessageTimes[index + 1],
          label: `Follow-up ${stage} · Variante ${variant}`,
        });
      });
    }

    // Antworten, die per Slack-Ping eintreffen, werden erst bei Ankunft ergänzt.
    if (lead.stage === 'reply' && !lead.arrivesViaPing) {
      (lead.replies ?? []).forEach((reply, index) => {
        messages.push({
          id: `${lead.id}-r${index}`,
          from: 'lead',
          text: reply.text,
          at: now - reply.hoursAgo * HOUR - jitter('reply', 40),
        });
      });
    }
  }

  events.push({
    id: `${lead.id}-e-scraped`,
    kind: 'scraped',
    at: scrapedAt,
    title: 'Lead gescrapt',
    detail: `Signal: ${signalLabel(lead.signal)} – ${signalDetail(lead.signal)}`,
  });
  events.push({
    id: `${lead.id}-e-assessed`,
    kind: 'assessed',
    at: scrapedAt + 2 * MINUTE,
    title: `KI-Einschätzung: ${FIT_INFO[lead.fit].label}`,
    detail: lead.fitReason,
  });
  if (connectionSentAt !== undefined) {
    events.push({
      id: `${lead.id}-e-sent`,
      kind: 'connection_sent',
      at: connectionSentAt,
      title: `Vernetzungsanfrage gesendet von ${founder.name}`,
      detail: `Über den LinkedIn-Account von ${founder.name}`,
      by: lead.owner,
    });
  }
  if (acceptedAt !== undefined) {
    events.push({
      id: `${lead.id}-e-accepted`,
      kind: 'connection_accepted',
      at: acceptedAt,
      title: 'Vernetzungsanfrage angenommen',
    });
  }
  for (const message of messages) {
    events.push(
      message.from === 'founder'
        ? {
            id: `${message.id}-e`,
            kind: 'message_sent',
            at: message.at,
            title: `${message.label} gesendet`,
            detail: message.text,
            by: lead.owner,
          }
        : {
            id: `${message.id}-e`,
            kind: 'message_received',
            at: message.at,
            title: `Antwort von ${lead.firstName} erhalten`,
            detail: message.text,
          },
    );
  }

  events.sort((a, b) => a.at - b.at);
  return { messages, events, acceptedAt, lastOwnMessageAt };
}
