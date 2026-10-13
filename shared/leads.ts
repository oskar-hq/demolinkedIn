/**
 * Vertrag für Leads im Cockpit (Roadmap Phase 2) – wird von Frontend (Vite) und Backend (Node) importiert.
 * Wie `leadSearch.ts` ohne Laufzeit-Abhängigkeiten; nur Typ-Importe aus den anderen Vertragsdateien (mit `.js`, wie im Backend).
 *
 * Die Datenbank ersetzt die Outreach-Tracking-Excel: Jeder Lead hat genau einen zuständigen Gründer, eine Stufe
 * und einen Verlauf (Ereignisse). Aktionen werden als Ereignis gemeldet – das Backend leitet daraus die Stufe ab.
 * In Phase 2 sind Aktionen Protokoll („habe ich auf LinkedIn gemacht“); echte LinkedIn-Aktionen kommen mit Phase 3.
 *
 * Routen (alle mit Sitzung, sobald die Pflicht-Sitzung an ist; Fehler im Format `ApiErrorBody`):
 *   GET   /api/leads                      ?owner=nick&stage=new,connected&q=Text&limit=500&offset=0&sort=activity
 *                                         → 200 LeadListResponse. sort=activity (Standard): am längsten ohne
 *                                         Aktivität zuerst · sort=score: höchster Score zuerst (ohne Score zuletzt) ·
 *                                         sort=recent: zuletzt bearbeitet zuerst (bei vielen Leads fehlen mit `limit`
 *                                         dann die ältesten statt der neuesten) · columns=1 (mit stage): zusätzlich
 *                                         alle Leads in einer eigenen Board-Spalte, egal in welcher Stufe
 *   GET   /api/leads/:id                  → 200 LeadDetailResponse · 404 not_found
 *   POST  /api/leads                      CreateLeadsRequest → 200 CreateLeadsResponse
 *                                         (Übergabe aus der Lead-Suche; Dubletten je providerId werden übersprungen)
 *   POST  /api/leads/:id/events           LeadActionRequest → 200 LeadDetailResponse · 400 invalid_request ·
 *                                         404 not_found · 409 invalid_transition (Aktion passt nicht zur Stufe)
 *                                         Mit `clientId`: dieselbe Meldung zweimal (z. B. nach Netzfehler wiederholt)
 *                                         wird nur einmal gebucht – die Wiederholung antwortet 200 mit
 *                                         `duplicate: true` und dem aktuellen Stand, ohne die Stufe erneut zu prüfen.
 *   PATCH /api/leads/:id                  UpdateLeadRequest → 200 LeadDetailResponse
 *   POST  /api/leads/:id/snooze           SnoozeRequest → 200 LeadDetailResponse – „für heute überspringen“: Der Lead
 *                                         fehlt bis `snoozedUntil` im Tagesstapel (Standard: Beginn des nächsten Tages,
 *                                         Ortszeit `LINKEDIN_TIMEZONE`, Standard Europe/Berlin). Eine neue Antwort des
 *                                         Leads (`message_received`) hebt das Überspringen auf. DELETE …/snooze ebenso.
 *   POST  /api/leads/:id/enrich           Anreicherung mit Clay anstoßen – siehe `enrichment.ts`
 *   POST  /api/leads/:id/linkedin/invite|message  echte LinkedIn-Aktion – siehe `linkedin.ts`
 *
 * Nur eingetragene Anfragen nachsenden (Wunsch des Nutzers 11.10.): Wurde mit „von Hand“ (LINKEDIN_ACTIONS aus)
 * „Anfrage eintragen“ geklickt, ohne die Anfrage auf LinkedIn zu senden, steht der Lead in „Anfrage gesendet“, obwohl
 * nichts rausging. Solche Leads (Stufe `invited`, ohne `linkedin.invitationId`) lassen sich zurück auf „Neu“ setzen –
 * dann kommen sie wieder als Karte „Neuer Lead“ in den Tagesstapel (mit Tageslimit) und gehen echt raus.
 *   GET   /api/leads/unsent-invites?owner=nick → 200 UnsentInvitesResponse (owner fehlt = alle, die das Konto sehen darf)
 *   POST  /api/leads/unsent-invites/requeue    RequeueInvitesRequest → 200 RequeueInvitesResponse – setzt nur Leads
 *         zurück, die (noch) passen; die alten Ereignisse „Anfrage gesendet“ werden zu Notizen („nur eingetragen“), damit
 *         sie nicht mehr gegen Tageslimit und Dashboard zählen.
 *
 * Eigene Spalten im Board (Wunsch des Nutzers 07.10., z. B. „Meeting Close“): zusätzlich zu den Stufen. Ein Lead liegt
 * in einer eigenen Spalte, wenn `boardColumn` gesetzt ist – seine Stufe bleibt, wie sie ist (Aufgaben, Regeln).
 *   GET    /api/board/columns            → 200 BoardColumnsResponse (nach `position`)
 *   POST   /api/board/columns            { name } → 201 BoardColumn · 400 invalid_request (leer, > 40 Zeichen, doppelt)
 *   PATCH  /api/board/columns/:id        { name } → 200 BoardColumn · 404
 *   DELETE /api/board/columns/:id        → 200 BoardColumnsResponse – Leads darin kehren in ihre Stufen-Spalte zurück
 *   PATCH  /api/leads/:id { boardColumn } verschiebt in eine eigene Spalte (null = zurück in die Stufe) · 400 unbekannt
 *
 * Chats (Wunsch des Nutzers 07.10.: Übersicht wie in einem Messenger):
 *   GET    /api/conversations?owner=nick → 200 ConversationListResponse – alle Leads mit mindestens einer Nachricht
 *                                          (gesendet oder erhalten), neueste Nachricht zuerst. owner fehlt = alle.
 *                                          Über wessen LinkedIn-Account ein Chat läuft, steht in `lead.owner`
 *                                          (auch Mitarbeiter dürfen alle lesen).
 *                                          Den Verlauf liefert `GET /api/leads/:id`, Schreiben wie in den Karten
 *                                          (`POST /api/leads/:id/linkedin/message` bzw. `…/events` message_sent/received).
 *   POST  /api/leads/demo/reset           nur Simulation: Demo-Leads neu anlegen → 200 { count } · sonst 404
 *
 * Löschen (Datenschutz): Leads in der Stufe `lost` werden `LOST_DELETE_DAYS` Tage (Standard 30) nach der letzten
 * Aktivität (also frühestens so lange nach dem letzten „Verloren“) endgültig gelöscht – mit Verlauf. Damit niemand erneut angeschrieben wird, bleibt nur ein Fingerabdruck
 * (SHA-256 der LinkedIn-ID bzw. des Profil-Namens) ohne Namen oder Firma; die Lead-Suche meldet solche Treffer als
 * Dublette „Früher kein Interesse“.
 *
 * Betroffenenrechte (DSGVO, Wunsch 08.10.) – nur Gründer und Admins, Mitarbeiter → 403 not_allowed:
 *   GET    /api/leads/:id/export         → 200 LeadDataExport als JSON-Datei (Content-Disposition attachment):
 *                                         alles, was zum Lead gespeichert ist (Auskunft, Art. 15) · 404 not_found
 *   DELETE /api/leads/:id                → 200 DeleteLeadResponse · 404 not_found. Löscht sofort und endgültig über
 *                                         denselben Weg wie das Löschen nach `LOST_DELETE_DAYS` (Art. 17): Lead und
 *                                         Verlauf weg, nur der Fingerabdruck bleibt (nie wieder vorschlagen).
 *   Fürs Dashboard bleiben beim Löschen (sofort und nach Frist) anonyme Zahlen: Art und Zeitpunkt der Ereignisse,
 *   Gründer und Vorlage – ohne Text, Namen oder Bezug zum Lead.
 *
 * Neue Antworten (`message_received`) schickt das Backend live an Slack, wenn `SLACK_WEBHOOK_URL` gesetzt ist.
 *
 * Simulation (`LEAD_SEARCH_MODE=mock`): Ist die Datenbank leer, legt das Backend beim Start die Demo-Leads an
 * (dieselben 30 Leads wie bisher in `src/data/`, Zeitstempel relativ zum Anlegen). Live: keine Demo-Leads.
 */
import type { AuthFounderId } from './auth.js';
import type { LeadCategory, LeadSearchMode, MetaAdsCheck, NetworkDistance, NewLeadCard } from './leadSearch.js';
import type { LeadLinkedInState } from './linkedin.js';
import type { CompanyEnrichment } from './enrichment.js';
import type { LeadScore } from './scoring.js';
import type { LeadConversation } from './messages.js';
import type { LeadCrmState } from './crm.js';
import type { LeadFeedback, LeadFeedbackInput } from './learning.js';

/**
 * Stufen der Pipeline (Board-Spalten von links nach rechts):
 * new = qualifiziert, noch nicht kontaktiert · invited = Vernetzungsanfrage gesendet · connected = vernetzt,
 * Erstnachricht fällig · contacted = angeschrieben, wartet auf Antwort (Follow-ups) · replied = hat geantwortet ·
 * meeting = Termin vereinbart (= Erfolg) · handed_over = an das CRM übergeben · lost = kein Interesse / verworfen.
 */
export const LEAD_STAGES = ['new', 'invited', 'connected', 'contacted', 'replied', 'meeting', 'handed_over', 'lost'] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: 'Neu',
  invited: 'Anfrage gesendet',
  connected: 'Vernetzt',
  contacted: 'Angeschrieben',
  replied: 'Antwort',
  meeting: 'Termin',
  handed_over: 'Übergeben',
  lost: 'Verloren',
};

/** Endstufen – keine weiteren Aufgaben. */
export const CLOSED_LEAD_STAGES: readonly LeadStage[] = ['handed_over', 'lost'];

/** Woher ein Lead stammt. */
export type LeadOrigin =
  /** `auto`: von der automatischen Suche angelegt (zählt gegen das Tageslimit neuer Leads); fehlt bei älteren Leads. */
  /**
   * `searchedBy`: Gründer, dessen Suche (von Hand oder automatisch) den Lead gefunden hat – nur gesetzt, wenn der Lead
   * durch `LEAD_DISTRIBUTION=balanced` einem anderen Gründer zugeteilt wurde (sonst ist es `owner`).
   */
  | { kind: 'search'; runId: string; mode: LeadSearchMode; auto?: boolean; searchedBy?: AuthFounderId }
  | { kind: 'tracking'; sheet: string | null; setter: string | null }
  | { kind: 'demo' };

export interface LeadPerson {
  firstName: string;
  lastName: string;
  headline: string;
  position: string;
  location: string | null;
  /** LinkedIn-/Provider-ID – Schlüssel für Dubletten (eindeutig je Lead). */
  providerId: string;
  publicIdentifier: string | null;
  profileUrl: string | null;
  networkDistance: NetworkDistance;
}

export interface LeadCompany {
  name: string;
  website: string | null;
  /** Branche laut LinkedIn bzw. Beschreibung, z. B. „Kapitalanlage-Vertrieb“. */
  industry: string | null;
  region: string | null;
}

/** KI-Einstufung aus der Lead-Suche. */
export interface LeadAssessment {
  category: LeadCategory;
  confidence: number;
  reason: string;
  summary: string;
}

export interface CockpitLead {
  id: string;
  owner: AuthFounderId;
  stage: LeadStage;
  person: LeadPerson;
  company: LeadCompany;
  assessment: LeadAssessment | null;
  metaAds: MetaAdsCheck | null;
  /** Scoring v1 (siehe `scoring.ts`); fehlt bei Leads ohne Bewertung. */
  score?: LeadScore | null;
  /** Firmendaten aus Clay (siehe `enrichment.ts`); fehlt, solange nie angereichert. */
  enrichment?: CompanyEnrichment | null;
  /** Echte LinkedIn-Aktionen über das Cockpit (siehe `linkedin.ts`); fehlt, solange nichts darüber gesendet wurde. */
  linkedin?: LeadLinkedInState | null;
  origin: LeadOrigin;
  /** Vorlage der Erstnachricht (A/B/C), sobald gesendet. */
  template: string | null;
  /** Anzahl gesendeter Follow-ups. */
  followUpsSent: number;
  /** Nächster Schritt in einem Satz (frei, z. B. „Termin Do. 10 Uhr bestätigen“). */
  nextStep: string | null;
  createdAt: number;
  updatedAt: number;
  /** Letzte eigene Aktion (Anfrage oder Nachricht) – für „X Tage seit letztem Kontakt“. */
  lastContactAt: number | null;
  /** Letzte Antwort des Leads. */
  lastReplyAt: number | null;
  /** Letztes Ereignis überhaupt – Sortierung „am längsten nicht bearbeitet“. */
  lastActivityAt: number;
  /** Übersprungen bis (ms) – bis dahin nicht im Tagesstapel. Fehlt/null = nicht übersprungen. */
  snoozedUntil?: number | null;
  /** Einschätzung der letzten Antwort und Zusammenfassung des Verlaufs (siehe `messages.ts`); fehlt ohne Antwort. */
  conversation?: LeadConversation | null;
  /** Übergabe an das CRM (Close, siehe `crm.ts`); fehlt, solange nicht übergeben. */
  crm?: LeadCrmState | null;
  /** Eigene Board-Spalte (`BoardColumn.id`); fehlt = Spalte der Stufe. */
  boardColumn?: string | null;
  /**
   * Deal Value in ganzen Euro, von Hand im Lead-Panel eingetragen (Wunsch des Nutzers 11.10.). Fehlt/null = noch keiner.
   * Das Dashboard summiert ihn je Stufe (`DashboardResponse.dealValue`).
   */
  dealValue?: number | null;
  /**
   * Rückmeldung zur Lead-Qualität (`learning.ts`): 👍/👎 von Hand oder automatisch aus dem Ergebnis (Antwort, Termin,
   * Übergabe). Fehlt/null = noch keine. Fließt als Beispiel in die KI-Bewertung und in die Gewichtung der Suche.
   */
  feedback?: LeadFeedback | null;
}

/** Höchster Deal Value je Lead (ganze Euro). */
export const DEAL_VALUE_MAX = 100_000_000;

/**
 * Meta-Ads-Stand von Hand (Wunsch des Nutzers 11.10.): Ohne Meta-Token prüft die Lead-Suche nichts – im Lead-Panel
 * lässt sich eintragen, ob die Firma Anzeigen schaltet, nie geschaltet hat oder seit `lastStop` (JJJJ-MM-TT) nicht mehr.
 * Danach richtet sich die Erstnachricht (Greenfield/Reactivation, Platzhalter {{metapause}} in `messages.ts`).
 */
export interface ManualMetaAds {
  state: 'none' | 'stopped' | 'active';
  /** Nur bei `stopped`: seit wann aus (JJJJ-MM-TT); null = unbekannt. */
  lastStop?: string | null;
}

/**
 * Ereignisse im Verlauf. Aktionen (`LEAD_ACTIONS`) meldet das Frontend, die übrigen schreibt das Backend selbst.
 * created = angelegt · assessed = KI-Einschätzung · stage_changed / owner_changed = von Hand geändert ·
 * enriched = Firmendaten aus Clay ergänzt (Titel z. B. „Firmendaten ergänzt: 25 Mitarbeiter · Meta-Pixel“) ·
 * reopened = verlorenen bzw. übergebenen Lead wieder geöffnet.
 */
export type LeadEventKind =
  | 'created'
  | 'assessed'
  | 'invite_sent'
  | 'invite_accepted'
  | 'message_sent'
  | 'message_received'
  | 'meeting_booked'
  | 'handed_over'
  | 'lost'
  | 'note'
  | 'stage_changed'
  | 'owner_changed'
  | 'enriched'
  | 'reopened';

export interface LeadEvent {
  id: string;
  leadId: string;
  kind: LeadEventKind;
  at: number;
  /** Für welchen Gründer die Aktion zählt (null = System oder der Lead selbst). */
  by: AuthFounderId | null;
  /**
   * Anzeigename des Kontos, das die Aktion gebucht hat, wenn es nicht der Gründer selbst war (z. B. „Anna“, wenn ein
   * Mitarbeiter für Nick sendet). Fehlt bei Buchungen des Gründers, älteren und automatischen Ereignissen.
   */
  actor?: string | null;
  /** Kurzer Titel für die Timeline, vom Backend gesetzt (z. B. „Follow-up 1 · Variante A gesendet“). */
  title: string;
  /** Nachrichtentext, Notiz oder Begründung. */
  text: string | null;
  /** Kennzeichen, z. B. Vorlage „A“ bei Erstnachricht oder „Variante B“ bei Follow-ups. */
  label: string | null;
}

/** Aktionen, die das Frontend melden darf, und die Stufe, die daraus folgt. */
export const LEAD_ACTIONS = [
  'invite_sent',
  'invite_accepted',
  'message_sent',
  'message_received',
  'meeting_booked',
  'handed_over',
  'lost',
  'note',
  'reopened',
] as const;

export type LeadAction = (typeof LEAD_ACTIONS)[number];

/**
 * Aus welchen Stufen eine Aktion erlaubt ist und wohin sie führt (`null` = Stufe bleibt).
 * message_sent aus `connected` ist die Erstnachricht, aus `contacted` ein Follow-up (zählt `followUpsSent` hoch),
 * aus `replied`/`meeting` eine normale Antwort im Gespräch.
 * message_received führt nach `replied` – Ausnahme: aus `meeting` bleibt der Lead in `meeting` (der Termin steht ja
 * noch). Aus `lost`/`handed_over` lässt sich so eine späte Antwort eintragen; der Lead ist dann wieder offen.
 * reopened („Wieder öffnen“) holt einen Lead aus `lost`/`handed_over` zurück. Die Stufe leitet das Backend aus dem
 * Verlauf ab: `meeting`, wenn je ein Termin vereinbart wurde · sonst `replied`, wenn der Lead je geantwortet hat · sonst `contacted`, wenn eine Nachricht gesendet ist ·
 * sonst `connected`, wenn die Anfrage angenommen ist · sonst `invited`, wenn eine Vernetzungsanfrage gesendet ist ·
 * sonst `new`.
 */
export const LEAD_ACTION_RULES: Record<LeadAction, { from: readonly LeadStage[] | 'any'; to: LeadStage | null }> = {
  invite_sent: { from: ['new'], to: 'invited' },
  invite_accepted: { from: ['new', 'invited'], to: 'connected' },
  message_sent: { from: ['connected', 'contacted', 'replied', 'meeting'], to: null },
  message_received: { from: ['invited', 'connected', 'contacted', 'replied', 'meeting', 'handed_over', 'lost'], to: 'replied' },
  meeting_booked: { from: ['connected', 'contacted', 'replied'], to: 'meeting' },
  handed_over: { from: ['replied', 'meeting'], to: 'handed_over' },
  lost: { from: 'any', to: 'lost' },
  note: { from: 'any', to: null },
  reopened: { from: ['lost', 'handed_over'], to: null },
};

export interface LeadListResponse {
  leads: CockpitLead[];
  /** Anzahl aller Treffer (vor limit/offset). */
  total: number;
}

export interface LeadDetailResponse {
  lead: CockpitLead;
  /** Verlauf, älteste zuerst. */
  events: LeadEvent[];
  /** Nur bei `POST …/events` mit bekannter `clientId`: Meldung war schon gebucht, nichts geändert. */
  duplicate?: boolean;
}

/**
 * Wem neue Leads aus der Lead-Suche gehören (Einstellung `LEAD_DISTRIBUTION`, Standard `owner`):
 *   - `owner`    – dem Gründer, der gesucht hat (bzw. `CreateLeadsRequest.owner`).
 *   - `balanced` – gleichmäßig auf die Gründer mit eingetragenem LinkedIn-Account (`UNIPILE_ACCOUNT_NICK`/`_JOHANNES`,
 *                  verschiedene Accounts) verteilt, damit Anfragen und Nachrichten über beide Accounts gehen. Jeder
 *                  neue Lead geht an den Gründer mit den wenigsten Leads in der Stufe `new`; bei Gleichstand zuerst
 *                  an den, der gesucht hat. Dubletten (`skipped`) behalten ihren Besitzer. Ist nur ein Account
 *                  eingetragen, gilt `owner`. Zugeteilte Leads tragen `origin.searchedBy`.
 * Die Suche selbst läuft in beiden Fällen über den Such-Account (`UNIPILE_ACCOUNT_ID`).
 */
export const LEAD_DISTRIBUTIONS = ['owner', 'balanced'] as const;
export type LeadDistribution = (typeof LEAD_DISTRIBUTIONS)[number];

export interface CreateLeadsRequest {
  /** Datensätze aus `POST /api/lead-search/runs/:id/handoff`. */
  cards: NewLeadCard[];
  /** Zuständiger Gründer; ohne Angabe der angemeldete Nutzer. Mit `LEAD_DISTRIBUTION=balanced` der Suchende – die
   *  Leads in `created` können dann auch dem anderen Gründer gehören (siehe `LeadDistribution`). */
  owner?: AuthFounderId;
}

export interface CreateLeadsResponse {
  created: CockpitLead[];
  /** Übersprungen, weil die providerId schon als Lead existiert. */
  skipped: { providerId: string; leadId: string; owner: AuthFounderId }[];
}

export interface LeadActionRequest {
  action: LeadAction;
  /** Nachrichtentext (message_sent/received) oder Notiz. */
  text?: string;
  /** Erstnachricht: Vorlage „A“/„B“/„C“; Follow-up: Variante. */
  label?: string;
  /** Zeitpunkt, falls nachgetragen (ms seit 1970); ohne Angabe jetzt. Nicht in der Zukunft. */
  at?: number;
  /**
   * Eindeutige Kennung der Meldung vom Browser (z. B. `crypto.randomUUID()`), 1–64 Zeichen. Wiederholt der Browser
   * die Meldung, wird sie nicht doppelt gebucht (siehe Dateikopf). Gilt je Lead.
   */
  clientId?: string;
}

export interface SnoozeRequest {
  /** Bis wann (ms); ohne Angabe Mitternacht Ortszeit (Europe/Berlin). Höchstens 30 Tage in der Zukunft. */
  until?: number;
}

export interface UnsentInvitesResponse {
  /** Stufe `invited`, Anfrage nicht über das Cockpit gesendet (kein `linkedin.invitationId`), älteste zuerst. */
  leads: CockpitLead[];
}

export interface RequeueInvitesRequest {
  ids: string[];
}

export interface RequeueInvitesResponse {
  /** Zurück auf „Neu“ gesetzt. */
  requeued: string[];
  /** Übersprungen (gibt es nicht, passt nicht mehr, fremder Gründer) – mit kurzem Grund. */
  skipped: { id: string; reason: string }[];
}

export interface UpdateLeadRequest {
  owner?: AuthFounderId;
  nextStep?: string | null;
  /** Ganze Euro 0–`DEAL_VALUE_MAX`; null löscht ihn. */
  dealValue?: number | null;
  /** Meta-Ads-Stand von Hand; ersetzt `metaAds` (Hinweis „Von Hand eingetragen“) und aktualisiert den Score. */
  metaAds?: ManualMetaAds;
  /** Eigene Board-Spalte; null = zurück in die Spalte der Stufe. */
  boardColumn?: string | null;
  /** 👍/👎 zur Lead-Qualität (`learning.ts`); null nimmt die eigene Rückmeldung zurück. */
  feedback?: LeadFeedbackInput | null;
}

/** Eigene Spalte im Leads-Board (z. B. „Meeting Close“). */
export interface BoardColumn {
  id: string;
  name: string;
  position: number;
}

export interface BoardColumnsResponse {
  columns: BoardColumn[];
}

export const BOARD_COLUMN_NAME_MAX = 40;

export interface ConversationSummary {
  lead: CockpitLead;
  lastMessage: { text: string; from: 'founder' | 'lead'; at: number };
  messageCount: number;
  /** Letzte Nachricht kam vom Lead – eine Antwort steht aus. */
  awaitingReply: boolean;
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
}

/** Antwort auf `DELETE /api/leads/:id`. */
export interface DeleteLeadResponse {
  deleted: true;
  /** Fertiger Satz für die Oberfläche. */
  message: string;
}

/**
 * Auskunft über einen Lead (`GET /api/leads/:id/export`). Zeilen der Neben-Tabellen so, wie sie gespeichert sind
 * (Spaltennamen der Datenbank); neue Felder kommen dazu, ohne dass sich etwas ändert.
 */
export interface LeadDataExport {
  /** Zeitpunkt der Auskunft (ISO 8601). */
  exportedAt: string;
  /** Kurzer Satz, was die Datei enthält. */
  note: string;
  lead: CockpitLead;
  /** Verlauf inklusive aller Nachrichten (gesendet und erhalten), älteste zuerst. */
  events: LeadEvent[];
  /** Weitere gespeicherte Daten zum Lead (LinkedIn-Aktionen, Anfragen an Firmendaten, Tracking-Liste …). */
  related: Record<string, Record<string, unknown>[]>;
}

/** Fehlercodes der Lead-Routen (`ApiErrorBody.error.code`). */
/** `invite_limit` (429): Tageslimit für Vernetzungsanfragen erreicht (`LINKEDIN_INVITES_PER_DAY`), auch von Hand. */
export type LeadErrorCode = 'not_found' | 'invalid_request' | 'invalid_transition' | 'invite_limit';
