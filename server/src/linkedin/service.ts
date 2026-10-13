import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { AUTH_FOUNDER_IDS, defaultFounderName, type AuthFounderId } from '../../../shared/auth.js';
import type { CockpitLead, LeadAction } from '../../../shared/leads.js';
import type {
  LeadLinkedInState,
  LinkedInActionsMode,
  LinkedInErrorCode,
  LinkedInStatusResponse,
  LinkedInSyncResponse,
  LinkedInTestProfile,
  LinkedInUnipileAccount,
} from '../../../shared/linkedin.js';
import { UNIPILE_SESSION_DOWN_TEXT, UnipileClient, UnipileHttpError, UnipileNetworkError, isUnipileSessionDown, type UnipileAccount } from '../adapters/live/unipileClient.js';
import { pickLinkedinAccount } from '../adapters/live/liveAdapter.js';
import { SHARED_ACCOUNT_MESSAGE, sharedLinkedInAccount, type Config } from '../config.js';
import type { Database } from '../db/database.js';
import { DuplicateEventError, InvalidTransitionError, LeadNotFoundError, assertTransition, type LeadStore } from '../leads/leadStore.js';
import { randomBetween, sleep } from '../lib/sleep.js';
import { LinkedInGuard, stableNumber, withinWorkHours, type ActionKind } from './guard.js';
import { otherFounder } from './inviteAccount.js';

/**
 * Echte LinkedIn-Aktionen über Unipile (Roadmap Phase 3, Vertrag `shared/linkedin.ts`).
 *
 * Reihenfolge der Prüfungen vor jedem Senden: eingeschaltet → Lead da → Lead gehört dem Gründer → Account eingetragen →
 * Stufe passt → nicht pausiert → Arbeitszeit → Limit. Dann je Gründer nacheinander (Warteschlange) mit 3–8 s Pause,
 * Stufe und Limit noch einmal prüfen, senden, protokollieren, Verlauf schreiben. Erst nach erfolgreichem Senden ändert
 * sich die Stufe; schlägt das Senden fehl, bleibt der Lead unverändert.
 *
 * Simulation: nichts verlässt den Server; Limits gelten trotzdem, Arbeitszeit und Pausen nicht.
 */

export class LinkedInError extends Error {
  constructor(
    readonly code: LinkedInErrorCode | 'invalid_transition',
    readonly status: number,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'LinkedInError';
  }
}

const HOUR_MS = 60 * 60 * 1000;
/** Pausen nach Fehlern: Limit → einen Tag, Zugang → 6 h, Serverfehler (kann ein verstecktes Limit sein) → 1 h. */
const PAUSE_LIMIT_MS = 24 * HOUR_MS;
const PAUSE_AUTH_MS = 6 * HOUR_MS;
const PAUSE_SERVER_MS = HOUR_MS;
/** Simulation: nach so vielen Sekunden (· MOCK_SPEED) wird eine Anfrage angenommen bzw. kommt eine Antwort. */
const MOCK_ACCEPT_S = 30;
const MOCK_REPLY_S = 60;
const MOCK_REPLY = 'Danke für die Nachricht – klingt spannend. Wann passt dir ein kurzer Call?';
const CHAT_STAGES = ['connected', 'contacted', 'replied', 'meeting'] as const;

export function linkedInMode(config: Config): LinkedInActionsMode {
  if (config.mode === 'mock') return 'mock';
  return config.linkedin.enabled && config.unipile.dsn && config.unipile.apiKey ? 'live' : 'off';
}

export interface LinkedInDeps {
  config: Config;
  db: Database;
  leads: LeadStore;
  log: FastifyBaseLogger;
  /** Name eines Gründers in Meldungen (aus seinem Konto), ohne Angabe „Nick“/„Johannes“. */
  founderName?: (id: AuthFounderId) => string;
  /** Account wurde pausiert bzw. Pause aufgehoben – für Neuigkeiten (`shared/notifications.ts`). */
  onPause?: (founder: AuthFounderId, until: number, reason: string) => void;
  onResume?: (founder: AuthFounderId) => void;
  fetch?: typeof fetch;
  random?: () => number;
  /**
   * Untergrenze der Pause zwischen zwei Aktionen live (ms). Standard 3000 – Schutzgrenze aus CLAUDE.md, gilt auch,
   * wenn in der `.env` weniger steht. Nur Tests setzen 0, damit sie nicht warten.
   */
  minPauseMs?: number;
}

/** Schutzgrenze: live nie weniger als 3 s zwischen zwei Aktionen eines Accounts. */
export const MIN_PAUSE_MS = 3000;

export class LinkedInService {
  readonly guard: LinkedInGuard;

  /** Name eines Gründers in Meldungen. */
  founderName(id: AuthFounderId): string {
    return this.deps.founderName?.(id) ?? defaultFounderName(id);
  }

  private client: { key: string; client: UnipileClient } | null = null;
  private readonly queues = new Map<AuthFounderId, Promise<unknown>>();
  private readonly lastActionAt = new Map<AuthFounderId, number>();
  private readonly lastTestMessageAt = new Map<AuthFounderId, number>();
  private readonly lastTestInviteAt = new Map<AuthFounderId, number>();
  private lastSyncAt: number | null = null;
  private syncing: Promise<LinkedInSyncResponse> | null = null;
  private timer: NodeJS.Timeout | null = null;
  /** Wofür der Zeitgeber gerade geplant ist („live|15“) – nur neu planen, wenn sich das ändert. */
  private timerPlan: string | null = null;
  /** Abgleich im Hintergrund erlaubt (nur im echten Start, nicht in Tests). */
  private background = false;
  /** Warnung „Pause unter 3 s angehoben“ nur einmal ins Log. */
  private pauseWarned = false;

  constructor(private readonly deps: LinkedInDeps) {
    this.guard = new LinkedInGuard(deps.db, deps.config.linkedin);
  }

  /** Aus der laufenden Konfiguration – Einstellungen wirken ohne Neustart. */
  get mode(): LinkedInActionsMode {
    return linkedInMode(this.deps.config);
  }

  private get unipile(): UnipileClient | null {
    return this.mode === 'live' ? this.readClient : null;
  }

  /**
   * Nur lesender Abgleich (11.10.): Auch wenn von Hand gesendet wird (LINKEDIN_ACTIONS aus), prüft das Cockpit über
   * Unipile, ob eingetragene Anfragen angenommen wurden – sobald Unipile eingerichtet ist. Sendet nie etwas.
   */
  get watching(): boolean {
    if (this.mode === 'mock' || this.mode === 'live') return true;
    return this.readClient !== null;
  }

  /** Unipile-Client unabhängig von LINKEDIN_ACTIONS – nur für lesende Abfragen (Abgleich). */
  private get readClient(): UnipileClient | null {
    const { dsn, apiKey } = this.deps.config.unipile;
    if (this.deps.config.mode !== 'live' || !dsn || !apiKey) return null;
    const key = `${dsn}|${apiKey}`;
    if (this.client?.key !== key) this.client = { key, client: new UnipileClient({ dsn, apiKey, fetch: this.deps.fetch, timeoutMs: 30_000 }) };
    return this.client.client;
  }

  private get settings() {
    return this.deps.config.linkedin;
  }

  accountOf(founder: AuthFounderId): string | null {
    return this.mode === 'mock' ? `mock-${founder}` : this.settings.accounts[founder];
  }

  /** Live: beide Gründer auf demselben Account → nichts senden (die Grenzen gälten doppelt). */
  private assertOwnAccounts(): void {
    if (this.mode === 'live' && sharedLinkedInAccount(this.deps.config)) {
      throw new LinkedInError('linkedin_no_account', 409, `${SHARED_ACCOUNT_MESSAGE} Bitte unter Einstellungen → Senden über LinkedIn ändern.`);
    }
  }

  status(now = Date.now()): LinkedInStatusResponse {
    return {
      mode: this.mode,
      accounts: AUTH_FOUNDER_IDS.map((founder) => {
        const usage = this.guard.usage(founder, now);
        const pause = this.mode === 'live' ? this.guard.activePause(founder, now) : null;
        return {
          founder,
          connected: this.mode !== 'off' && this.accountOf(founder) !== null,
          invitesToday: { used: usage.invitesToday, limit: this.settings.invitesPerDay },
          invitesWeek: { used: usage.invitesWeek, limit: this.settings.invitesPerWeek },
          messagesToday: { used: usage.messagesToday, limit: this.settings.messagesPerDay },
          pausedUntil: pause?.until ?? null,
          pauseReason: pause?.reason ?? null,
        };
      }),
      workHours: { ...this.settings.workHours, days: [...this.settings.workHours.days] },
      withinWorkHours: this.mode !== 'live' || withinWorkHours(this.settings, now),
      lastSyncAt: this.lastSyncAt,
      watching: this.watching,
    };
  }

  // ── Senden ─────────────────────────────────────────────────────────────

  /**
   * Vernetzungsanfrage. founder = Gründer des angemeldeten Kontos (Mitarbeiter: sein Gründer; ohne Anmeldung: Besitzer
   * des Leads). actor = Anzeigename des Kontos fürs Ereignis.
   */
  invite(leadId: string, founder: AuthFounderId | null, message?: string, actor: string | null = null, clientId?: string): Promise<CockpitLead> {
    const note = message?.trim() || undefined;
    return this.run(leadId, founder, actor, clientId, 'invite', 'invite_sent', async (lead, accountId, sender) => {
      let invitationId: string | null;
      if (this.unipile) {
        const result = await this.unipile.sendInvitation({ accountId, providerId: lead.person.providerId, message: note }, AbortSignal.timeout(30_000));
        invitationId = result.invitation_id ?? null;
      } else {
        invitationId = `mock-inv-${randomUUID().slice(0, 8)}`;
      }
      const now = Date.now();
      // Über wessen Account die Anfrage ging – Erstnachricht und Follow-ups laufen später ebenso (nur dort ist man vernetzt).
      const state: LeadLinkedInState = { ...emptyState(lead, sender), sentBy: sender, invitationId, invitedAt: now };
      return { request: { action: 'invite_sent', text: note }, state, detail: invitationId };
    });
  }

  /** Erstnachricht (aus „Vernetzt“) oder Follow-up/Antwort (aus „Angeschrieben“, „Antwort“, „Termin“). */
  message(leadId: string, founder: AuthFounderId | null, text: string, label?: string, actor: string | null = null, clientId?: string): Promise<CockpitLead> {
    const body = text.trim();
    return this.run(leadId, founder, actor, clientId, 'message', 'message_sent', async (lead, accountId, sender) => {
      const base = lead.linkedin ?? emptyState(lead, sender);
      let chatId = base.chatId;
      let chatStartedAt = base.chatStartedAt;
      let messageId: string | null;
      if (this.unipile) {
        if (chatId) {
          messageId = (await this.unipile.sendChatMessage({ chatId, text: body }, AbortSignal.timeout(30_000))).message_id ?? null;
        } else {
          const started = await this.unipile.startChat({ accountId, attendeeId: lead.person.providerId, text: body }, AbortSignal.timeout(30_000));
          chatId = started.chat_id ?? null;
          chatStartedAt = Date.now();
          messageId = started.message_id ?? null;
        }
      } else {
        if (!chatId) {
          chatId = `mock-chat-${randomUUID().slice(0, 8)}`;
          chatStartedAt = Date.now();
        }
        messageId = `mock-msg-${randomUUID().slice(0, 8)}`;
      }
      const state: LeadLinkedInState = { ...base, chatId, chatStartedAt };
      return { request: { action: 'message_sent', text: body, label }, state, detail: messageId };
    });
  }

  private async run(
    leadId: string,
    founderOrNull: AuthFounderId | null,
    actor: string | null,
    clientId: string | undefined,
    kind: ActionKind,
    action: LeadAction,
    send: (
      lead: CockpitLead,
      accountId: string,
      sender: AuthFounderId,
    ) => Promise<{ request: { action: LeadAction; text?: string; label?: string }; state: LeadLinkedInState; detail: string | null }>,
  ): Promise<CockpitLead> {
    if (this.mode === 'off') {
      throw new LinkedInError('linkedin_off', 409, OFF_MESSAGE);
    }
    const lead = this.deps.leads.get(leadId);
    if (!lead) throw new LeadNotFoundError();
    // Schon gesendet (gleiche clientId, z. B. nach Netzfehler wiederholt): nicht noch einmal senden.
    if (clientId && this.deps.leads.hasClientEvent(leadId, clientId)) throw new DuplicateEventError();
    const founder = founderOrNull ?? lead.owner;
    if (lead.owner !== founder) {
      throw new LinkedInError('linkedin_not_owner', 409, `Der Lead gehört ${this.founderName(lead.owner)} – gesendet wird über dessen eigenen LinkedIn-Account.`);
    }
    // Über welchen Account (Wunsch des Nutzers 12.10.): Nachrichten über den, der die Anfrage gesendet hat; Anfragen
    // über den eigenen, solange er Platz hat – sonst über den des anderen Gründers (`LINKEDIN_ACCOUNT_FALLBACK`).
    const sender = kind === 'message' ? (lead.linkedin?.sentBy ?? founder) : this.inviteSender(founder, Date.now());
    const accountId = this.accountOf(sender);
    this.assertOwnAccounts();
    if (!accountId) {
      throw new LinkedInError(
        'linkedin_no_account',
        409,
        noAccountMessage(this.founderName(sender)),
      );
    }
    this.checkBeforeSend(lead, sender, kind, action, Date.now());

    return this.enqueue(sender, async () => {
      // Seit dem Klick kann sich etwas geändert haben (zweiter Klick, Limit, Pause).
      const fresh = this.deps.leads.get(leadId);
      if (!fresh) throw new LeadNotFoundError();
      // Zweiter Klick mit derselben Kennung stand in der Warteschlange hinter dem ersten → jetzt schon gesendet.
      if (clientId && this.deps.leads.hasClientEvent(leadId, clientId)) throw new DuplicateEventError();
      this.checkBeforeSend(fresh, sender, kind, action, Date.now());
      let result;
      try {
        result = await send(fresh, accountId, sender);
      } catch (error) {
        throw this.failure(error, sender, accountId, leadId, kind);
      }
      const now = Date.now();
      this.guard.record({ founder: sender, accountId, leadId, kind, status: 'sent', detail: result.detail }, now);
      this.deps.log.info({ leadId, founder, sender, kind }, 'LinkedIn-Aktion gesendet');
      return this.deps.leads.applyAction(leadId, { ...result.request, ...(clientId ? { clientId } : {}) }, founder, now, { state: result.state }, actor);
    });
  }

  /**
   * Je Gründer nacheinander: gleichzeitige Aktionen (Cockpit und Test-Anfrage) laufen nie parallel über denselben
   * Account. Live vor jeder Aktion die zufällige Pause seit der letzten; danach – auch nach einem Fehlschlag – zählt
   * die Aktion als letzte. `work` prüft Grenzen selbst noch einmal (seit dem Klick kann sich etwas geändert haben).
   */
  private enqueue<T>(founder: AuthFounderId, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(founder) ?? Promise.resolve();
    const job = previous
      .catch(() => undefined)
      .then(async () => {
        if (this.mode === 'live') {
          const last = this.lastActionAt.get(founder);
          const [from, to] = this.pauseRange();
          if (last !== undefined) await sleep(last + randomBetween(from, to, this.deps.random) - Date.now());
        }
        try {
          return await work();
        } finally {
          if (this.mode === 'live') this.lastActionAt.set(founder, Date.now());
        }
      });
    this.queues.set(founder, job);
    return job;
  }

  /** Pause live: aus den Einstellungen, aber nie unter der Schutzgrenze (die `.env` darf weniger enthalten). */
  private pauseRange(): [number, number] {
    const min = this.deps.minPauseMs ?? MIN_PAUSE_MS;
    const [from, to] = this.settings.pauseMs;
    if (from >= min) return [from, to];
    if (!this.pauseWarned) {
      this.pauseWarned = true;
      this.deps.log.warn('LINKEDIN_PAUSE_SECONDS liegt unter der Schutzgrenze – es gelten mindestens 3 Sekunden.');
    }
    return [min, Math.max(min, to)];
  }

  /**
   * Account für die nächste Anfrage des Gründers: eigener, solange er weder pausiert noch voll ist; sonst – mit
   * `LINKEDIN_ACCOUNT_FALLBACK` – der des anderen Gründers, wenn der eingetragen, frei und nicht voll ist. Passt keiner,
   * bleibt es beim eigenen (dann meldet `checkBeforeSend` Limit bzw. Pause wie bisher).
   */
  private inviteSender(founder: AuthFounderId, now: number): AuthFounderId {
    const free = (account: AuthFounderId) =>
      !this.guard.limitReached(account, 'invite', now) && !(this.mode === 'live' && this.guard.activePause(account, now));
    if (free(founder)) return founder;
    const other = this.settings.accountFallback ? otherFounder(founder) : null;
    if (other && this.accountOf(other) && free(other)) return other;
    return founder;
  }

  private checkBeforeSend(lead: CockpitLead, founder: AuthFounderId, kind: ActionKind, action: LeadAction, now: number): void {
    try {
      assertTransition(lead, action);
    } catch (error) {
      if (error instanceof InvalidTransitionError) throw new LinkedInError('invalid_transition', 409, error.message);
      throw error;
    }
    if (this.mode === 'live') {
      const pause = this.guard.activePause(founder, now);
      if (pause) {
        throw new LinkedInError('linkedin_paused', 503, `LinkedIn-Aktionen für ${this.founderName(founder)} pausiert: ${pause.reason}`, Math.ceil((pause.until - now) / 1000));
      }
      if (!withinWorkHours(this.settings, now)) {
        const { fromHour, toHour } = this.settings.workHours;
        throw new LinkedInError('linkedin_outside_hours', 409, `Gesendet wird nur zu Arbeitszeiten (${fromHour}–${toHour} Uhr an Werktagen).`);
      }
    }
    const limit = this.guard.limitReached(founder, kind, now);
    if (limit) throw new LinkedInError('linkedin_limit', 429, limit.message, limit.retryAfter);
  }

  /** Fehler beim Senden: protokollieren, bei Limit-/Zugangsfehlern den Account pausieren, verständliche Meldung. */
  private failure(error: unknown, founder: AuthFounderId, accountId: string, leadId: string | null, kind: ActionKind): LinkedInError {
    const now = Date.now();
    const classified = classify(error);
    this.guard.record({ founder, accountId, leadId, kind, status: 'failed', detail: classified.log }, now);
    this.deps.log.warn({ founder, leadId, kind, error: classified.log }, 'LinkedIn-Aktion fehlgeschlagen');
    if (classified.pauseMs) {
      const until = now + classified.pauseMs;
      this.pause(founder, until, classified.reason);
      return new LinkedInError('linkedin_paused', 503, `${classified.reason} Nichts gesendet; ${this.founderName(founder)} ist vorsichtshalber pausiert.`, Math.ceil(classified.pauseMs / 1000));
    }
    return new LinkedInError(classified.code, classified.status, classified.reason);
  }

  // ── Test-Befehl ────────────────────────────────────────────────────────

  /**
   * Genau eine Vernetzungsanfrage an ein vorgegebenes Profil (Roadmap: erst ein Test, dann das Cockpit). Gleiche
   * Schutzgrenzen wie im Cockpit, aber ohne Lead. Gibt die invitation_id zurück.
   */
  async testInvite(founder: AuthFounderId, identifier: string, message?: string): Promise<{ name: string; invitationId: string | null }> {
    if (this.mode !== 'live' || !this.unipile) throw new LinkedInError('linkedin_off', 409, OFF_MESSAGE);
    const accountId = this.accountOf(founder);
    if (!accountId) throw new LinkedInError('linkedin_no_account', 409, noAccountMessage(this.founderName(founder)));
    this.assertOwnAccounts();
    // Vorab prüfen (schnelle Antwort), in der Warteschlange noch einmal – wie beim Senden im Cockpit.
    this.checkTestInvite(founder, Date.now());
    return this.enqueue(founder, async () => {
      const unipile = this.unipile;
      if (!unipile) throw new LinkedInError('linkedin_off', 409, OFF_MESSAGE);
      this.checkTestInvite(founder, Date.now());
      try {
        const profile = await unipile.getProfile({ accountId, identifier }, AbortSignal.timeout(30_000));
        if (!profile.provider_id) throw new LinkedInError('linkedin_rejected', 409, 'Profil ohne provider_id – nichts gesendet.');
        const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || identifier;
        const result = await unipile.sendInvitation({ accountId, providerId: profile.provider_id, message: message?.trim() || undefined }, AbortSignal.timeout(30_000));
        this.guard.record({ founder, accountId, leadId: null, kind: 'invite', status: 'sent', detail: `Test: ${result.invitation_id ?? ''}` }, Date.now());
        return { name, invitationId: result.invitation_id ?? null };
      } catch (error) {
        if (error instanceof LinkedInError) throw error;
        throw this.failure(error, founder, accountId, null, 'invite');
      }
    });
  }

  /** Pause, Arbeitszeit, Limit für die Test-Anfrage (wie `checkBeforeSend`, ohne Lead). */
  private checkTestInvite(founder: AuthFounderId, now: number): void {
    const pause = this.guard.activePause(founder, now);
    if (pause) {
      throw new LinkedInError('linkedin_paused', 503, `LinkedIn-Aktionen für ${this.founderName(founder)} pausiert: ${pause.reason}`, Math.ceil((pause.until - now) / 1000));
    }
    if (!withinWorkHours(this.settings, now)) {
      const { fromHour, toHour } = this.settings.workHours;
      throw new LinkedInError('linkedin_outside_hours', 409, `Gesendet wird nur zu Arbeitszeiten (${fromHour}–${toHour} Uhr an den eingestellten Arbeitstagen).`);
    }
    const limit = this.guard.limitReached(founder, 'invite', now);
    if (limit) throw new LinkedInError('linkedin_limit', 429, limit.message, limit.retryAfter);
  }

  // ── Test-LinkedIn-Account ──────────────────────────────────────────────

  /** Gespeicherter Test-Account (Tabelle `settings`, Schlüssel `linkedin_test_profile`) oder null. */
  testProfile(): LinkedInTestProfile | null {
    const row = this.deps.db.prepare('SELECT value FROM settings WHERE key = ?').get(TEST_PROFILE_KEY) as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as LinkedInTestProfile;
    } catch {
      return null;
    }
  }

  clearTestProfile(): void {
    this.deps.db.prepare('DELETE FROM settings WHERE key = ?').run(TEST_PROFILE_KEY);
  }

  private saveTestProfile(profile: LinkedInTestProfile): void {
    this.deps.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .run(TEST_PROFILE_KEY, JSON.stringify(profile));
  }

  /** Unipile-Client für den Test-Account: braucht nur Adresse und Token, nicht LINKEDIN_ACTIONS. */
  private testClient(): UnipileClient {
    const { dsn, apiKey } = this.deps.config.unipile;
    if (!dsn || !apiKey) {
      throw new LinkedInError('linkedin_off', 409, 'Unipile ist nicht eingerichtet – trag Adresse und Token unter Einstellungen → LinkedIn (Unipile) ein.');
    }
    return new UnipileClient({ dsn, apiKey, fetch: this.deps.fetch, timeoutMs: 30_000 });
  }

  private testAccount(founder: AuthFounderId): string {
    const accountId = this.deps.config.mode === 'mock' ? `mock-${founder}` : this.settings.accounts[founder];
    if (!accountId) throw new LinkedInError('linkedin_no_account', 409, noAccountMessage(this.founderName(founder)));
    return accountId;
  }

  /** Profil über Unipile auflösen (ohne Benachrichtigung) – Grundlage für Prüfen und Senden. */
  private async resolveTestProfile(founder: AuthFounderId, identifier: string): Promise<LinkedInTestProfile> {
    const accountId = this.testAccount(founder);
    if (this.deps.config.mode === 'mock') {
      return { name: 'Test-Kontakt', headline: 'Test-Account', publicIdentifier: identifier, profileUrl: `https://www.linkedin.com/in/${identifier}`, providerId: `mock-${identifier}`, connected: true, checkedAt: Date.now() };
    }
    const client = this.testClient();
    let profile;
    try {
      profile = await client.getProfile({ accountId, identifier }, AbortSignal.timeout(30_000));
    } catch (error) {
      if (error instanceof UnipileHttpError && (error.status === 404 || error.status === 422)) {
        throw new LinkedInError('linkedin_rejected', 409, 'Dieses Profil findet LinkedIn nicht – bitte den Link prüfen.');
      }
      const classified = classify(error);
      throw new LinkedInError(classified.code === 'linkedin_paused' ? 'linkedin_error' : classified.code, classified.status, classified.reason.replace(/ – nichts gesendet\.?$/, '.'));
    }
    if (!profile.provider_id) throw new LinkedInError('linkedin_rejected', 409, 'LinkedIn liefert für dieses Profil keine Kennung – bitte ein anderes Profil wählen.');
    const publicIdentifier = profile.public_identifier ?? null;
    return {
      name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || identifier,
      headline: profile.headline?.trim() || null,
      publicIdentifier,
      profileUrl: publicIdentifier ? `https://www.linkedin.com/in/${publicIdentifier}` : null,
      providerId: profile.provider_id,
      connected: profile.network_distance === 'FIRST_DEGREE',
      checkedAt: Date.now(),
    };
  }

  /** Test-Account prüfen und speichern. Sendet nichts. */
  async setTestProfile(founder: AuthFounderId, identifier: string): Promise<LinkedInTestProfile> {
    const profile = await this.resolveTestProfile(founder, identifier);
    this.saveTestProfile(profile);
    return profile;
  }

  /**
   * Genau eine Nachricht an den gespeicherten Test-Account (nie an einen Lead) – prüft nach Updates, ob Nachrichten
   * ankommen. Braucht nur den Unipile-Zugang. Pause und Tageslimit gelten, höchstens eine Test-Nachricht pro Minute.
   */
  async testMessage(founder: AuthFounderId, text: string): Promise<{ name: string }> {
    const stored = this.testProfile();
    if (!stored) throw new LinkedInError('linkedin_rejected', 409, 'Zuerst einen Test-Account eintragen und prüfen.');
    const accountId = this.testAccount(founder);
    const now = Date.now();
    const pause = this.guard.activePause(founder, now);
    if (pause) throw new LinkedInError('linkedin_paused', 503, `LinkedIn-Aktionen für ${this.founderName(founder)} pausiert: ${pause.reason}`, Math.ceil((pause.until - now) / 1000));
    const limit = this.guard.limitReached(founder, 'message', now);
    if (limit) throw new LinkedInError('linkedin_limit', 429, limit.message, limit.retryAfter);
    // Simulation (Tests): nichts senden, keine Wartezeit.
    if (this.deps.config.mode === 'mock') return { name: stored.name };
    const last = this.lastTestMessageAt.get(founder);
    if (last !== undefined && now - last < TEST_MESSAGE_COOLDOWN_MS) {
      const wait = Math.ceil((last + TEST_MESSAGE_COOLDOWN_MS - now) / 1000);
      throw new LinkedInError('linkedin_limit', 429, `Bitte warte ${wait} Sekunden bis zur nächsten Test-Nachricht.`, wait);
    }
    this.lastTestMessageAt.set(founder, now);
    return this.enqueue(founder, async () => {
      // Vor dem Senden noch einmal auflösen: Ist es noch dasselbe Profil, und ist es (noch) ein Kontakt?
      const current = await this.resolveTestProfile(founder, stored.providerId);
      if (current.providerId !== stored.providerId) {
        throw new LinkedInError('linkedin_rejected', 409, 'Das gespeicherte Profil passt nicht mehr – bitte den Test-Account neu prüfen. Nichts gesendet.');
      }
      this.saveTestProfile({ ...stored, connected: current.connected, checkedAt: current.checkedAt });
      if (!current.connected) {
        throw new LinkedInError('linkedin_rejected', 409, `${stored.name} ist kein Kontakt von ${this.founderName(founder)} – LinkedIn stellt Nachrichten nur an Kontakte 1. Grades zu. Nichts gesendet.`);
      }
      try {
        const result = await this.testClient().startChat({ accountId, attendeeId: stored.providerId, text }, AbortSignal.timeout(30_000));
        this.guard.record({ founder, accountId, leadId: null, kind: 'message', status: 'sent', detail: `Test: ${result.message_id ?? ''}` }, Date.now());
        return { name: stored.name };
      } catch (error) {
        throw this.failure(error, founder, accountId, null, 'message');
      }
    });
  }

  /**
   * Genau eine Vernetzungsanfrage an den gespeicherten Test-Account (nie an einen Lead). Braucht nur den Unipile-Zugang.
   * Pause und Tageslimit für Anfragen gelten, höchstens eine Test-Anfrage pro Minute. Ist der Test-Account schon ein
   * Kontakt 1. Grades, geht keine Anfrage raus (LinkedIn würde sie ablehnen).
   */
  async testConnect(founder: AuthFounderId, note?: string): Promise<{ name: string }> {
    const stored = this.testProfile();
    if (!stored) throw new LinkedInError('linkedin_rejected', 409, 'Zuerst einen Test-Account eintragen und prüfen.');
    const accountId = this.testAccount(founder);
    const now = Date.now();
    const pause = this.guard.activePause(founder, now);
    if (pause) throw new LinkedInError('linkedin_paused', 503, `LinkedIn-Aktionen für ${this.founderName(founder)} pausiert: ${pause.reason}`, Math.ceil((pause.until - now) / 1000));
    const limit = this.guard.limitReached(founder, 'invite', now);
    if (limit) throw new LinkedInError('linkedin_limit', 429, limit.message, limit.retryAfter);
    // Simulation (Tests): nichts senden, keine Wartezeit.
    if (this.deps.config.mode === 'mock') return { name: stored.name };
    const last = this.lastTestInviteAt.get(founder);
    if (last !== undefined && now - last < TEST_MESSAGE_COOLDOWN_MS) {
      const wait = Math.ceil((last + TEST_MESSAGE_COOLDOWN_MS - now) / 1000);
      throw new LinkedInError('linkedin_limit', 429, `Bitte warte ${wait} Sekunden bis zur nächsten Test-Anfrage.`, wait);
    }
    this.lastTestInviteAt.set(founder, now);
    return this.enqueue(founder, async () => {
      const current = await this.resolveTestProfile(founder, stored.providerId);
      if (current.providerId !== stored.providerId) {
        throw new LinkedInError('linkedin_rejected', 409, 'Das gespeicherte Profil passt nicht mehr – bitte den Test-Account neu prüfen. Nichts gesendet.');
      }
      this.saveTestProfile({ ...stored, connected: current.connected, checkedAt: current.checkedAt });
      if (current.connected) {
        throw new LinkedInError(
          'linkedin_rejected',
          409,
          `${stored.name} ist schon ein Kontakt von ${this.founderName(founder)} – eine Anfrage geht nicht. Zum Testen die Verbindung auf LinkedIn entfernen oder einen anderen Test-Account wählen. Nichts gesendet.`,
        );
      }
      try {
        const result = await this.testClient().sendInvitation({ accountId, providerId: stored.providerId, message: note?.trim() || undefined }, AbortSignal.timeout(30_000));
        this.guard.record({ founder, accountId, leadId: null, kind: 'invite', status: 'sent', detail: `Test: ${result.invitation_id ?? ''}` }, Date.now());
        return { name: stored.name };
      } catch (error) {
        throw this.failure(error, founder, accountId, null, 'invite');
      }
    });
  }

  // ── Abgleich ───────────────────────────────────────────────────────────

  /** Angenommene Anfragen und neue Antworten holen. Läuft nie doppelt gleichzeitig. */
  sync(): Promise<LinkedInSyncResponse> {
    if (!this.syncing) {
      this.syncing = this.syncOnce().finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  }

  private async syncOnce(): Promise<LinkedInSyncResponse> {
    const result: LinkedInSyncResponse = { accepted: [], replied: [], problems: [], syncedAt: Date.now() };
    if (this.mode === 'off' && !this.watching) {
      result.problems.push('Unipile ist nicht eingerichtet – angenommene Anfragen lassen sich nicht automatisch prüfen.');
      return result;
    }
    for (const founder of AUTH_FOUNDER_IDS) {
      const accountId = this.accountOf(founder);
      if (!accountId) {
        result.problems.push(`${this.founderName(founder)}: kein LinkedIn-Account eingetragen.`);
        continue;
      }
      try {
        if (this.mode === 'mock') this.syncMock(founder, result);
        else await this.syncLive(founder, accountId, result);
      } catch (error) {
        const classified = classify(error);
        if (classified.pauseMs) this.pause(founder, Date.now() + classified.pauseMs, classified.reason);
        this.deps.log.warn({ founder, error: classified.log }, 'LinkedIn-Abgleich fehlgeschlagen');
        result.problems.push(`${this.founderName(founder)}: ${classified.reason}`);
      }
    }
    this.lastSyncAt = result.syncedAt;
    return result;
  }

  /** Offene Leads, deren Anfrage bzw. Unterhaltung über den Account dieses Gründers läuft (auch fremde Leads, 12.10.). */
  private openLeads(founder: AuthFounderId): CockpitLead[] {
    return this.deps.leads
      .list({ stages: ['invited', ...CHAT_STAGES], limit: 100_000 })
      .leads.filter((lead) => (lead.linkedin?.sentBy ?? lead.owner) === founder);
  }

  private async syncLive(founder: AuthFounderId, accountId: string, result: LinkedInSyncResponse): Promise<void> {
    // Lesend – auch ohne LINKEDIN_ACTIONS (angenommene Anfragen von Hand gesendeter Anfragen erkennen).
    const unipile = this.readClient!;
    const leads = this.openLeads(founder);

    // Angenommene Anfragen: neueste Kontakte (bis 3 Seiten) mit offenen Anfragen abgleichen.
    const invited = leads.filter((lead) => lead.stage === 'invited');
    if (invited.length) {
      const byId = new Map(invited.map((lead) => [lead.person.providerId, lead]));
      const byPublic = new Map(invited.filter((lead) => lead.person.publicIdentifier).map((lead) => [lead.person.publicIdentifier!.toLowerCase(), lead]));
      let cursor: string | null | undefined = null;
      for (let page = 0; page < 3 && byId.size; page++) {
        const response: { items: { member_id?: string; public_identifier?: string; created_at?: number }[]; cursor?: string | null } =
          await unipile.listRelations({ accountId, limit: 100, cursor }, AbortSignal.timeout(30_000));
        for (const relation of response.items ?? []) {
          const lead = (relation.member_id && byId.get(relation.member_id)) || (relation.public_identifier && byPublic.get(relation.public_identifier.toLowerCase()));
          if (!lead || !byId.has(lead.person.providerId)) continue;
          byId.delete(lead.person.providerId);
          // created_at: Zeitpunkt der Verbindung; Sekunden oder Millisekunden – beides abfangen.
          const created = relation.created_at && relation.created_at > 0 ? (relation.created_at < 1e12 ? relation.created_at * 1000 : relation.created_at) : null;
          // Nie vor der eigenen Anfrage (falsche Uhr/alte Verbindung), nie in der Zukunft.
          const at = created ? Math.min(Math.max(created, lead.lastContactAt ?? 0), Date.now()) : undefined;
          this.deps.leads.applyAction(lead.id, { action: 'invite_accepted', at }, null, Date.now(), {});
          result.accepted.push(lead.id);
        }
        cursor = response.cursor;
        if (!cursor) break;
      }
    }

    // Antworten: nur in Unterhaltungen, die das Cockpit begonnen hat.
    for (const lead of leads) {
      const state = lead.linkedin;
      if (!state?.chatId || !CHAT_STAGES.includes(lead.stage as (typeof CHAT_STAGES)[number])) continue;
      const response = await unipile.chatMessages({ chatId: state.chatId, limit: 20 }, AbortSignal.timeout(30_000));
      const since = (state.chatStartedAt ?? 0) - 60_000;
      const incoming = (response.items ?? [])
        .filter((message) => message.is_sender === 0 && Date.parse(message.timestamp) >= since)
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      for (const message of incoming) {
        if (!this.guard.markSeen(message.id, lead.id, Date.now())) continue;
        const current = this.deps.leads.get(lead.id);
        if (!current || !['invited', ...CHAT_STAGES].includes(current.stage)) continue;
        this.deps.leads.applyAction(
          lead.id,
          { action: 'message_received', text: message.text ?? undefined, at: Math.min(Date.parse(message.timestamp), Date.now()) },
          null,
          Date.now(),
          {},
        );
        if (!result.replied.includes(lead.id)) result.replied.push(lead.id);
      }
    }
  }

  /** Simulation: rund 2 von 3 Anfragen werden angenommen, auf rund jede 3. Nachricht kommt eine Antwort. */
  private syncMock(founder: AuthFounderId, result: LinkedInSyncResponse): void {
    const speed = this.deps.config.mockSpeed;
    const now = Date.now();
    for (const lead of this.openLeads(founder)) {
      const state = lead.linkedin;
      if (!state) continue;
      const number = stableNumber(lead.id);
      if (lead.stage === 'invited' && state.invitedAt && now - state.invitedAt >= MOCK_ACCEPT_S * 1000 * speed && number % 3 !== 0) {
        this.deps.leads.applyAction(lead.id, { action: 'invite_accepted' }, null, now, {});
        result.accepted.push(lead.id);
      } else if (
        lead.stage === 'contacted' &&
        state.chatId &&
        lead.lastContactAt &&
        now - lead.lastContactAt >= MOCK_REPLY_S * 1000 * speed &&
        number % 3 === 0 &&
        this.guard.markSeen(`mock-reply-${lead.id}`, lead.id, now)
      ) {
        this.deps.leads.applyAction(lead.id, { action: 'message_received', text: MOCK_REPLY }, null, now, {});
        result.replied.push(lead.id);
      }
    }
  }

  // ── Einrichten in der Oberfläche ───────────────────────────────────────

  /**
   * Bei Unipile verbundene LinkedIn-Accounts zur Auswahl für UNIPILE_ACCOUNT_NICK/JOHANNES. Braucht nur den
   * Unipile-Zugang, nicht LINKEDIN_ACTIONS. Simulation: zwei erfundene Accounts, kein Netz.
   */
  async unipileAccounts(): Promise<LinkedInUnipileAccount[]> {
    const { config } = this.deps;
    // Simulation ohne Auswahl: es gilt `mock-<gründer>` (wie `accountOf`).
    const current = (founder: AuthFounderId) => config.linkedin.accounts[founder] ?? (config.mode === 'mock' ? `mock-${founder}` : null);
    const assigned = (id: string): AuthFounderId | null => AUTH_FOUNDER_IDS.find((founder) => current(founder) === id) ?? null;
    if (config.mode === 'mock') {
      // Simulation: ohne UNIPILE_ACCOUNT_ID sucht der erste Account.
      const search = config.unipile.accountId ?? MOCK_UNIPILE_ACCOUNTS[0].id;
      return MOCK_UNIPILE_ACCOUNTS.map((account) => ({ ...account, assignedTo: assigned(account.id), searching: account.id === search }));
    }
    const { dsn, apiKey } = config.unipile;
    if (!dsn || !apiKey) {
      throw new LinkedInError('linkedin_off', 409, 'Unipile ist nicht eingerichtet – trag Adresse und Token unter Einstellungen → LinkedIn (Unipile) ein.');
    }
    let items: UnipileAccount[];
    try {
      const client = new UnipileClient({ dsn, apiKey, fetch: this.deps.fetch, timeoutMs: 20_000 });
      items = (await client.listAccounts(AbortSignal.timeout(25_000))).items ?? [];
    } catch (error) {
      this.deps.log.warn({ error: error instanceof UnipileHttpError ? `HTTP ${error.status}` : error instanceof Error ? error.name : 'Fehler' }, 'Unipile-Accounts nicht abrufbar');
      const rejected = error instanceof UnipileHttpError && (error.status === 401 || error.status === 403);
      throw new LinkedInError(
        'linkedin_error',
        503,
        rejected ? 'Unipile lehnt den Zugang ab – bitte Adresse und Token unter Einstellungen → LinkedIn (Unipile) prüfen.' : 'Unipile ist gerade nicht erreichbar – bitte später noch einmal.',
      );
    }
    // Derselbe Such-Account wie in der Lead-Suche (UNIPILE_ACCOUNT_ID, sonst die automatische Wahl).
    const search = pickLinkedinAccount(items, config.unipile.accountId, config.unipile.searchApi)?.id ?? null;
    return items
      .filter((account) => typeof account.id === 'string' && account.id && (account.type ?? '').toUpperCase() === 'LINKEDIN')
      .map((account) => ({
        id: account.id!,
        name: account.name?.trim() || 'LinkedIn-Account ohne Namen',
        assignedTo: assigned(account.id!),
        searching: account.id === search,
      }));
  }

  /** Pause eines Accounts aufheben (wie `linkedinCli fortsetzen`). Keine Pause → unverändert. */
  resume(founder: AuthFounderId): LinkedInStatusResponse {
    if (this.guard.clearPause(founder)) this.deps.log.info({ founder }, 'LinkedIn-Pause aufgehoben');
    this.deps.onResume?.(founder);
    return this.status();
  }

  private pause(founder: AuthFounderId, until: number, reason: string): void {
    this.guard.setPause(founder, until, reason);
    this.deps.onPause?.(founder, until, reason);
  }

  // ── Abgleich im Hintergrund ────────────────────────────────────────────

  /** Live: Abgleich alle LINKEDIN_SYNC_MINUTES Minuten (nur lesend). */
  startBackgroundSync(): void {
    this.background = true;
    this.replanSync();
  }

  /**
   * Zeitgeber nach den aktuellen Einstellungen planen – nach jeder Änderung der Einstellungen aufrufen (Modus,
   * LINKEDIN_ACTIONS, Zugang, LINKEDIN_SYNC_MINUTES). Ändert sich nichts, läuft der Zeitgeber unverändert weiter.
   */
  replanSync(): void {
    const minutes = this.settings.syncMinutes;
    // Auch im Eintragen-Modus (LINKEDIN_ACTIONS aus), solange Unipile eingerichtet ist – der Abgleich liest nur.
    const plan = this.background && this.mode !== 'mock' && this.watching && minutes > 0 ? `live|${minutes}` : null;
    if (plan === this.timerPlan) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.timerPlan = plan;
    if (!plan) return;
    this.timer = setInterval(() => {
      this.sync().catch((error) => this.deps.log.error({ err: error }, 'LinkedIn-Abgleich fehlgeschlagen'));
    }, minutes * 60_000);
    this.timer.unref();
  }

  /** Nur Tests: Minuten, für die der Abgleich gerade geplant ist (null = aus). */
  get plannedSyncMinutes(): number | null {
    return this.timerPlan ? Number(this.timerPlan.split('|')[1]) : null;
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.timerPlan = null;
    this.background = false;
  }
}

const TEST_PROFILE_KEY = 'linkedin_test_profile';
const TEST_MESSAGE_COOLDOWN_MS = 60_000;

const OFF_MESSAGE = 'Echte LinkedIn-Aktionen sind ausgeschaltet – einschalten unter Einstellungen → Senden über LinkedIn.';

function noAccountMessage(name: string): string {
  return `Für ${name} ist kein LinkedIn-Account gewählt – unter Einstellungen → Senden über LinkedIn auswählen.`;
}

/** Simulation: zwei erfundene Unipile-Accounts zur Auswahl. */
const MOCK_UNIPILE_ACCOUNTS: readonly Omit<LinkedInUnipileAccount, 'assignedTo' | 'searching'>[] = [
  { id: 'mock-nick', name: 'Nick (Simulation)' },
  { id: 'mock-johannes', name: 'Johannes (Simulation)' },
];

function emptyState(lead: CockpitLead, founder: AuthFounderId): LeadLinkedInState {
  return lead.linkedin ?? { sentBy: founder, invitationId: null, invitedAt: null, chatId: null, chatStartedAt: null };
}

interface Classified {
  code: LinkedInErrorCode;
  status: number;
  /** Satz für die Oberfläche (ohne Schlüssel oder Antworttext). */
  reason: string;
  /** Für das Protokoll. */
  log: string;
  pauseMs?: number;
}

/** Unipile-Fehler einordnen. Limit- und Zugangsfehler pausieren den Account, Einzelablehnungen nicht. */
export function classify(error: unknown): Classified {
  if (error instanceof LinkedInError) return { code: error.code === 'invalid_transition' ? 'linkedin_rejected' : error.code, status: error.status, reason: error.message, log: error.message };
  if (error instanceof UnipileNetworkError || (error instanceof Error && error.name === 'TimeoutError')) {
    return { code: 'linkedin_error', status: 502, reason: 'Unipile ist gerade nicht erreichbar – nichts gesendet, bitte später noch einmal.', log: error.message };
  }
  if (!(error instanceof UnipileHttpError)) {
    return { code: 'linkedin_error', status: 502, reason: 'Unerwarteter Fehler – nichts gesendet.', log: error instanceof Error ? error.message : String(error) };
  }
  const type = (error.type ?? '').toLowerCase();
  const log = `HTTP ${error.status} ${error.type ?? ''}`.trim();
  // Keine Unipile-Sitzung (Abo/Testzeitraum abgelaufen, Account getrennt): kein verstecktes Limit, also keine Pause –
  // die Aktion scheitert mit klarer Meldung, bis der Account bei Unipile wieder läuft.
  if (isUnipileSessionDown(error)) {
    return { code: 'linkedin_error', status: 503, reason: `${UNIPILE_SESSION_DOWN_TEXT} – nichts gesendet.`, log };
  }
  if (error.status === 429 || /too_many|limit|throttl|quota/.test(type)) {
    return { code: 'linkedin_paused', status: 503, reason: 'LinkedIn meldet ein Limit.', log, pauseMs: PAUSE_LIMIT_MS };
  }
  if (error.status === 401 || error.status === 403) {
    return {
      code: 'linkedin_paused',
      status: 503,
      reason: 'Unipile lehnt den Zugang ab (API-Key, Berechtigung oder LinkedIn-Account getrennt).',
      log,
      pauseMs: PAUSE_AUTH_MS,
    };
  }
  if (error.status === 404) return { code: 'linkedin_rejected', status: 409, reason: 'Profil oder Unterhaltung bei LinkedIn nicht gefunden – nichts gesendet.', log };
  if (error.status === 400 || error.status === 409 || error.status === 422) {
    // Typische Fälle: schon eingeladen, kürzlich zurückgezogen, Nachricht nur an Kontakte möglich.
    const hint = /already|recently|cannot_resend|exists/.test(type)
      ? ' (vermutlich schon eingeladen oder vernetzt)'
      : /not_connected|no_connection|first_degree|relation/.test(type)
        ? ' (Nachrichten gehen nur an Kontakte)'
        : '';
    return { code: 'linkedin_rejected', status: 409, reason: `LinkedIn lehnt diese Aktion ab${hint} – nichts gesendet.`, log };
  }
  return { code: 'linkedin_paused', status: 503, reason: `Unipile meldet einen Serverfehler (HTTP ${error.status}) – kann ein verstecktes Limit sein.`, log, pauseMs: PAUSE_SERVER_MS };
}
