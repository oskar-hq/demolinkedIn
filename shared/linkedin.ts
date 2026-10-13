/**
 * Vertrag für echte LinkedIn-Aktionen über Unipile (Roadmap Phase 3) – wird von Frontend (Vite) und Backend (Node)
 * importiert. Nur Typen, Konstanten und `import type` aus anderen Vertragsdateien.
 *
 * Jeder Gründer sendet über **seinen eigenen** LinkedIn-Account (bei Unipile verbunden, Zuordnung unter Einstellungen →
 * Senden über LinkedIn).
 * Gesendet wird nur für Leads, die dem angemeldeten Gründer gehören. Jede Aktion steht danach im Verlauf des Leads
 * (dieselben Ereignisse wie beim Protokollieren von Hand: invite_sent, message_sent, invite_accepted, message_received).
 *
 * Schutz (Backend erzwingt, Frontend zeigt nur an):
 *   - Tageslimits je Account: Vernetzungsanfragen (Standard 20, zusätzlich 80 in 7 Tagen) und Nachrichten (40);
 *   - nur zu Arbeitszeiten (Standard Mo–Fr 8–19 Uhr, Europe/Berlin);
 *   - 3–8 s zufällige Pause zwischen zwei Aktionen eines Accounts (Anfragen werden nacheinander abgearbeitet);
 *   - meldet LinkedIn/Unipile ein Limit oder einen Zugangsfehler, wird der Account pausiert (`pausedUntil`) und nimmt
 *     bis dahin keine Aktionen an.
 *
 * Modus: `mock` = Simulation (nichts verlässt den Server; Anfragen werden beim Abgleich teils „angenommen“, auf
 * Nachrichten kommt teils eine Antwort) · `live` = echt über Unipile · `off` = ausgeschaltet (Standard live, bis
 * LINKEDIN_ACTIONS=on gesetzt ist). Bei `off` zeigt das Frontend nur „Als erledigt markieren“ (bisheriges Protokoll).
 *
 * Routen (alle mit Sitzung):
 *   GET  /api/linkedin/status              → 200 LinkedInStatusResponse
 *   POST /api/leads/:id/linkedin/invite    LinkedInInviteRequest → 200 LeadDetailResponse (Stufe „Anfrage gesendet“)
 *   POST /api/leads/:id/linkedin/message   LinkedInMessageRequest → 200 LeadDetailResponse
 *                                          (aus „Vernetzt“ = Erstnachricht, aus „Angeschrieben“ = Follow-up)
 *     Beide mit optionaler `clientId` (wie bei `/events`): Ist eine Aktion mit dieser Kennung für den Lead schon
 *     gesendet, wird **nicht noch einmal gesendet** – Antwort 200 mit `duplicate: true` und dem aktuellen Stand.
 *     Schlug das Senden fehl, ist nichts gebucht; ein neuer Versuch mit derselben Kennung sendet dann.
 *   POST /api/linkedin/sync                → 200 LinkedInSyncResponse (angenommene Anfragen + neue Antworten holen;
 *                                          läuft live außerdem automatisch alle LINKEDIN_SYNC_MINUTES Minuten)
 *
 * Einrichten in der Oberfläche statt mit `linkedinCli` (Ziel des Nutzers 06.10.: nie auf die Shell). Nur Konten mit
 * `canEditSettings` (Admin, Gründer), sonst 403 not_allowed:
 *   GET  /api/linkedin/accounts            → 200 LinkedInAccountsResponse – bei Unipile verbundene Accounts zur Auswahl
 *                                          für UNIPILE_ACCOUNT_NICK/JOHANNES (Unipile `GET /api/v1/accounts`, nur
 *                                          LinkedIn). Braucht Unipile-Zugang, nicht `LINKEDIN_ACTIONS` · 409
 *                                          linkedin_off ohne DSN/Schlüssel · 503 linkedin_error. Simulation: zwei
 *                                          erfundene Accounts.
 *   POST /api/linkedin/test-invite         LinkedInTestInviteRequest → 200 LinkedInTestInviteResponse – genau EINE
 *                                          Vernetzungsanfrage an ein Profil (z. B. Kollege), wie `linkedinCli
 *                                          test-anfrage`. Nur live mit `LINKEDIN_ACTIONS=on`; dieselben Grenzen,
 *                                          Arbeitszeiten und Pausen; zählt zum Tageslimit. Fehler wie oben.
 *                                          Simulation: sendet nichts, `ok` mit Hinweis.
 *   GET    /api/linkedin/test-profile      → 200 LinkedInTestProfileResponse – gespeicherter Test-LinkedIn-Account (oder null).
 *   PUT    /api/linkedin/test-profile      LinkedInTestProfileRequest → 200 LinkedInTestProfileResponse – Profil über
 *                                          Unipile auflösen (`GET /api/v1/users/{kennung}`, notify=false) und als
 *                                          Test-Account speichern. Name, Überschrift und Link zeigt die Oberfläche
 *                                          zur Kontrolle („ist das wirklich das Profil?“). 400 invalid_request ·
 *                                          409 linkedin_rejected (Profil nicht gefunden) · 409 linkedin_off (kein
 *                                          Unipile-Zugang) · 409 linkedin_no_account · 503 linkedin_error.
 *   DELETE /api/linkedin/test-profile      → 200 { profile: null }
 *   POST   /api/linkedin/test-message      LinkedInTestMessageRequest → 200 LinkedInTestMessageResponse – genau EINE
 *                                          Nachricht an den gespeicherten Test-Account (nie an einen Lead), über den
 *                                          Account des Gründers. Braucht nur den Unipile-Zugang, nicht
 *                                          `LINKEDIN_ACTIONS` (Wunsch des Nutzers 07.10.: nach Updates prüfen, ob
 *                                          Nachrichten ankommen). Pausen und Tageslimit gelten, zählt zum Limit.
 *                                          Nur an Kontakte 1. Grades (LinkedIn) → sonst 409 linkedin_rejected.
 *                                          Simulation: sendet nichts, `ok` mit Hinweis.
 *   POST   /api/linkedin/test-connect      LinkedInTestConnectRequest → 200 LinkedInTestConnectResponse – genau EINE
 *                                          Vernetzungsanfrage an den gespeicherten Test-Account (nie an einen Lead),
 *                                          sonst wie test-message (nur Unipile-Zugang, Pause, Tageslimit für Anfragen,
 *                                          eine pro Minute). Schon Kontakt 1. Grades → 409 linkedin_rejected.
 *   POST /api/linkedin/resume              LinkedInResumeRequest → 200 LinkedInStatusResponse – Pause eines Accounts
 *                                          aufheben (wie `linkedinCli fortsetzen`). Darf auch der Gründer selbst bzw.
 *                                          sein Mitarbeiter für diesen Gründer. Keine Pause → 200 unverändert.
 * Fehler (`ApiErrorBody.error.code`): siehe `LinkedInErrorCode`. Die Meldung ist immer ein fertiger deutscher Satz.
 */
import type { AuthFounderId } from './auth.js';

export type LinkedInActionsMode = 'mock' | 'live' | 'off';

/** Höchstlänge der Notiz zur Vernetzungsanfrage (LinkedIn: 300 Zeichen, ohne Premium teils nur 200). */
export const INVITE_NOTE_MAX_LENGTH = 300;
/** Höchstlänge einer Nachricht. */
export const MESSAGE_MAX_LENGTH = 8000;

export interface LinkedInLimit {
  used: number;
  limit: number;
}

export interface LinkedInAccountStatus {
  founder: AuthFounderId;
  /** false: für diesen Gründer ist kein Unipile-Account eingetragen → Aktionen nicht möglich. */
  connected: boolean;
  invitesToday: LinkedInLimit;
  invitesWeek: LinkedInLimit;
  messagesToday: LinkedInLimit;
  /** Gesetzt, wenn der Account nach einem Limit- oder Zugangsfehler pausiert ist (ms). */
  pausedUntil: number | null;
  /** Ein Satz, warum pausiert. */
  pauseReason: string | null;
}

export interface LinkedInStatusResponse {
  mode: LinkedInActionsMode;
  accounts: LinkedInAccountStatus[];
  workHours: { fromHour: number; toHour: number; days: number[]; timeZone: string };
  /** Gerade innerhalb der Arbeitszeit? (Simulation: immer true) */
  withinWorkHours: boolean;
  /** Letzter Abgleich (ms) oder null. */
  lastSyncAt: number | null;
  /**
   * true = der Abgleich prüft automatisch, ob Anfragen angenommen wurden – auch bei `mode: 'off'` (von Hand senden),
   * sobald Unipile eingerichtet ist (nur lesend, Wunsch des Nutzers 11.10.). Fehlt bei älteren Backends.
   */
  watching?: boolean;
}

export interface LinkedInInviteRequest {
  /** Optionale Notiz (max. INVITE_NOTE_MAX_LENGTH Zeichen). */
  message?: string;
  /** Kennung gegen doppeltes Senden (1–64 Zeichen), siehe Dateikopf. */
  clientId?: string;
}

export interface LinkedInMessageRequest {
  text: string;
  /** Wie bei LeadActionRequest: Vorlage „A“/„B“/„C“ bzw. Variante. */
  label?: string;
  /** Kennung gegen doppeltes Senden (1–64 Zeichen), siehe Dateikopf. */
  clientId?: string;
}

export interface LinkedInSyncResponse {
  /** Leads, deren Anfrage seit dem letzten Abgleich angenommen wurde. */
  accepted: string[];
  /** Leads mit neuer Antwort. */
  replied: string[];
  /** Je Gründer ein Satz, falls der Abgleich für ihn nicht ging (z. B. kein Account). */
  problems: string[];
  syncedAt: number;
}

/** LinkedIn-Daten am Lead (`CockpitLead.linkedin`). */
export interface LeadLinkedInState {
  /** Gesendet über diesen Gründer/Account. */
  sentBy: AuthFounderId;
  invitationId: string | null;
  invitedAt: number | null;
  /** Unterhaltung, die das Cockpit begonnen hat – darüber laufen Follow-ups und kommen Antworten. */
  chatId: string | null;
  chatStartedAt: number | null;
}

/**
 * Fehlercodes:
 * - `linkedin_off` (409) – Aktionen ausgeschaltet;
 * - `linkedin_no_account` (409) – für den angemeldeten Gründer ist kein LinkedIn-Account eingetragen;
 * - `linkedin_not_owner` (409) – der Lead gehört dem anderen Gründer (der muss selbst senden);
 * - `invalid_transition` (409) – Aktion passt nicht zur Stufe (wie bei `/events`);
 * - `linkedin_outside_hours` (409) – außerhalb der Arbeitszeit;
 * - `linkedin_limit` (429) – Tages-/Wochenlimit erreicht, Header `Retry-After` in Sekunden;
 * - `linkedin_paused` (503) – Account pausiert nach Limit-/Zugangsfehler, Header `Retry-After`;
 * - `linkedin_rejected` (409) – LinkedIn lehnt genau diese Aktion ab (z. B. schon eingeladen), Account bleibt aktiv;
 * - `linkedin_error` (502) – Unipile nicht erreichbar oder unerwarteter Fehler; nichts gesendet.
 */
export type LinkedInErrorCode =
  | 'linkedin_off'
  | 'linkedin_no_account'
  | 'linkedin_not_owner'
  | 'linkedin_outside_hours'
  | 'linkedin_limit'
  | 'linkedin_paused'
  | 'linkedin_rejected'
  | 'linkedin_error';

export interface LinkedInUnipileAccount {
  /** Account-ID bei Unipile – Wert für UNIPILE_ACCOUNT_NICK/JOHANNES. */
  id: string;
  /** Name, wie Unipile ihn liefert (z. B. Name des LinkedIn-Profils). */
  name: string;
  /** Welchem Gründer er gerade zugeordnet ist (aus den Einstellungen), sonst null. */
  assignedTo: AuthFounderId | null;
  /**
   * true = über diesen Account sucht die Lead-Suche gerade (UNIPILE_ACCOUNT_ID bzw. die automatische Wahl, wenn leer).
   * Fehlt bei älteren Backends.
   */
  searching?: boolean;
}

export interface LinkedInAccountsResponse {
  accounts: LinkedInUnipileAccount[];
}

export interface LinkedInTestInviteRequest {
  /** Über wessen Account. */
  founder: AuthFounderId;
  /** LinkedIn-Profil-Link (https://www.linkedin.com/in/…) oder öffentliche Kennung. */
  profile: string;
  /** Optionale Notiz (max. INVITE_NOTE_MAX_LENGTH Zeichen). */
  message?: string;
}

export interface LinkedInTestInviteResponse {
  ok: true;
  /** Fertiger Satz, z. B. „Anfrage an Max Muster gesendet.“ bzw. in der Simulation „Simulation – nichts gesendet.“ */
  message: string;
}

/** Test-LinkedIn-Account (Einstellungen → Senden über LinkedIn → Test). */
export interface LinkedInTestProfile {
  name: string;
  headline: string | null;
  publicIdentifier: string | null;
  profileUrl: string | null;
  providerId: string;
  /** Kontakt 1. Grades des prüfenden Gründers – nur dann kann LinkedIn eine Nachricht zustellen. */
  connected: boolean;
  /** Wann geprüft und gespeichert (ms). */
  checkedAt: number;
}

export interface LinkedInTestProfileRequest {
  /** Über wessen Account geprüft wird. */
  founder: AuthFounderId;
  /** LinkedIn-Profil-Link (https://www.linkedin.com/in/…) oder öffentliche Kennung. */
  profile: string;
}

export interface LinkedInTestProfileResponse {
  profile: LinkedInTestProfile | null;
}

export interface LinkedInTestMessageRequest {
  founder: AuthFounderId;
  /** Text der Test-Nachricht (höchstens MESSAGE_MAX_LENGTH Zeichen). */
  text: string;
}

export interface LinkedInTestMessageResponse {
  ok: true;
  /** Fertiger Satz, z. B. „Test-Nachricht an Max Muster gesendet.“ */
  message: string;
}

export interface LinkedInTestConnectRequest {
  founder: AuthFounderId;
  /** Optionale Notiz (max. INVITE_NOTE_MAX_LENGTH Zeichen). */
  message?: string;
}

export interface LinkedInTestConnectResponse {
  ok: true;
  /** Fertiger Satz, z. B. „Test-Vernetzungsanfrage an Max Muster gesendet.“ */
  message: string;
}

export interface LinkedInResumeRequest {
  founder: AuthFounderId;
}
