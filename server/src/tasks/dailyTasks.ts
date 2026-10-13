import { createHash } from 'node:crypto';
import type { AuthFounderId } from '../../../shared/auth.js';
import type { CockpitLead } from '../../../shared/leads.js';
import { LEAD_TYPE_LABELS, SCORE_TIER_LABELS } from '../../../shared/scoring.js';
import { TASK_TYPES, type AttentionItem, type DailyTask, type TaskType, type TasksResponse } from '../../../shared/tasks.js';

/**
 * Tagesstapel aus den Leads der Datenbank (Vertrag `shared/tasks.ts`) – eine reine Funktion, für Simulation und Live
 * gleich. Erledigt wird eine Aufgabe über die Aktion am Lead; danach fällt sie beim nächsten Abruf heraus.
 */

export interface TaskRules {
  followUpAfterDays: number;
  maxFollowUps: number;
  newLeadsPerDay: number;
  inviteStaleDays: number;
  /** Notiz zur Vernetzungsanfrage anbieten (`INVITE_NOTE`). */
  inviteNote: boolean;
}

/** Anteil der neuen Leads, der bewusst aus der mittleren Score-Stufe kommt. */
export const EXPLORATION_SHARE = 0.15;

const DAY = 24 * 60 * 60 * 1000;

function daysSince(time: number, now: number): number {
  return Math.max(0, Math.floor((now - time) / DAY));
}

function dayText(days: number): string {
  if (days === 0) return 'heute';
  return days === 1 ? 'seit 1 Tag' : `seit ${days} Tagen`;
}

/**
 * Stabile Reihenfolge je Tag (gleiche Auswahl beim erneuten Laden, morgen eine andere). `todayStart` ist der Beginn
 * des Kalendertags in Ortszeit (Europe/Berlin) – der Wechsel kommt um Mitternacht Ortszeit, nicht um 0 Uhr UTC.
 */
function dailyRank(leadId: string, todayStart: number): string {
  return createHash('sha256').update(`${todayStart}:${leadId}`).digest('hex');
}

const scoreOf = (lead: CockpitLead) => lead.score?.total ?? 0;

/** Neue Leads je Gründer: die besten nach Score, plus ~15 % aus der mittleren Stufe (Exploration). */
function pickNewLeads(leads: CockpitLead[], limit: number, todayStart: number): { lead: CockpitLead; exploration: boolean }[] {
  const sorted = [...leads].sort((a, b) => scoreOf(b) - scoreOf(a) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  if (sorted.length <= limit) return sorted.map((lead) => ({ lead, exploration: false }));

  const exploreSlots = Math.max(limit >= 5 ? 1 : 0, Math.round(limit * EXPLORATION_SHARE));
  const main = sorted.slice(0, limit - exploreSlots);
  const rest = sorted.slice(limit - exploreSlots);
  const medium = rest
    .filter((lead) => lead.score?.tier === 'medium')
    .sort((a, b) => dailyRank(a.id, todayStart).localeCompare(dailyRank(b.id, todayStart)));
  const explored = medium.slice(0, exploreSlots);
  // Zu wenige mittlere: mit den nächstbesten auffüllen.
  const filler = rest.filter((lead) => !explored.includes(lead)).slice(0, exploreSlots - explored.length);
  return [
    ...main.map((lead) => ({ lead, exploration: false })),
    ...explored.map((lead) => ({ lead, exploration: true })),
    ...filler.map((lead) => ({ lead, exploration: false })),
  ];
}

function newLeadReason(lead: CockpitLead): string {
  if (!lead.score) return 'Neuer Lead – noch nicht bewertet';
  return `Score ${SCORE_TIER_LABELS[lead.score.tier]} · ${LEAD_TYPE_LABELS[lead.score.leadType]}`;
}

/** Antwort-Aufgabe – je Antwort eine eigene ID, eine zweite Antwort am selben Tag ist wieder offen, nicht „erledigt“. */
function replyTask(lead: CockpitLead, since: number, now: number): DailyTask {
  const days = daysSince(since, now);
  return {
    id: `${lead.id}:reply:${since}`,
    type: 'reply',
    lead,
    dueSince: since,
    reason: days === 0 ? 'Hat heute geantwortet' : `Antwort ${dayText(days)} offen`,
  };
}

/**
 * `invitesToday`: heute (Ortszeit, ab `todayStart`) gesendete Vernetzungsanfragen je Gründer – sie zählen gegen `newLeadsPerDay`, damit nach
 * jeder Anfrage nicht ein weiterer Lead nachrückt.
 */
export function computeTasks(
  allLeads: CockpitLead[],
  owner: AuthFounderId | null,
  rules: TaskRules,
  now = Date.now(),
  invitesToday: Partial<Record<AuthFounderId, number>> = {},
  /** Beginn von „heute“ (ms, Ortszeit) – ohne Angabe UTC-Tag. */
  todayStart = Math.floor(now / DAY) * DAY,
  /** Letzter „Termin vereinbart“ je Lead-ID (Stufe Termin) – erst eine Antwort danach ist eine neue Antwort. */
  meetingsBookedAt: Record<string, number> = {},
): TasksResponse {
  // Übersprungene Leads („für heute überspringen“) fehlen, bis die Zeit um ist.
  const leads = (owner ? allLeads.filter((lead) => lead.owner === owner) : allLeads).filter((lead) => !lead.snoozedUntil || lead.snoozedUntil <= now);
  const followUpMs = rules.followUpAfterDays * DAY;
  const byType: Record<TaskType, DailyTask[]> = { reply: [], followup: [], first: [], lead: [] };
  const attention: AttentionItem[] = [];
  const newLeads = new Map<AuthFounderId, CockpitLead[]>();

  for (const lead of leads) {
    switch (lead.stage) {
      case 'replied': {
        // Schon geantwortet (eigene Nachricht nach der letzten Antwort): keine Aufgabe, bis die Person wieder schreibt.
        // Bleibt es danach FOLLOWUP_AFTER_DAYS still, gehört der Lead unter „Braucht Aufmerksamkeit“.
        if (lead.lastReplyAt !== null && lead.lastContactAt !== null && lead.lastContactAt > lead.lastReplyAt) {
          const quiet = daysSince(lead.lastContactAt, now);
          if (now - lead.lastContactAt >= followUpMs) {
            attention.push({ lead, reason: 'conversation_quiet', detail: `Du hast geantwortet, seitdem Ruhe – ${dayText(quiet)}`, days: quiet });
          }
          break;
        }
        byType.reply.push(replyTask(lead, lead.lastReplyAt ?? lead.lastActivityAt, now));
        break;
      }
      case 'contacted': {
        const last = lead.lastContactAt ?? lead.lastActivityAt;
        const silent = daysSince(last, now);
        if (now - last < followUpMs) break;
        if (lead.followUpsSent >= rules.maxFollowUps) {
          attention.push({
            lead,
            reason: 'followups_done',
            detail: `Alle ${rules.maxFollowUps} Follow-ups gesendet, keine Antwort ${dayText(silent)}`,
            days: silent,
          });
          break;
        }
        const number = lead.followUpsSent + 1;
        byType.followup.push({
          id: `${lead.id}:followup:${number}`,
          type: 'followup',
          lead,
          dueSince: last + followUpMs,
          reason: `Keine Antwort ${dayText(silent)} – Follow-up ${number} von ${rules.maxFollowUps}`,
          followUpNumber: number,
        });
        break;
      }
      case 'connected': {
        const days = daysSince(lead.lastActivityAt, now);
        byType.first.push({
          id: `${lead.id}:first`,
          type: 'first',
          lead,
          dueSince: lead.lastActivityAt,
          reason: days === 0 ? 'Heute vernetzt – Erstnachricht fehlt' : `Vernetzt ${dayText(days)} – Erstnachricht fehlt`,
        });
        break;
      }
      case 'new': {
        const list = newLeads.get(lead.owner) ?? [];
        list.push(lead);
        newLeads.set(lead.owner, list);
        break;
      }
      case 'invited': {
        const days = daysSince(lead.lastContactAt ?? lead.lastActivityAt, now);
        if (days >= rules.inviteStaleDays) {
          attention.push({ lead, reason: 'invite_stale', detail: `Anfrage ${dayText(days)} offen`, days });
        }
        break;
      }
      case 'meeting': {
        // Antwort nach dem Termin (die Stufe bleibt „Termin“): wieder eine Antwort-Aufgabe – bis du antwortest.
        const answered = Math.max(lead.lastContactAt ?? 0, meetingsBookedAt[lead.id] ?? 0);
        if (lead.lastReplyAt !== null && lead.lastReplyAt > answered) byType.reply.push(replyTask(lead, lead.lastReplyAt, now));
        const days = daysSince(lead.lastActivityAt, now);
        attention.push({ lead, reason: 'meeting_open', detail: `Termin vereinbart, ${dayText(days)} nicht übergeben`, days });
        break;
      }
    }
  }

  // Neue Leads: Tageslimit je Gründer (LinkedIn-Limit gilt je Account), abzüglich der heute schon gesendeten Anfragen.
  // Heute aus der Lead-Suche übergebene Leads sind immer dabei – wer gerade gesucht hat, will sie sofort im Stapel sehen.
  const today = todayStart;
  for (const [founder, list] of newLeads) {
    // Nur Leads aus einer Suche von Hand – die automatische Suche (`origin.auto`) zählt gegen das Tageslimit.
    const isFresh = (lead: CockpitLead) => lead.origin.kind === 'search' && !lead.origin.auto && lead.createdAt >= today;
    const fresh = list.filter(isFresh).sort((a, b) => scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id));
    const older = list.filter((lead) => !isFresh(lead));
    const slots = Math.max(0, rules.newLeadsPerDay - (invitesToday[founder] ?? 0) - fresh.length);
    const picked = [...fresh.map((lead) => ({ lead, exploration: false })), ...(slots > 0 ? pickNewLeads(older, slots, todayStart) : [])];
    for (const { lead, exploration } of picked) {
      byType.lead.push({
        id: `${lead.id}:lead`,
        type: 'lead',
        lead,
        dueSince: lead.createdAt,
        reason: exploration ? `${newLeadReason(lead)} · zum Vergleich ausgewählt` : newLeadReason(lead),
        ...(exploration ? { exploration: true } : {}),
      });
    }
  }

  const byAge = (a: DailyTask, b: DailyTask) => a.dueSince - b.dueSince || a.id.localeCompare(b.id);
  byType.reply.sort(byAge);
  byType.followup.sort(byAge);
  byType.first.sort(byAge);
  byType.lead.sort((a, b) => scoreOf(b.lead) - scoreOf(a.lead) || byAge(a, b));
  attention.sort((a, b) => b.days - a.days || a.lead.id.localeCompare(b.lead.id));

  return {
    tasks: TASK_TYPES.flatMap((type) => byType[type]),
    counts: { reply: byType.reply.length, followup: byType.followup.length, first: byType.first.length, lead: byType.lead.length },
    attention,
    owner,
    generatedAt: now,
    rules: { ...rules },
    invitesToday: owner ? { [owner]: invitesToday[owner] ?? 0 } : { ...invitesToday },
  };
}
