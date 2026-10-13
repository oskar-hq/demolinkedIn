import { createHash, randomUUID } from 'node:crypto';
import type { AuthFounderId } from '../../../shared/auth.js';
import type { Config } from '../config.js';
import type { Database } from '../db/database.js';

/**
 * Schutzgrenzen für echte LinkedIn-Aktionen (Vertrag `shared/linkedin.ts`): Arbeitszeit, Tages-/Wochenlimits aus dem
 * Protokoll `linkedin_actions`, Pausen nach Limit- oder Zugangsfehlern (`linkedin_pauses`, überstehen einen Neustart).
 */

export type ActionKind = 'invite' | 'message';
export type ActionStatus = 'sent' | 'failed';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

interface LocalTime {
  /** YYYY-MM-DD in der Zeitzone. */
  day: string;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
}

/** Ein Formatierer je Zeitzone – das Anlegen ist teuer, `localTime` läuft oft (Planer, Abfragen alle paar Sekunden). */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

export function localTime(now: number, timeZone: string): LocalTime {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(new Date(now))
      .map((part) => [part.type, part.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday] ?? 1,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function withinWorkHours(config: Config['linkedin'], now: number): boolean {
  const local = localTime(now, config.workHours.timeZone);
  return config.workHours.days.includes(local.weekday) && local.hour >= config.workHours.fromHour && local.hour < config.workHours.toHour;
}

/** Sekunden bis Mitternacht in der Zeitzone (für Retry-After beim Tageslimit). */
export function secondsUntilMidnight(now: number, timeZone: string): number {
  const local = localTime(now, timeZone);
  return Math.max(1, 24 * 3600 - (local.hour * 3600 + local.minute * 60 + local.second));
}

/** Beginn des Kalendertags in der Zeitzone (ms) – „heute“ im Tagesstapel. */
export function localDayStart(now: number, timeZone: string): number {
  const local = localTime(now, timeZone);
  return now - (now % 1000) - (local.hour * 3600 + local.minute * 60 + local.second) * 1000;
}

/** Nächste Mitternacht in der Zeitzone (ms). */
export function nextLocalMidnight(now: number, timeZone: string): number {
  return now - (now % 1000) + secondsUntilMidnight(now, timeZone) * 1000;
}

/** Stabile Zahl je Text – Simulation: welche Anfrage „angenommen“ wird, wer „antwortet“. */
export function stableNumber(text: string): number {
  return createHash('sha256').update(text).digest()[0];
}

export interface Usage {
  invitesToday: number;
  invitesWeek: number;
  messagesToday: number;
  /** Ältester Versand der letzten 7 Tage (für Retry-After beim Wochenlimit). */
  oldestInviteInWeek: number | null;
}

export class LinkedInGuard {
  constructor(
    private readonly db: Database,
    private readonly config: Config['linkedin'],
  ) {}

  record(entry: { founder: AuthFounderId; accountId: string | null; leadId: string | null; kind: ActionKind; status: ActionStatus; detail: string | null }, now: number): void {
    this.db
      .prepare('INSERT INTO linkedin_actions (id, founder, account_id, lead_id, kind, status, detail, day, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        randomUUID(),
        entry.founder,
        entry.accountId,
        entry.leadId,
        entry.kind,
        entry.status,
        entry.detail,
        localTime(now, this.config.workHours.timeZone).day,
        now,
      );
  }

  usage(founder: AuthFounderId, now: number): Usage {
    const day = localTime(now, this.config.workHours.timeZone).day;
    const count = (kind: ActionKind, where: string, value: string | number) =>
      (
        this.db
          .prepare(`SELECT COUNT(*) AS n FROM linkedin_actions WHERE founder = ? AND kind = ? AND status = 'sent' AND ${where}`)
          .get(founder, kind, value) as { n: number }
      ).n;
    const oldest = this.db
      .prepare(`SELECT MIN(at) AS at FROM linkedin_actions WHERE founder = ? AND kind = 'invite' AND status = 'sent' AND at > ?`)
      .get(founder, now - 7 * DAY_MS) as { at: number | null };
    return {
      invitesToday: count('invite', 'day = ?', day),
      invitesWeek: count('invite', 'at > ?', now - 7 * DAY_MS),
      messagesToday: count('message', 'day = ?', day),
      oldestInviteInWeek: oldest.at,
    };
  }

  /** null = erlaubt, sonst { Satz, Sekunden bis es wieder geht }. */
  limitReached(founder: AuthFounderId, kind: ActionKind, now: number): { message: string; retryAfter: number } | null {
    const usage = this.usage(founder, now);
    const untilMidnight = secondsUntilMidnight(now, this.config.workHours.timeZone);
    if (kind === 'invite') {
      if (usage.invitesToday >= this.config.invitesPerDay) {
        return { message: `Tageslimit für Vernetzungsanfragen erreicht (${this.config.invitesPerDay}) – morgen geht es weiter.`, retryAfter: untilMidnight };
      }
      if (usage.invitesWeek >= this.config.invitesPerWeek) {
        const retryAfter = usage.oldestInviteInWeek ? Math.max(1, Math.ceil((usage.oldestInviteInWeek + 7 * DAY_MS - now) / 1000)) : untilMidnight;
        return { message: `Wochenlimit für Vernetzungsanfragen erreicht (${this.config.invitesPerWeek} in 7 Tagen).`, retryAfter };
      }
      return null;
    }
    if (usage.messagesToday >= this.config.messagesPerDay) {
      return { message: `Tageslimit für Nachrichten erreicht (${this.config.messagesPerDay}) – morgen geht es weiter.`, retryAfter: untilMidnight };
    }
    return null;
  }

  pause(founder: AuthFounderId): { until: number; reason: string } | null {
    const row = this.db.prepare('SELECT paused_until, reason FROM linkedin_pauses WHERE founder = ?').get(founder) as
      | { paused_until: number; reason: string }
      | undefined;
    return row ? { until: row.paused_until, reason: row.reason } : null;
  }

  activePause(founder: AuthFounderId, now: number): { until: number; reason: string } | null {
    const pause = this.pause(founder);
    return pause && pause.until > now ? pause : null;
  }

  setPause(founder: AuthFounderId, until: number, reason: string): void {
    this.db
      .prepare('INSERT INTO linkedin_pauses (founder, paused_until, reason) VALUES (?, ?, ?) ON CONFLICT(founder) DO UPDATE SET paused_until = excluded.paused_until, reason = excluded.reason')
      .run(founder, until, reason);
  }

  clearPause(founder: AuthFounderId): boolean {
    return Number(this.db.prepare('DELETE FROM linkedin_pauses WHERE founder = ?').run(founder).changes) > 0;
  }

  /** true, wenn die Nachricht neu ist (und merkt sie sich). */
  markSeen(messageId: string, leadId: string, now: number): boolean {
    return Number(this.db.prepare('INSERT OR IGNORE INTO linkedin_seen_messages (message_id, lead_id, at) VALUES (?, ?, ?)').run(messageId, leadId, now).changes) > 0;
  }
}
