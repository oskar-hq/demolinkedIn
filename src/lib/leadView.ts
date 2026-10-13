import { REPLY_INTENT_LABELS, type LeadConversation } from '../../shared/messages';
import { CATEGORY_LABELS, germanDate, isQualifyingCategory, metaAdsLabel } from '../../shared/leadSearch';
import type { CockpitLead, LeadEvent } from '../../shared/leads';
import { safeHref } from './safeHref';

/**
 * Anzeige-Helfer für Leads aus der Datenbank (`shared/leads.ts`). Ersetzt für das Cockpit die Helfer aus
 * `leadInfo.ts`, die nur noch die Demo-Daten in `src/data/` (Seed des Backends) bedienen.
 */

export const leadName = (lead: CockpitLead) => `${lead.person.firstName} ${lead.person.lastName}`.trim();

export const leadInitials = (lead: CockpitLead) =>
  `${lead.person.firstName.charAt(0)}${lead.person.lastName.charAt(0)}`.toUpperCase() || '?';

export const leadCompany = (lead: CockpitLead) => lead.company.name || 'Firma unbekannt';

export const leadPosition = (lead: CockpitLead) => lead.person.position || lead.person.headline;

export const leadRegion = (lead: CockpitLead) => lead.company.region ?? lead.person.location ?? null;

export function leadIndustry(lead: CockpitLead): string | null {
  return lead.company.industry ?? (lead.assessment ? CATEGORY_LABELS[lead.assessment.category] : null);
}

export interface FitView {
  label: string;
  good: boolean;
}

/** KI-Einschätzung wie in der Lead-Suche: „Passt (Kapitalanlage-Vertrieb)“ bzw. „Vermutlich unpassend (Makler)“. */
export function leadFit(lead: CockpitLead): FitView | null {
  if (!lead.assessment) return null;
  const { category } = lead.assessment;
  const good = isQualifyingCategory(category);
  return { label: `${good ? 'Passt' : 'Vermutlich unpassend'} (${CATEGORY_LABELS[category]})`, good };
}

export const confidencePercent = (lead: CockpitLead) =>
  lead.assessment ? `${Math.round(lead.assessment.confidence * 100)} %` : null;

/** Profil-Link (volle URL) – aus der Suche oder aus dem öffentlichen Kennzeichen. */
export function linkedinProfileUrl(lead: CockpitLead): string | null {
  // Nur http(s) – eine eingeschleuste `javascript:`-Adresse wird nie zum Link (LeadPanel, LeadCard, FocusParts).
  const profile = safeHref(lead.person.profileUrl);
  if (profile) return profile;
  if (lead.person.publicIdentifier) return `https://www.linkedin.com/in/${encodeURIComponent(lead.person.publicIdentifier)}`;
  return null;
}

/** Profil-Link ohne Protokoll, zum Anzeigen. */
export const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** Signal aus der Lead-Suche bzw. der Demo: steht im ersten Ereignis („Signal: Meta Ads aktiv – …“). */
export interface LeadSignal {
  kind: 'meta_ads' | 'hiring' | 'search';
  /** Kurztext für die Karte, z. B. „Meta Ads aktiv“, „Sucht: Vertriebsmitarbeiter (m/w/d)“, „Keine Meta-Ads · 2. Grad“. */
  label: string;
  /** Bei Recruiting: die ausgeschriebene Stelle (für {{stelle}}). */
  role?: string;
}

const SIGNAL_TEXT = /^Signal: (.+?)(?: – |$)/;

export function leadSignal(lead: CockpitLead, events?: LeadEvent[]): LeadSignal | null {
  if (lead.origin.kind === 'search' || lead.metaAds) {
    const ads = lead.metaAds;
    const distance = lead.person.networkDistance === 2 || lead.person.networkDistance === 3 ? ` · ${lead.person.networkDistance}. Grad` : '';
    // Der Pain-Point steht vorn: keine oder beendete Meta-Ads.
    const label =
      ads?.state === 'none'
        ? 'Keine Meta-Ads'
        : ads?.state === 'stopped'
          ? ads.lastStop
            ? `Meta-Ads aus seit ${germanDate(ads.lastStop)}`
            : 'Meta-Ads beendet'
          : ads?.state === 'active'
            ? metaAdsLabel(ads)
            : 'Lead-Suche';
    return { kind: ads?.state === 'active' ? 'meta_ads' : 'search', label: `${label}${distance}` };
  }
  const created = events?.find((event) => event.kind === 'created');
  const match = created?.text?.match(SIGNAL_TEXT);
  if (!match) return null;
  const label = match[1];
  if (label.startsWith('Sucht: ')) return { kind: 'hiring', label, role: label.slice('Sucht: '.length) };
  if (/meta.?ads aktiv/i.test(label)) return { kind: 'meta_ads', label };
  return { kind: 'search', label };
}

/** Eine Nachricht im Gespräch, abgeleitet aus dem Verlauf. Richtung immer aus der Ereignisart, nie aus `by`. */
export interface ThreadMessage {
  id: string;
  from: 'founder' | 'lead';
  text: string;
  at: number;
  /** Absenderzeile, z. B. „Erstnachricht · Template A“ oder „Follow-up 1 · Variante B“. */
  label: string | null;
  founder: CockpitLead['owner'] | null;
  /** Noch nicht gespeichert (Rückgängig-Fenster) bzw. wird gerade gespeichert. */
  pending?: boolean;
}

/** „Follow-up 1 · Variante A gesendet“ → „Follow-up 1 · Variante A“; „Nachricht gesendet“ → null. */
function messageLabel(event: LeadEvent): string | null {
  const title = event.title.replace(/ gesendet.*$/, '').trim();
  return title && title !== 'Nachricht' ? title : null;
}

export function threadMessages(events: LeadEvent[]): ThreadMessage[] {
  return events
    .filter((event) => event.kind === 'message_sent' || event.kind === 'message_received')
    .map((event) => ({
      id: event.id,
      from: event.kind === 'message_sent' ? 'founder' : 'lead',
      text: event.text ?? '',
      at: event.at,
      label: event.kind === 'message_sent' ? messageLabel(event) : null,
      founder: event.kind === 'message_sent' ? event.by : null,
    }));
}

/** Wörter der Fehlermeldungen des Backends, die nicht für Menschen gedacht sind (Validierung auf Englisch). */
export function readableError(error: { code: string; message: string }, fallback: string): string {
  if (error.code === 'invalid_request' || error.code === 'error') return fallback;
  return error.message || fallback;
}

/**
 * Einschätzung der Antwort als Label + Satz. Die schnelle Einschätzung ohne KI beginnt ihren Satz oft mit dem Label
 * („Kein Interesse – höflich abschließen.“) – dann ohne die Wiederholung.
 */
export function replyAssessmentParts(conversation: LeadConversation): { label: string; detail: string } {
  const label = REPLY_INTENT_LABELS[conversation.replyIntent];
  const summary = conversation.replySummary.trim();
  const detail = summary.startsWith(label) ? summary.slice(label.length).replace(/^[\s–—:-]+/, '') : summary;
  return { label, detail };
}
