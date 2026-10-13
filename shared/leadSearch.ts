/**
 * Gemeinsames Datenmodell der Lead-Suche – wird von Frontend (Vite) und Backend (Node) importiert.
 * Bewusst ohne Laufzeit-Abhängigkeiten, damit beide Seiten die Datei direkt einbinden können
 * (nur `import type` aus anderen Vertragsdateien).
 */
import type { LeadScore } from './scoring.js';

export type LeadSearchMode = 'mock' | 'live';

/**
 * Obergrenze für Profilabrufe pro Lauf – gilt in Oberfläche und Backend. Bis 11.10. fest 25 (Schutz des LinkedIn-
 * Accounts); auf Wunsch des Nutzers praktisch unbegrenzt: so hoch wie die Suchtreffer pro Lauf (`SEARCH_HITS_MAX`) –
 * mehr Profile als Treffer kann ein Lauf nicht lesen. Pausen von 3–8 s und Abbruch bei Limit-Fehlern bleiben.
 */
export const MAX_RESULTS_LIMIT = 1000;
export const MAX_RESULTS_DEFAULT = 15;
/**
 * Suchtreffer pro Lauf (Einstellung `SEARCH_HITS_PER_RUN`, Wunsch des Kunden 11.10.: 400 Kontakte pro Lauf durchsehen).
 * Treffer kosten nur Suchseiten, keine Profilbesuche – alle gehen durch Dubletten-Filter und KI-Vorprüfung, angereichert
 * werden davon höchstens `maxResults`. Seit 12.10. zählt die Warteliste mit (`RunSearchPlan`), keine heimliche Verdopplung.
 */
export const SEARCH_HITS_DEFAULT = 400;
export const SEARCH_HITS_MIN = 20;
export const SEARCH_HITS_MAX = 1000;

// ───────────────────────────── Suchprofil ─────────────────────────────

export interface SearchProfile {
  keywords: string[];
  positions: string[];
  region: string;
  /** Höchstzahl der Profile, die pro Lauf abgerufen werden (1–`MAX_RESULTS_LIMIT`). */
  maxResults: number;
}

export const DEFAULT_SEARCH_PROFILE: SearchProfile = {
  keywords: ['Kapitalanlage', 'Bauträger', 'Projektentwicklung', 'Immobilienvertrieb'],
  positions: ['Geschäftsführer', 'Inhaber', 'Gründer', 'Gesellschafter', 'CEO', 'Vorstand'],
  region: 'Deutschland',
  maxResults: MAX_RESULTS_DEFAULT,
};

/**
 * Zielgruppe der Suche (Wunsch des Nutzers 12.10.: „unterscheiden in Bauträger und Kapitalanlage, je nachdem anderes
 * Preset“). Wählt man eine, setzt die Oberfläche Stichwörter und Positionen; „beide“ = `DEFAULT_SEARCH_PROFILE`.
 * Die Werte bleiben danach frei änderbar.
 */
export type SearchAudience = 'kapitalanlage_vertrieb' | 'bautraeger_projektentwickler' | 'beide';

export interface SearchPreset {
  label: string;
  /** Ein Satz, wen das Preset findet. */
  hint: string;
  keywords: readonly string[];
  positions: readonly string[];
}

export const SEARCH_PRESETS: Record<SearchAudience, SearchPreset> = {
  kapitalanlage_vertrieb: {
    label: 'Kapitalanlage',
    hint: 'Vertriebe für Kapitalanlage-Immobilien – Geschäftsführung und Vertriebsleitung.',
    keywords: ['Kapitalanlage', 'Kapitalanlageimmobilien', 'Immobilienvertrieb', 'Anlageimmobilien'],
    positions: ['Geschäftsführer', 'Inhaber', 'Gründer', 'Vertriebsleiter', 'Head of Sales', 'CEO'],
  },
  bautraeger_projektentwickler: {
    label: 'Bauträger',
    hint: 'Bauträger und Projektentwickler – Geschäftsführung, Inhaber, Prokuristen.',
    keywords: ['Bauträger', 'Projektentwicklung', 'Projektentwickler', 'Wohnungsbau'],
    positions: ['Geschäftsführer', 'Inhaber', 'Gesellschafter', 'Prokurist', 'CEO', 'Vorstand'],
  },
  beide: {
    label: 'Beide',
    hint: 'Kapitalanlage-Vertriebe und Bauträger in einer Suche.',
    keywords: DEFAULT_SEARCH_PROFILE.keywords,
    positions: DEFAULT_SEARCH_PROFILE.positions,
  },
};

/** Zu welchem Preset passen Stichwörter und Positionen genau? null = eigene Auswahl. */
export function searchAudienceOf(profile: Pick<SearchProfile, 'keywords' | 'positions'>): SearchAudience | null {
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((term) => b.some((other) => other.toLowerCase() === term.toLowerCase()));
  for (const audience of Object.keys(SEARCH_PRESETS) as SearchAudience[]) {
    const preset = SEARCH_PRESETS[audience];
    if (same(profile.keywords, preset.keywords) && same(profile.positions, preset.positions)) return audience;
  }
  return null;
}

/** Kontaktgrad ist fest: nur 2. und 3. Grad – also keine bestehenden Verbindungen. */
export const NETWORK_DISTANCES = [2, 3] as const;

export function clampMaxResults(value: number): number {
  if (!Number.isFinite(value)) return MAX_RESULTS_DEFAULT;
  return Math.min(MAX_RESULTS_LIMIT, Math.max(1, Math.round(value)));
}

// ───────────────────────────── Kategorien ─────────────────────────────

export const LEAD_CATEGORIES = [
  'kapitalanlage_vertrieb',
  'bautraeger_projektentwickler',
  'makler',
  'hausverwaltung',
  'asset_manager_bestandshalter',
  'bauunternehmen_fuer_dritte',
  'sonstiges',
] as const;

export type LeadCategory = (typeof LEAD_CATEGORIES)[number];

/** Nur diese beiden Kategorien gelten als qualifiziert. */
export const QUALIFYING_CATEGORIES: readonly LeadCategory[] = ['kapitalanlage_vertrieb', 'bautraeger_projektentwickler'];

export const CATEGORY_LABELS: Record<LeadCategory, string> = {
  kapitalanlage_vertrieb: 'Kapitalanlage-Vertrieb',
  bautraeger_projektentwickler: 'Bauträger / Projektentwicklung',
  makler: 'Makler',
  hausverwaltung: 'Hausverwaltung',
  asset_manager_bestandshalter: 'Asset Manager / Bestandshalter',
  bauunternehmen_fuer_dritte: 'Bauunternehmen für Dritte',
  sonstiges: 'Sonstiges',
};

export function isQualifyingCategory(category: LeadCategory): boolean {
  return QUALIFYING_CATEGORIES.includes(category);
}

// ───────────────────────────── Pipeline-Daten ─────────────────────────────

/** 1 = bereits vernetzt, 2/3 = 2./3. Grad, null = außerhalb des Netzwerks bzw. unbekannt. */
export type NetworkDistance = 1 | 2 | 3 | null;

/** Schritt 1 – ein Treffer aus der Suche. */
export interface SearchHit {
  /** LinkedIn-/Provider-ID – Schlüssel für den Dubletten-Abgleich. */
  providerId: string;
  publicIdentifier: string | null;
  firstName: string;
  lastName: string;
  headline: string;
  location: string | null;
  networkDistance: NetworkDistance;
  profileUrl: string | null;
  /** Liefert die Suche bereits den Hinweis auf eine offene Vernetzungsanfrage, steht er hier. */
  pendingInvitation?: boolean;
}

/** Schritt 3 – angereichertes Profil (soweit verfügbar). */
export interface EnrichedProfile {
  headline: string;
  position: string | null;
  companyName: string | null;
  companyDescription: string | null;
  companyWebsite: string | null;
  companyIndustry: string | null;
  location: string | null;
}

/** Schritt 4 – validierte KI-Einschätzung. */
export interface Qualification {
  category: LeadCategory;
  /** true nur bei den beiden qualifizierenden Kategorien – streng ausgelegt. */
  qualified: boolean;
  /** 0–1 */
  confidence: number;
  /** Begründung in einem Satz. */
  reason: string;
  /** Zwei Sätze für die Karte im Tagesstapel. */
  summary: string;
}

/**
 * Schritt 4b – Meta-Werbebibliothek. Gesucht sind Firmen, die gerade KEINE Meta-Ads schalten:
 * none = keine eigenen Anzeigen gefunden (noch nie probiert) · stopped = Anzeigen beendet (lief nicht) ·
 * active = schaltet gerade Anzeigen → geht markiert in den Tagesstapel (Kampagnen von Hand prüfen, Entscheidung
 * 07.10.) · unchecked = nicht geprüft (kein Token, Fehler, keine Firma).
 */
export type MetaAdsState = 'none' | 'stopped' | 'active' | 'unchecked';

export interface MetaAdsCheck {
  state: MetaAdsState;
  /** Name des Werbetreibenden laut Werbebibliothek (nur bei eigenen Anzeigen). */
  advertiser: string | null;
  /** Eigene Anzeigen, die die Werbebibliothek kennt (EU: alle Anzeigen bis 1 Jahr nach der letzten Ausspielung). */
  ads: number;
  /** Davon gerade aktiv. */
  activeAds: number;
  /** Ende der zuletzt beendeten eigenen Anzeige (JJJJ-MM-TT) – nur bei „stopped“. */
  lastStop: string | null;
  /** Anzeigen anderer Werbetreibender zum selben Suchbegriff – zählen nicht. */
  foreignAds: number;
  /** Link in die Werbebibliothek zum Nachprüfen mit einem Klick. */
  libraryUrl: string | null;
  /** Kurzer Hinweis, z. B. warum nicht geprüft wurde. */
  note: string | null;
  /** true = im Lead-Panel von Hand eingetragen (`UpdateLeadRequest.metaAds`). */
  manual?: boolean;
}

/** Kurztext für Liste und Karte, z. B. „Meta-Ads beendet am 12.08.2026“. */
export function metaAdsLabel(check: MetaAdsCheck): string {
  switch (check.state) {
    case 'active':
      return `Aktive Meta-Ads (${check.activeAds}) – von Hand prüfen`;
    case 'stopped':
      return check.lastStop ? `Meta-Ads beendet am ${germanDate(check.lastStop)}` : 'Meta-Ads beendet';
    case 'none':
      return 'Keine Meta-Ads gefunden';
    case 'unchecked':
      return 'Meta-Ads nicht geprüft';
  }
}

/** „2026-08-12“ → „12.08.2026“ */
export function germanDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

export type LeadStatus =
  | 'found'
  | 'unique'
  /**
   * Von der KI-Vorprüfung aussortiert (nur Name, Headline, Ort aus der Suche) – klar falsche Branche oder Region,
   * deshalb kein Profilabruf. Endzustand, zählt als geprüft.
   */
  | 'screened_out'
  | 'enriching'
  | 'enriched'
  | 'qualifying'
  /** Von der KI qualifiziert, Meta-Werbebibliothek wird geprüft. */
  | 'checking_ads'
  /** Fertig: passende Firma ohne aktive Meta-Ads – geht in den Tagesstapel. */
  | 'qualified'
  /**
   * Passende Firma, schaltet gerade Meta-Ads → geht ebenfalls in den Tagesstapel, markiert „Aktive Meta-Ads – prüfen“
   * (Entscheidung 07.10.: dort wird oft viel Geld verbrannt, jemand prüft die Kampagnen von Hand).
   */
  | 'ads_active'
  | 'rejected'
  /** Angereichert, aber ohne KI-Bewertung (kein ANTHROPIC_API_KEY). */
  | 'unrated'
  | 'duplicate'
  | 'invited'
  | 'connected'
  | 'deferred'
  | 'failed';

/** Im Dubletten-Filter aussortiert. */
export const DEDUPE_STATUSES: readonly LeadStatus[] = ['duplicate', 'invited', 'connected'];
/** Endzustände – an diesen Leads ändert sich im Lauf nichts mehr. */
export const FINAL_STATUSES: readonly LeadStatus[] = [
  'screened_out',
  'qualified',
  'ads_active',
  'rejected',
  'unrated',
  'duplicate',
  'invited',
  'connected',
  'deferred',
  'failed',
];

export interface PipelineLead {
  id: string;
  hit: SearchHit;
  status: LeadStatus;
  /** Kurzer, verständlicher Grund bzw. Hinweis zum Status. */
  note: string | null;
  profile: EnrichedProfile | null;
  qualification: Qualification | null;
  /** Ergebnis der Meta-Werbebibliothek – nur bei Leads, die die KI qualifiziert hat. */
  metaAds: MetaAdsCheck | null;
  /** Scoring v1 (siehe `scoring.ts`) – gesetzt, sobald die KI den Lead bewertet hat. */
  score?: LeadScore | null;
  /**
   * Ergebnis der KI-Vorprüfung anhand der Suchdaten (vor dem Profilabruf): likely = passt vermutlich (zuerst
   * angereichert), maybe = unklar, no = aussortiert (`screened_out`). Fehlt, solange nicht vorgeprüft.
   */
  prescreen?: PrescreenVerdict | null;
  /** Von Hand qualifiziert (Wunsch des Nutzers 12.10.) – nach dem Lauf beim Durchsehen der Liste. */
  manual?: boolean;
}

export type PrescreenFit = 'likely' | 'maybe' | 'no';

export interface PrescreenVerdict {
  fit: PrescreenFit;
  /** Ein kurzer Satz, z. B. „Versicherungsvertrieb – keine Immobilienfirma“. */
  reason: string;
}

export interface FunnelCounts {
  found: number;
  unique: number;
  /** Nach der KI-Vorprüfung noch im Rennen (ohne Dubletten, nicht `screened_out`). */
  screened?: number;
  enriched: number;
  /** Von der KI als passende Firma eingestuft (vor dem Meta-Ads-Filter). */
  fit: number;
  /** Passende Firma ohne aktive Meta-Ads – übergabebereit. */
  qualified: number;
}

/**
 * Diese Leads darf man nach dem Lauf von Hand als qualifiziert einstufen
 * (`POST /api/lead-search/runs/:id/leads/:leadId/qualify`). Dubletten, Vernetzte und offene Anfragen nicht.
 */
export const MANUAL_QUALIFY_STATUSES: readonly LeadStatus[] = ['rejected', 'screened_out', 'deferred', 'unrated', 'failed'];

/**
 * Antwort auf `POST /api/lead-search/runs/:id/leads/:leadId/qualify`: Der Lead steht danach auf `qualified` mit
 * `manual: true` und geht bei der Übergabe mit. War der Lauf schon übergeben (`run.handedOff`, z. B. automatische
 * Suche), legt die Oberfläche `card` selbst an (`POST /api/leads`).
 * Fehler: 404 not_found · 409 running (Lauf läuft noch) · 400 invalid_request (Status nicht in `MANUAL_QUALIFY_STATUSES`).
 */
export interface ManualQualifyResponse {
  run: RunSnapshot;
  lead: PipelineLead;
  card: NewLeadCard;
}

/** Diese Leads gehen bei der Übergabe in den Tagesstapel (`/runs/:id/handoff`, automatische Suche). */
export const HANDOFF_STATUSES: readonly LeadStatus[] = ['qualified', 'ads_active'];

/** Wie viele Leads eines Laufs in den Tagesstapel gehen. */
export function handoffCount(leads: PipelineLead[]): number {
  return leads.filter((lead) => HANDOFF_STATUSES.includes(lead.status)).length;
}

/** Trichterzahlen immer aus den Lead-Status ableiten – so passen Zahlen und Liste zusammen. */
export function funnelOf(leads: PipelineLead[]): FunnelCounts {
  let unique = 0;
  let screened = 0;
  let enriched = 0;
  let fit = 0;
  let qualified = 0;
  for (const lead of leads) {
    if (!DEDUPE_STATUSES.includes(lead.status) && lead.status !== 'found') unique++;
    if (!DEDUPE_STATUSES.includes(lead.status) && lead.status !== 'found' && lead.status !== 'screened_out') screened++;
    if (lead.profile && !DEDUPE_STATUSES.includes(lead.status)) enriched++;
    if (lead.qualification?.qualified && !DEDUPE_STATUSES.includes(lead.status)) fit++;
    if (lead.status === 'qualified') qualified++;
  }
  return { found: leads.length, unique, screened, enriched, fit, qualified };
}

// ───────────────────────────── Lauf ─────────────────────────────

/** `screen` = KI-Vorprüfung der Suchtreffer (vor dem Profilabruf). */
export type RunPhase = 'search' | 'dedupe' | 'screen' | 'enrich' | 'done';
export type RunStatus = 'running' | 'done' | 'cancelled' | 'failed';

export type RunErrorCode = 'rate_limit' | 'auth' | 'config' | 'network' | 'provider' | 'unknown';

export interface RunError {
  code: RunErrorCode;
  title: string;
  message: string;
}

/**
 * Woher die Treffer eines Laufs kommen (Wunsch des Nutzers 12.10.: verständlich machen, warum mehr Treffer als Profile
 * kommen). Zuerst die Warteliste (im letzten Lauf zurückgestellt), neu gesucht wird nur, was bis `hits` noch fehlt.
 */
export interface RunSearchPlan {
  /** Treffer, die der Lauf höchstens durchsieht: Suchtreffer pro Lauf, mindestens Profile pro Lauf. */
  hits: number;
  /** Davon aus der Warteliste übernommen. */
  backlog: number;
  /** Höchstens so viele neue Treffer sucht der Lauf (`hits` − `backlog`, nie unter 0). */
  newHits: number;
}

/** Treffer, die ein Lauf durchsieht: Suchtreffer pro Lauf, aber nie weniger als Profile pro Lauf. */
export function runSearchHits(searchHits: number, maxResults: number): number {
  return Math.min(SEARCH_HITS_MAX, Math.max(searchHits, maxResults));
}

export interface RunSnapshot {
  id: string;
  mode: LeadSearchMode;
  profile: SearchProfile;
  status: RunStatus;
  phase: RunPhase;
  leads: PipelineLead[];
  error: RunError | null;
  startedAt: number;
  finishedAt: number | null;
  handedOff: boolean;
  /** Steht nach der Suche fest. Fehlt bei älteren Backends. */
  searchPlan?: RunSearchPlan;
  /** KI-Kosten des Laufs in Euro – gesetzt, sobald der Lauf endet. Fehlt bei älteren Backends. */
  costEur?: number;
}

/** Live-Fortschritt per Server-Sent Events. */
export type RunEvent =
  | { type: 'run'; run: RunSnapshot }
  | { type: 'phase'; phase: RunPhase }
  | { type: 'leads'; leads: PipelineLead[] }
  | { type: 'end'; run: RunSnapshot };

/** Bereits bekannter Lead der Demo (für den Dubletten-Filter). */
export interface KnownLead {
  providerId: string;
  /** z. B. „Nick“ – erscheint im Grund „Bereits im Cockpit · Nick“. */
  owner: string;
}

export interface StartRunRequest {
  profile: SearchProfile;
  known: KnownLead[];
  /** Provider-IDs, an die in dieser Demo-Sitzung schon eine Anfrage ging. */
  pendingInvitations: string[];
  /** Provider-IDs, die in früheren Läufen bereits geprüft wurden. */
  checked: string[];
}

// ───────────────────────────── Übergabe ─────────────────────────────

/** Schritt 5 – Datensatz für eine Karte „Neuer Lead“ im Tagesstapel. */
export interface NewLeadCard {
  runId: string;
  mode: LeadSearchMode;
  providerId: string;
  publicIdentifier: string | null;
  profileUrl: string | null;
  firstName: string;
  lastName: string;
  headline: string;
  position: string;
  company: string;
  location: string | null;
  website: string | null;
  networkDistance: NetworkDistance;
  category: LeadCategory;
  confidence: number;
  reason: string;
  summary: string;
  metaAds: MetaAdsCheck | null;
  /** Scoring v1 (siehe `scoring.ts`) – gesetzt, sobald die KI den Lead bewertet hat. */
  score?: LeadScore | null;
}

// ───────────────────────────── Konfiguration ─────────────────────────────

/**
 * Zustand des LinkedIn-Accounts bei Unipile (nur Live-Modus).
 * ok = startklar · missing = noch keiner verbunden · connecting = wird gerade verbunden ·
 * reconnect = muss neu verbunden werden · unreachable = Unipile nicht erreichbar bzw. Key ungültig
 */
export type LinkedinAccountState = 'ok' | 'missing' | 'connecting' | 'reconnect' | 'unreachable';

export interface LinkedinAccountStatus {
  state: LinkedinAccountState;
  /** Name des Accounts laut Unipile, z. B. „Nick Muster“. */
  name: string | null;
  /** Verständlicher Hinweis für die Oberfläche (leer bei ok). */
  message: string;
}

/** Stand der hochgeladenen Outreach-Tracking-Liste (Dubletten-Abgleich). */
export interface TrackingSummary {
  count: number;
  fileName: string;
  updatedAt: number;
  bySetter: Record<string, number>;
  sheets: string[];
}

export interface LeadSearchConfig {
  mode: LeadSearchMode;
  /** false, wenn im Live-Modus Schlüssel fehlen (`problems`) oder kein LinkedIn-Account bereitsteht (`account`). */
  ready: boolean;
  problems: string[];
  defaults: SearchProfile;
  maxResultsLimit: number;
  /** So viele Suchtreffer sieht ein Lauf höchstens durch (`SEARCH_HITS_PER_RUN`). Fehlt bei älteren Backends. */
  searchHits?: number;
  /** Treffer auf der Warteliste (im letzten Lauf zurückgestellt) – der nächste Lauf arbeitet sie zuerst ab. Simulation: 0. */
  backlog?: number;
  live: { searchApi: 'classic' | 'sales_navigator'; model: string } | null;
  /** Wird die Meta-Werbebibliothek geprüft? (Simulation: immer; Live: nur mit META_ACCESS_TOKEN) */
  metaAds: boolean;
  /** Nur Live-Modus mit vollständigen Schlüsseln. */
  account: LinkedinAccountStatus | null;
  /** Hinweise, die den Start nicht verhindern (z. B. Lauf ohne KI-Bewertung). */
  warnings: string[];
  /** Hochgeladene Tracking-Liste, gegen die Dubletten geprüft werden. */
  tracking: TrackingSummary | null;
}

export interface ApiErrorBody {
  /**
   * Bei code „busy“ steht in runId der Lauf, der gerade arbeitet – die Oberfläche kann ihn übernehmen.
   * `field`: betroffenes Feld, z. B. der Schlüssel bei `invalid_setting` (`shared/settings.ts`).
   */
  error: { code: string; message: string; runId?: string; field?: string };
}
