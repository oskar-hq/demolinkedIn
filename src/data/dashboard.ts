/**
 * Fake-Kennzahlen für das Dashboard: 16 Wochen Tageswerte je Gründer aus einem festen Seed.
 * Sichtbar sind 8 Wochen, die Wochen davor dienen nur als Vergleichsbasis.
 */

import type { FounderId, TemplateId } from '../state/types';

export const VISIBLE_DAYS = 56;
const TOTAL_DAYS = 112;

export interface DayStat {
  date: number;
  requests: number;
  accepted: number;
  messaged: number;
  replies: number;
  meetings: number;
  exports: number;
}

interface FounderProfile {
  seed: number;
  baseRequests: number;
  acceptStart: number;
  acceptEnd: number;
  replyStart: number;
  replyEnd: number;
  meetingRate: number;
  exportRate: number;
  templateReplyRate: Record<TemplateId, number>;
  templateShare: Record<TemplateId, number>;
  stageReplyRate: [number, number, number, number];
}

const PROFILES: Record<FounderId, FounderProfile> = {
  nick: {
    seed: 7,
    baseRequests: 23,
    acceptStart: 0.34,
    acceptEnd: 0.41,
    replyStart: 0.17,
    replyEnd: 0.23,
    meetingRate: 0.36,
    exportRate: 0.52,
    templateReplyRate: { A: 0.168, B: 0.204, C: 0.262 },
    templateShare: { A: 0.4, B: 0.33, C: 0.27 },
    stageReplyRate: [0.094, 0.061, 0.041, 0.024],
  },
  johannes: {
    seed: 19,
    baseRequests: 20,
    acceptStart: 0.37,
    acceptEnd: 0.44,
    replyStart: 0.19,
    replyEnd: 0.25,
    meetingRate: 0.41,
    exportRate: 0.57,
    templateReplyRate: { A: 0.179, B: 0.221, C: 0.284 },
    templateShare: { A: 0.34, B: 0.38, C: 0.28 },
    stageReplyRate: [0.103, 0.067, 0.045, 0.027],
  },
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function binomial(n: number, p: number, random: () => number): number {
  let hits = 0;
  for (let i = 0; i < n; i++) if (random() < p) hits++;
  return hits;
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date;
}

function generate(founder: FounderId): DayStat[] {
  const profile = PROFILES[founder];
  const random = mulberry32(profile.seed);
  const today = startOfToday();
  const days: DayStat[] = [];

  for (let i = TOTAL_DAYS - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const t = (TOTAL_DAYS - 1 - i) / (TOTAL_DAYS - 1);
    const weekday = date.getDay();
    const weekdayFactor = weekday === 0 ? 0.42 : weekday === 6 ? 0.55 : weekday === 1 ? 1.08 : 1;
    const growth = 0.82 + 0.3 * t;
    const requests = Math.round(profile.baseRequests * weekdayFactor * growth * (0.82 + random() * 0.36));
    const acceptRate = profile.acceptStart + (profile.acceptEnd - profile.acceptStart) * t;
    const replyRate = profile.replyStart + (profile.replyEnd - profile.replyStart) * t;
    // Annahmen und Nachrichten hängen an früheren Anfragen – hier vereinfacht über das aktuelle Volumen.
    const workload = Math.round(profile.baseRequests * weekdayFactor * growth * (0.85 + random() * 0.3));
    const accepted = binomial(workload, acceptRate, random);
    const messaged = Math.round(accepted * (0.9 + random() * 0.08));
    const replies = binomial(messaged, replyRate, random);
    const meetings = binomial(replies, profile.meetingRate, random);
    const exports = Math.max(meetings, binomial(replies, profile.exportRate, random));
    days.push({ date: date.getTime(), requests, accepted, messaged, replies, meetings, exports });
  }
  return days;
}

export const DAILY: Record<FounderId, DayStat[]> = {
  nick: generate('nick'),
  johannes: generate('johannes'),
};

export interface LiveAdds {
  requests: number;
  messaged: number;
  replies: number;
  exports: number;
}

export type Scope = 'all' | FounderId;

/** Tageswerte für den gewählten Bereich, inkl. der Aktionen aus der laufenden Demo-Sitzung (heute). */
export function dailyFor(scope: Scope, live: Record<FounderId, LiveAdds>): DayStat[] {
  const founders: FounderId[] = scope === 'all' ? ['nick', 'johannes'] : [scope];
  return DAILY.nick.map((_, index) => {
    const isToday = index === DAILY.nick.length - 1;
    const total: DayStat = { date: DAILY.nick[index].date, requests: 0, accepted: 0, messaged: 0, replies: 0, meetings: 0, exports: 0 };
    for (const founder of founders) {
      const day = DAILY[founder][index];
      total.requests += day.requests;
      total.accepted += day.accepted;
      total.messaged += day.messaged;
      total.replies += day.replies;
      total.meetings += day.meetings;
      total.exports += day.exports;
      if (isToday) {
        total.requests += live[founder].requests;
        total.messaged += live[founder].messaged;
        total.replies += live[founder].replies;
        total.exports += live[founder].exports;
      }
    }
    return total;
  });
}

export function sumDays(days: DayStat[]) {
  return days.reduce(
    (acc, day) => ({
      requests: acc.requests + day.requests,
      accepted: acc.accepted + day.accepted,
      messaged: acc.messaged + day.messaged,
      replies: acc.replies + day.replies,
      meetings: acc.meetings + day.meetings,
      exports: acc.exports + day.exports,
    }),
    { requests: 0, accepted: 0, messaged: 0, replies: 0, meetings: 0, exports: 0 },
  );
}

export interface RateStat {
  key: string;
  label: string;
  sent: number;
  replies: number;
  rate: number;
}

/** Antwortquote je Template A/B/C über die sichtbaren 8 Wochen. */
export function templateStats(scope: Scope): RateStat[] {
  const founders: FounderId[] = scope === 'all' ? ['nick', 'johannes'] : [scope];
  return (['A', 'B', 'C'] as TemplateId[]).map((template) => {
    let sent = 0;
    let replies = 0;
    for (const founder of founders) {
      const firstMessages = sumDays(DAILY[founder].slice(-VISIBLE_DAYS)).messaged;
      const templateSent = Math.round(firstMessages * PROFILES[founder].templateShare[template]);
      sent += templateSent;
      replies += Math.round(templateSent * PROFILES[founder].templateReplyRate[template]);
    }
    const label = template === 'C' ? 'C · Recruiting' : `${template} · Meta Ads`;
    return { key: template, label, sent, replies, rate: sent ? replies / sent : 0 };
  });
}

const STAGE_LABELS = ['Erstnachricht', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3'];

/** Antwortquote je Follow-up-Stufe: Anteil der Angeschriebenen, die nach dieser Stufe antworten. */
export function stageStats(scope: Scope): RateStat[] {
  const founders: FounderId[] = scope === 'all' ? ['nick', 'johannes'] : [scope];
  return STAGE_LABELS.map((label, stage) => {
    let sent = 0;
    let replies = 0;
    for (const founder of founders) {
      let remaining = sumDays(DAILY[founder].slice(-VISIBLE_DAYS)).messaged;
      for (let i = 0; i < stage; i++) {
        remaining = Math.round(remaining * (1 - PROFILES[founder].stageReplyRate[i]) * 0.93);
      }
      sent += remaining;
      replies += Math.round(remaining * PROFILES[founder].stageReplyRate[stage]);
    }
    return { key: String(stage), label, sent, replies, rate: sent ? replies / sent : 0 };
  });
}
