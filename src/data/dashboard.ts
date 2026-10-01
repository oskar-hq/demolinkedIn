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

function startOfToday(): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date;
}

const WEEKS = TOTAL_DAYS / 7;
/** Gewichtung je Wochentag (So = 0). Outreach läuft am Wochenende gedrosselt weiter. */
const WEEKDAY_WEIGHT = [0.66, 1.06, 1, 1, 1, 0.96, 0.74];

/** Verteilt eine Wochensumme ganzzahlig auf die Tage (Largest-Remainder-Verfahren). */
function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((weight) => (total * weight) / sum);
  const result = exact.map(Math.floor);
  let rest = total - result.reduce((a, b) => a + b, 0);
  const order = exact.map((value, index) => ({ index, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac);
  for (const { index } of order) {
    if (rest-- <= 0) break;
    result[index]++;
  }
  return result;
}

/**
 * Erst Wochensummen mit stetigem Aufwärtstrend (die aktuelle Woche liegt immer über der Vorwoche),
 * dann Verteilung auf Tage mit leichtem Rauschen.
 */
function generate(founder: FounderId): DayStat[] {
  const profile = PROFILES[founder];
  const random = mulberry32(profile.seed);
  const noise = (amount: number) => (random() * 2 - 1) * amount;
  const today = startOfToday();
  const days: DayStat[] = [];

  for (let week = 0; week < WEEKS; week++) {
    const t = week / (WEEKS - 1);
    const isLast = week === WEEKS - 1;
    const isSecondLast = week === WEEKS - 2;
    // Rauschen der letzten beiden Wochen festlegen, damit der Vorwochenvergleich positiv ausfällt.
    const volumeNoise = isLast ? 0.05 : isSecondLast ? -0.02 : noise(0.04);
    const rateNoise = isLast ? 0.004 : isSecondLast ? -0.003 : noise(0.006);

    const requests = Math.round(profile.baseRequests * 6.02 * (0.78 + 0.34 * t) * (1 + volumeNoise));
    const acceptRate = profile.acceptStart + (profile.acceptEnd - profile.acceptStart) * t + rateNoise;
    const replyRate = profile.replyStart + (profile.replyEnd - profile.replyStart) * t + rateNoise;
    const accepted = Math.round(requests * acceptRate);
    const messaged = Math.round(accepted * 0.93);
    const replies = Math.round(messaged * replyRate);
    const meetings = Math.round(replies * (profile.meetingRate + (isLast ? 0.05 : isSecondLast ? -0.03 : noise(0.1))));
    const exports = Math.max(meetings, Math.round(replies * (profile.exportRate + (isLast ? 0.04 : noise(0.08)))));

    const dates: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() - (TOTAL_DAYS - 1 - (week * 7 + d)));
      dates.push(date);
    }
    const weights = dates.map((date) => WEEKDAY_WEIGHT[date.getDay()] * (1 + noise(0.12)));
    const split = (total: number) => distribute(total, weights);
    const [r, a, m, rep, meet, exp] = [requests, accepted, messaged, replies, meetings, exports].map(split);
    dates.forEach((date, d) =>
      days.push({
        date: date.getTime(),
        requests: r[d],
        accepted: a[d],
        messaged: m[d],
        replies: rep[d],
        meetings: meet[d],
        exports: exp[d],
      }),
    );
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
