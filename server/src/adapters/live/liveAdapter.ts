import {
  MAX_RESULTS_LIMIT,
  NETWORK_DISTANCES,
  type EnrichedProfile,
  type LinkedinAccountStatus,
  type MetaAdsCheck,
  type NetworkDistance,
  type PrescreenVerdict,
  type SearchHit,
  type SearchProfile,
} from '../../../../shared/leadSearch.js';
import { AUTH_FOUNDER_IDS, defaultFounderName, type AuthFounderId } from '../../../../shared/auth.js';
import type { Config } from '../../config.js';
import { randomBetween, sleep } from '../../lib/sleep.js';
import {
  AdapterError,
  CancelledError,
  type EnrichResult,
  type FounderNetwork,
  type LeadSearchAdapter,
  type NetworkCheck,
  type RunContext,
  type SearchOptions,
} from '../../pipeline/adapter.js';
import { AnthropicQualifier } from './anthropicQualifier.js';
import { MetaAdLibraryClient, MetaAdsChecker } from './metaAdLibrary.js';
import { queryPriority } from '../../pipeline/searchMemory.js';
import {
  UnipileClient,
  UnipileHttpError,
  UnipileNetworkError,
  type UnipileAccount,
  type UnipilePeopleResult,
  type UnipileProfile,
  type UnipileSearchResponse,
  isUnipileSessionDown,
  UNIPILE_SESSION_DOWN_TEXT,
  UNIPILE_SESSION_DOWN_TITLE,
} from './unipileClient.js';

/** Pause zwischen zwei Profilabrufen: zufällig 3–8 Sekunden. */
export const PROFILE_PAUSE_MS = { min: 3_000, max: 8_000 } as const;
/** Kürzere Pausen für Folgeseiten der Suche und den Firmenabruf direkt nach dem Profil. */
const SEARCH_PAGE_PAUSE_MS = { min: 2_000, max: 4_000 } as const;
const COMPANY_PAUSE_MS = { min: 1_500, max: 3_000 } as const;
/** Klassische Suche liefert höchstens 10 Personen pro Seite, Sales Navigator mehr. */
const PAGE_SIZE = { classic: 10, sales_navigator: 25 } as const;
/**
 * Obergrenze an Suchanfragen (Seiten) pro Lauf: doppelt so viele, wie `maxHits` rechnerisch braucht (verschiedene
 * Kombinationen liefern oft dieselben Personen), höchstens `MAX_SEARCH_REQUESTS`. Seit 11.10. (Kunde: 400 Kontakte pro
 * Lauf durchsehen) nicht mehr fest 8 – Suchseiten sind keine Profilbesuche, Limit-Fehler brechen weiter sofort ab.
 */
export const MAX_SEARCH_REQUESTS = 200;
export function maxSearchRequests(maxHits: number, pageSize: number): number {
  return Math.min(MAX_SEARCH_REQUESTS, Math.max(4, Math.ceil(maxHits / pageSize) * 2));
}
/**
 * Klassische Suche: höchstens so viele Seiten je Suchanfrage – über alle Läufe (Suchgedächtnis); LinkedIn zeigt ohnehin
 * nur die ersten 1.000 Treffer. Bis 11.10. 10 Seiten je Lauf, danach fing der nächste Lauf wieder vorne an.
 */
export const MAX_CLASSIC_PAGES = 100;
/** Klassische Suche: so viele Seiten am Stück ohne neuen Treffer gelten als gesättigt (siehe `searchClassic`). */
export const MAX_BARREN_PAGES = 12;
const MAX_INVITATION_PAGES = 10;
/**
 * Kontakte der übrigen Gründer-Accounts (GET /users/relations): 100 je Seite, höchstens 100 Seiten (10.000 Kontakte),
 * kurze Pausen zwischen den Seiten. Zwischengespeichert, damit LinkedIn kaum Abrufe sieht: Kontakte 12 h,
 * gesendete Anfragen 1 h (neue Anfragen aus dem Cockpit erkennt ohnehin die Datenbank).
 */
export const MAX_RELATION_PAGES = 100;
const RELATION_PAGE_SIZE = 100;
export const RELATIONS_TTL_MS = 12 * 60 * 60 * 1000;
export const SENT_INVITATIONS_TTL_MS = 60 * 60 * 1000;
const LIST_PAGE_PAUSE_MS = { min: 1_000, max: 2_500 } as const;

export type PauseFn = (range: { min: number; max: number }, signal: AbortSignal) => Promise<void>;

const defaultPause: PauseFn = (range, signal) => sleep(randomBetween(range.min, range.max), signal);

export interface LiveAdapterOptions {
  accountId: string | null;
  searchApi: 'classic' | 'sales_navigator';
  locationId: string | null;
  fetchCompany: boolean;
  /**
   * Unipile-Account je Gründer (UNIPILE_ACCOUNT_NICK / _JOHANNES). Kontakte und offene Anfragen dieser Accounts
   * zählen im Dubletten-Filter mit – außer dem Such-Account selbst (den deckt Suche/Profil ab).
   */
  founderAccounts?: Partial<Record<AuthFounderId, string | null>>;
  /** Austauschbar für Tests – im Betrieb echte Pausen. */
  pause?: PauseFn;
  /** Uhr für den Zwischenspeicher der Kontaktlisten (Tests). */
  now?: () => number;
}

interface Qualifier {
  /** `runId`: KI-Kosten dem Lauf zuordnen (Tagesbudget der automatischen Suche). */
  /** `examples`: Beispiele aus Rückmeldungen zur Lead-Qualität (`RunContext.examples`). */
  qualify(hit: SearchHit, profile: EnrichedProfile, signal: AbortSignal, runId?: string, examples?: string | null): Promise<unknown>;
  prescreen?(hits: readonly SearchHit[], region: string, signal: AbortSignal, runId?: string, examples?: string | null): Promise<Map<string, PrescreenVerdict>>;
}

interface AdsChecker {
  check(profile: EnrichedProfile, signal: AbortSignal): Promise<MetaAdsCheck>;
}

/** Suchbegriffe mit OR verknüpfen (LinkedIn-Boolesche Suche), Begriffe mit Leerzeichen in Anführungszeichen. */
export function orJoin(terms: string[]): string {
  return terms
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => (/\s/.test(term) ? `"${term.replace(/"/g, '')}"` : term))
    .join(' OR ');
}

export function buildSearchBody(api: 'classic' | 'sales_navigator', profile: SearchProfile, locationId: string): object {
  const distances = [...NETWORK_DISTANCES];
  if (api === 'sales_navigator') {
    return {
      api,
      category: 'people',
      keywords: `(${orJoin(profile.keywords)}) AND (${orJoin(profile.positions)})`,
      location: { include: [locationId] },
      network_distance: distances,
    };
  }
  return {
    api,
    category: 'people',
    keywords: orJoin(profile.keywords),
    advanced_keywords: { title: orJoin(profile.positions) },
    location: [locationId],
    network_distance: distances,
  };
}

/**
 * Klassische Suche ohne ODER-Logik: LinkedIn wertet „A OR B“ hier nicht zuverlässig aus (im Test kam genau ein
 * Treffer). Stattdessen je eine einfache Suche pro Kombination aus Stichwort und Position. Reihenfolge diagonal,
 * damit die wichtigsten Begriffe zuerst kommen und sich trotzdem früh abwechseln:
 * (GF, Kapitalanlage), (GF, Bauträger), (Inhaber, Kapitalanlage), (GF, Projektentwicklung), …
 */
export function searchCombinations(profile: SearchProfile): Array<{ keyword: string; position: string }> {
  const keywords = profile.keywords.map((term) => term.trim()).filter(Boolean);
  const positions = profile.positions.map((term) => term.trim()).filter(Boolean);
  const combos: Array<{ keyword: string; position: string; rank: number; p: number }> = [];
  positions.forEach((position, p) => keywords.forEach((keyword, k) => combos.push({ keyword, position, rank: p + k, p })));
  return combos.sort((a, b) => a.rank - b.rank || a.p - b.p).map(({ keyword, position }) => ({ keyword, position }));
}

export function buildClassicSearchBody(keyword: string, position: string, locationId: string, field: 'keywords' | 'company' = 'keywords'): object {
  if (field === 'company') {
    // Stichwort im Namen der aktuellen Firma („… Projektentwicklung GmbH“) – trifft Firmen statt Profiltexte.
    return {
      api: 'classic',
      category: 'people',
      advanced_keywords: { title: position, company: keyword },
      location: [locationId],
      network_distance: [...NETWORK_DISTANCES],
    };
  }
  return {
    api: 'classic',
    category: 'people',
    keywords: keyword,
    advanced_keywords: { title: position },
    location: [locationId],
    network_distance: [...NETWORK_DISTANCES],
  };
}

/**
 * Teilregionen für Länder: LinkedIn zeigt je Suche nur die ersten Treffer (höchstens 1.000) und sortiert immer gleich –
 * dieselbe Suche je Bundesland liefert andere Personen (Wunsch des Nutzers 11.10.: „findet immer dieselben Kunden“).
 */
export const SUB_REGIONS: Record<string, readonly string[]> = {
  deutschland: [
    'Bayern',
    'Baden-Württemberg',
    'Nordrhein-Westfalen',
    'Hessen',
    'Niedersachsen',
    'Berlin',
    'Hamburg',
    'Sachsen',
    'Rheinland-Pfalz',
    'Schleswig-Holstein',
    'Brandenburg',
    'Thüringen',
    'Sachsen-Anhalt',
    'Mecklenburg-Vorpommern',
    'Bremen',
    'Saarland',
  ],
  österreich: ['Wien', 'Niederösterreich', 'Oberösterreich', 'Steiermark', 'Tirol', 'Salzburg', 'Kärnten', 'Vorarlberg', 'Burgenland'],
};
SUB_REGIONS.germany = SUB_REGIONS.deutschland;
SUB_REGIONS.austria = SUB_REGIONS.österreich;

/** Eine Suchanfrage der klassischen Suche – `key` bleibt über Läufe gleich (Suchgedächtnis). */
export interface ClassicQuery {
  key: string;
  label: string;
  keyword: string;
  position: string;
  field: 'keywords' | 'company';
  /** Region dieser Anfrage (Suchprofil oder Teilregion). */
  region: string;
}

/**
 * Alle Suchanfragen eines Suchprofils, die wichtigsten zuerst: ① Stichwort × Position (wie bisher, diagonal),
 * ② Stichwort im Firmennamen × Position, ③ Stichwort × Position je Teilregion (Bundesland). Welche drankommt,
 * entscheidet der Ertrag im Suchgedächtnis (`queryPriority`).
 */
export function classicQueries(profile: SearchProfile): ClassicQuery[] {
  const combos = searchCombinations(profile);
  const region = profile.region.trim();
  const make = (keyword: string, position: string, field: ClassicQuery['field'], where: string): ClassicQuery => ({
    key: ['classic', field, keyword, position, where].map((part) => part.trim().toLowerCase()).join('|'),
    label: `${field === 'company' ? `Firma „${keyword}“` : keyword} · ${position} · ${where}`,
    keyword,
    position,
    field,
    region: where,
  });
  const queries = combos.map(({ keyword, position }) => make(keyword, position, 'keywords', region));
  queries.push(...combos.map(({ keyword, position }) => make(keyword, position, 'company', region)));
  for (const part of SUB_REGIONS[region.toLowerCase()] ?? []) {
    queries.push(...combos.map(({ keyword, position }) => make(keyword, position, 'keywords', part)));
  }
  return queries;
}

/** Deutsche Ländernamen und ihre englischen LinkedIn-Namen – je nach Sprache des Accounts kommt der eine oder andere. */
const COUNTRY_NAMES: Record<string, string[]> = {
  deutschland: ['germany'],
  germany: ['deutschland'],
  österreich: ['austria'],
  austria: ['österreich'],
  schweiz: ['switzerland'],
  switzerland: ['schweiz'],
};

/**
 * Passenden Ort aus den Vorschlägen von LinkedIn wählen (GET /linkedin/search/parameters). Früher galt blind der erste
 * Vorschlag – bei „Deutschland“ ist das nicht zwingend das Land (Kunde 11.10.: Treffer aus Zürich). Reihenfolge:
 * gleicher Name (auch deutsch/englisch), dann ein Name, der mit der Eingabe beginnt, sonst der erste Vorschlag.
 */
export function pickLocation<T extends { id: string; title?: string | null }>(items: readonly T[], region: string): T | undefined {
  const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
  const wanted = norm(region);
  const names = new Set([wanted, ...(COUNTRY_NAMES[wanted] ?? [])]);
  return (
    items.find((item) => norm(item.title) === wanted) ??
    items.find((item) => names.has(norm(item.title))) ??
    items.find((item) => [...names].some((name) => norm(item.title).startsWith(name))) ??
    items[0]
  );
}

function distanceOf(value: string | undefined): NetworkDistance {
  switch (value) {
    case 'DISTANCE_1':
    case 'FIRST_DEGREE':
      return 1;
    case 'DISTANCE_2':
    case 'SECOND_DEGREE':
      return 2;
    case 'DISTANCE_3':
    case 'THIRD_DEGREE':
      return 3;
    default:
      return null;
  }
}

export function toSearchHit(item: UnipilePeopleResult): SearchHit {
  const nameParts = (item.name ?? '').trim().split(/\s+/);
  const firstName = item.first_name?.trim() || nameParts[0] || '';
  const lastName = item.last_name?.trim() || nameParts.slice(1).join(' ');
  return {
    providerId: item.id,
    publicIdentifier: item.public_identifier ?? null,
    firstName,
    lastName,
    headline: item.headline ?? '',
    location: item.location ?? null,
    networkDistance: distanceOf(item.network_distance),
    profileUrl: item.public_profile_url ?? item.profile_url ?? null,
    pendingInvitation: item.pending_invitation === true,
  };
}

/** Zwischenspeicher für die Account-Prüfung – die Oberfläche fragt regelmäßig nach. */
const ACCOUNT_STATUS_TTL_MS = 30_000;

const sourceOk = (account: UnipileAccount) =>
  (account.sources ?? []).every((source) => !source.status || source.status === 'OK');

const isLinkedin = (account: UnipileAccount) => (account.type ?? '').toUpperCase() === 'LINKEDIN';

/** Premium-Funktionen laut Unipile (`connection_params.im.premiumFeatures`) – undefined, wenn Unipile nichts meldet. */
const premiumFeatures = (account: UnipileAccount) => account.connection_params?.im?.premiumFeatures;

/**
 * Den LinkedIn-Account wählen: der aus UNIPILE_ACCOUNT_ID, sonst der erste startklare (bei Sales Navigator bevorzugt
 * einer mit Sales Navigator), sonst der erste.
 */
export function pickLinkedinAccount(
  items: UnipileAccount[],
  accountId: string | null,
  searchApi?: 'classic' | 'sales_navigator',
): UnipileAccount | undefined {
  const linkedin = items.filter(isLinkedin);
  const candidates = accountId ? linkedin.filter((account) => account.id === accountId) : linkedin;
  const ready = candidates.filter(sourceOk);
  if (!accountId && searchApi === 'sales_navigator') {
    const navigator = ready.find((account) => premiumFeatures(account)?.includes('sales_navigator'));
    if (navigator) return navigator;
  }
  return ready[0] ?? candidates[0];
}

/**
 * Hinweise zur Wahl des Such-Accounts: Mehrere LinkedIn-Accounts ohne UNIPILE_ACCOUNT_ID sind mehrdeutig; Sales
 * Navigator braucht einen Such-Account mit Sales Navigator (nur geprüft, wenn Unipile Premium-Funktionen meldet).
 */
/**
 * Text für „Verbindung testen“ (Einstellungen → LinkedIn): welcher Account sucht (UNIPILE_ACCOUNT_ID bzw. die
 * automatische Wahl), ob er laut Unipile Sales Navigator hat, und welche weiteren LinkedIn-Accounts verbunden sind –
 * jeweils mit ID zum Kopieren. Früher stand hier nur der erste Account, auch wenn über einen anderen gesucht wurde.
 */
export function unipileTestResult(
  items: UnipileAccount[],
  accountId: string | null,
  searchApi: 'classic' | 'sales_navigator',
): { ok: boolean; message: string } {
  const linkedin = items.filter(isLinkedin);
  if (linkedin.length === 0) return { ok: true, message: 'Verbunden, aber bei Unipile ist kein LinkedIn-Account eingerichtet.' };
  const picked = pickLinkedinAccount(items, accountId, searchApi);
  const name = (account: UnipileAccount) => account.name?.trim() || 'ohne Namen';
  const navigator = (account: UnipileAccount) => {
    const features = premiumFeatures(account);
    return features ? (features.includes('sales_navigator') ? 'mit Sales Navigator' : 'ohne Sales Navigator') : 'Sales Navigator unbekannt';
  };
  if (accountId && (!picked || picked.id !== accountId)) {
    const list = linkedin.map((account) => `${name(account)} (ID ${account.id})`).join(', ');
    return { ok: false, message: `Die LinkedIn-Account-ID „${accountId}“ ist bei Unipile nicht verbunden. Verbunden sind: ${list}.` };
  }
  if (!picked) return { ok: true, message: 'Verbunden, aber bei Unipile ist kein LinkedIn-Account eingerichtet.' };
  const others = linkedin.filter((account) => account.id !== picked.id);
  const parts = [
    `Verbunden. Gesucht wird über ${name(picked)} (ID ${picked.id}, ${navigator(picked)}, Suche: ${searchApi === 'sales_navigator' ? 'Sales Navigator' : 'LinkedIn normal'}).`,
  ];
  if (others.length) parts.push(`Weitere LinkedIn-Accounts: ${others.map((account) => `${name(account)} (ID ${account.id}, ${navigator(account)})`).join('; ')}.`);
  const warnings = accountWarnings(items, accountId, searchApi);
  if (warnings.length) parts.push(...warnings);
  return { ok: warnings.length === 0, message: parts.join(' ') };
}

export function accountWarnings(items: UnipileAccount[], accountId: string | null, searchApi: 'classic' | 'sales_navigator'): string[] {
  const warnings: string[] = [];
  const linkedin = items.filter(isLinkedin);
  const picked = pickLinkedinAccount(items, accountId, searchApi);
  const label = (account: UnipileAccount) => `„${account.name?.trim() || account.id}“`;
  if (!accountId && linkedin.length > 1 && picked) {
    warnings.push(
      `Bei Unipile sind ${linkedin.length} LinkedIn-Accounts verbunden, UNIPILE_ACCOUNT_ID ist aber leer – gesucht wird über ${label(picked)}. Trag den Such-Account${searchApi === 'sales_navigator' ? ' (den mit Sales Navigator)' : ''} in UNIPILE_ACCOUNT_ID ein, damit es eindeutig ist.`,
    );
  }
  const features = picked ? premiumFeatures(picked) : undefined;
  if (searchApi === 'sales_navigator' && picked && features && !features.includes('sales_navigator')) {
    warnings.push(
      `Die Suche ist auf Sales Navigator eingestellt, der Such-Account ${label(picked)} hat laut Unipile aber kein Sales Navigator. Trag den Account mit Sales Navigator in UNIPILE_ACCOUNT_ID ein oder stell die Suche auf „classic“.`,
    );
  }
  return warnings;
}

/** Kennungen klein geschrieben – Provider-IDs und öffentliche Kennungen werden so verglichen. */
const idKey = (value: string | null | undefined) => value?.trim().toLowerCase() || null;

/**
 * Eine Unipile-Liste seitenweise laden (höchstens `maxPages` Seiten) und die Kennungen sammeln.
 * `truncated`: Es gäbe weitere Seiten, die Obergrenze war erreicht.
 */
export async function collectIds<T>(
  load: (cursor: string | null | undefined) => Promise<{ items?: T[]; cursor?: string | null }>,
  pick: (item: T) => Array<string | null | undefined>,
  maxPages: number,
  pauseBetween: () => Promise<void>,
): Promise<{ ids: Set<string>; count: number; truncated: boolean }> {
  const ids = new Set<string>();
  let count = 0;
  let cursor: string | null | undefined;
  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await pauseBetween();
    const response = await load(cursor);
    for (const item of response.items ?? []) {
      count++;
      for (const value of pick(item)) {
        const key = idKey(value);
        if (key) ids.add(key);
      }
    }
    cursor = response.cursor;
    if (!cursor || !(response.items ?? []).length) return { ids, count, truncated: false };
  }
  return { ids, count, truncated: true };
}

/** Kurzer Grund, warum die Kontakte eines Gründer-Accounts nicht geprüft werden konnten. */
function networkErrorText(error: unknown): string {
  if (!(error instanceof AdapterError)) return 'unerwarteter Fehler';
  if (error.title === UNIPILE_SESSION_DOWN_TITLE) return 'keine aktive Unipile-Sitzung für diesen Account';
  switch (error.code) {
    case 'rate_limit':
      return 'LinkedIn-Limit dieses Accounts erreicht';
    case 'auth':
      return 'Zugang abgelehnt – Account bei Unipile getrennt?';
    case 'network':
      return 'Unipile nicht erreichbar';
    case 'config':
      return 'Unipile kennt den Account nicht oder lehnt die Anfrage ab';
    default:
      return 'Fehler bei Unipile';
  }
}

interface CachedIds {
  at: number;
  ids: Set<string>;
  count: number;
  truncated: boolean;
}

/** Account-Liste von Unipile → verständlicher Zustand für die Oberfläche. Statuswerte laut Unipile: OK, CONNECTING, CREDENTIALS, PERMISSIONS, STOPPED, ERROR. */
export function describeAccount(
  items: UnipileAccount[],
  accountId: string | null,
  searchApi?: 'classic' | 'sales_navigator',
): LinkedinAccountStatus {
  const account = pickLinkedinAccount(items, accountId, searchApi);
  if (!account) {
    return {
      state: 'missing',
      name: null,
      message: accountId
        ? `Der Account „${accountId}“ aus UNIPILE_ACCOUNT_ID ist bei Unipile nicht verbunden. Prüfe die ID oder lass UNIPILE_ACCOUNT_ID leer.`
        : 'Sobald er im Unipile-Dashboard verbunden ist, schaltet sich die Live-Suche hier von selbst frei – ohne Neustart.',
    };
  }
  const name = account.name?.trim() || null;
  const statuses = (account.sources ?? []).map((source) => source.status ?? 'OK');
  if (statuses.every((status) => status === 'OK')) return { state: 'ok', name, message: '' };
  if (statuses.includes('CONNECTING')) {
    return { state: 'connecting', name, message: 'Der LinkedIn-Account wird bei Unipile gerade verbunden – das dauert meist nur einen Moment.' };
  }
  if (statuses.includes('CREDENTIALS') || statuses.includes('PERMISSIONS')) {
    return {
      state: 'reconnect',
      name,
      message: 'Der LinkedIn-Account muss bei Unipile neu verbunden werden (Anmeldung abgelaufen oder Bestätigung nötig).',
    };
  }
  return {
    state: 'reconnect',
    name,
    message: `Der LinkedIn-Account meldet bei Unipile den Status ${statuses.join(', ')}. Prüfe ihn im Unipile-Dashboard.`,
  };
}

function currentPosition(profile: UnipileProfile) {
  const experience = profile.work_experience ?? [];
  return experience.find((entry) => entry.current) ?? experience.find((entry) => !entry.end) ?? experience[0];
}

/**
 * Live-Betrieb: Suche, Profile und Firmen über Unipile, Einschätzung über die Anthropic-API.
 * Schonend für den LinkedIn-Account: höchstens `MAX_RESULTS_LIMIT` Profilabrufe pro Lauf, zufällige Pausen von 3–8 Sekunden,
 * Profilbesuche ohne Benachrichtigung, bei Limit- oder Zugangsfehlern sofortiger Abbruch.
 */
export class LiveAdapter implements LeadSearchAdapter {
  readonly mode = 'live' as const;
  readonly canQualify: boolean;
  readonly canCheckAds: boolean;
  private accountId: string | null;
  private readonly locations = new Map<string, string>();
  private readonly profileFetches = new Map<string, number>();
  private readonly pause: PauseFn;
  private statusCache: { at: number; value: LinkedinAccountStatus } | null = null;
  private readonly now: () => number;
  /** Zwischenspeicher je Gründer-Account: Kontakte und gesendete, offene Anfragen. */
  private readonly networkCache = new Map<string, { relations?: CachedIds; invitations?: CachedIds }>();
  /** Hinweise aus der letzten Account-Liste bzw. dem letzten Lauf – für `/config` (`setupWarnings`). */
  private accountNotes: string[] = [];
  private networkNotes: string[] = [];

  constructor(
    private readonly unipile: UnipileClient,
    private readonly qualifier: Qualifier | null,
    private readonly options: LiveAdapterOptions,
    private readonly adsChecker: AdsChecker | null = null,
  ) {
    this.canQualify = qualifier !== null;
    this.canCheckAds = adsChecker !== null;
    this.accountId = options.accountId;
    this.pause = options.pause ?? defaultPause;
    this.now = options.now ?? Date.now;
  }

  setupWarnings(): string[] {
    return [...this.accountNotes, ...this.networkNotes];
  }

  private async call<T>(work: () => Promise<T>, what: 'search' | 'profile' | 'company' | 'setup'): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw toAdapterError(error, what);
    }
  }

  async accountStatus(signal: AbortSignal, { refresh = false }: { refresh?: boolean } = {}): Promise<LinkedinAccountStatus> {
    if (!refresh && this.statusCache && Date.now() - this.statusCache.at < ACCOUNT_STATUS_TTL_MS) return this.statusCache.value;
    let value: LinkedinAccountStatus;
    try {
      const { items } = await this.unipile.listAccounts(signal);
      value = describeAccount(items ?? [], this.options.accountId, this.options.searchApi);
      this.accountNotes = accountWarnings(items ?? [], this.options.accountId, this.options.searchApi);
    } catch (error) {
      const failure = toAdapterError(error, 'setup');
      const message = isUnipileSessionDown(error)
        ? UNIPILE_SESSION_DOWN_TEXT
        : failure instanceof AdapterError && failure.code === 'auth'
          ? 'Unipile lehnt den API-Key ab. Prüfe das Token unter Einstellungen → LinkedIn (Unipile).'
          : failure instanceof AdapterError
            ? failure.message
            : 'Unipile ist gerade nicht erreichbar.';
      value = { state: 'unreachable', name: null, message };
    }
    this.statusCache = { at: Date.now(), value };
    return value;
  }

  private async account(ctx: RunContext): Promise<string> {
    if (this.accountId) return this.accountId;
    const { items } = await this.call(() => this.unipile.listAccounts(ctx.signal), 'setup');
    const usable = pickLinkedinAccount(items ?? [], null, this.options.searchApi);
    if (!usable) {
      throw new AdapterError(
        'config',
        'Kein LinkedIn-Account verbunden',
        'Bei Unipile ist noch kein LinkedIn-Account verbunden. Verbinde ihn im Unipile-Dashboard – danach funktioniert die Suche ohne Neustart.',
        true,
      );
    }
    this.accountId = usable.id;
    return usable.id;
  }

  private async location(region: string, ctx: RunContext): Promise<string> {
    if (this.options.locationId) return this.options.locationId;
    const key = `${this.options.searchApi}:${region.toLowerCase()}`;
    const cached = this.locations.get(key);
    if (cached) return cached;
    const accountId = await this.account(ctx);
    const type = this.options.searchApi === 'sales_navigator' ? 'REGION' : 'LOCATION';
    const { items } = await this.call(
      () => this.unipile.searchParameters({ accountId, type, keywords: region, limit: 5 }, ctx.signal),
      'setup',
    );
    const match = pickLocation(items ?? [], region);
    if (!match) {
      throw new AdapterError(
        'config',
        'Region nicht gefunden',
        `LinkedIn kennt die Region „${region}“ nicht. Schreib sie anders (z. B. „Germany“) oder setze UNIPILE_LOCATION_ID.`,
        true,
      );
    }
    this.locations.set(key, match.id);
    return match.id;
  }

  async search(profile: SearchProfile, options: SearchOptions, ctx: RunContext): Promise<SearchHit[]> {
    const accountId = await this.account(ctx);
    const locationId = await this.location(profile.region, ctx);
    if (this.options.searchApi === 'classic') return this.searchClassic(profile, options, ctx, accountId, locationId);
    const body = buildSearchBody(this.options.searchApi, profile, locationId);
    const pageSize = PAGE_SIZE[this.options.searchApi];
    const hits: SearchHit[] = [];
    const isFresh = (hit: SearchHit) => !options.skip?.has(hit.providerId);
    let fresh = 0;
    let cursor: string | null | undefined;

    // Schon geprüfte Profile (`skip`) zählen nicht – dafür weiterblättern, höchstens `maxSearchRequests` Seiten.
    const maxPages = maxSearchRequests(options.maxHits, pageSize);
    for (let page = 0; page < maxPages && fresh < options.maxHits; page++) {
      if (page > 0) await this.pause(SEARCH_PAGE_PAUSE_MS, ctx.signal);
      // Mit `skip` volle Seiten holen: sonst kommen nach schon geprüften Profilen nur Mini-Seiten (viele Anfragen).
      const limit = options.skip?.size ? pageSize : Math.min(pageSize, options.maxHits - fresh);
      const response = await this.call(() => this.unipile.search({ accountId, body, limit, cursor }, ctx.signal), 'search');
      const batch: SearchHit[] = [];
      for (const hit of (response.items ?? []).filter((item) => item.type === 'PEOPLE' && item.id).map(toSearchHit)) {
        if (fresh >= options.maxHits && isFresh(hit)) continue;
        batch.push(hit);
        if (isFresh(hit)) fresh++;
      }
      hits.push(...batch);
      options.onHits(batch);
      cursor = response.cursor;
      if (!cursor || batch.length === 0) break;
    }
    return hits;
  }

  /**
   * Klassisch: einfache Suchen je Suchanfrage (`classicQueries`), Treffer zusammengeführt (ohne Doppelte). Seite für
   * Seite kommt die Anfrage dran, deren nächste Seite laut Suchgedächtnis am meisten verspricht (`queryPriority`) –
   * unbekannte vor ausgelaugten, ergiebige vor allen. Jede Anfrage blättert dort weiter, wo der letzte Lauf aufgehört hat
   * (gespeicherter Cursor), statt wieder ab Seite 1 dieselben Personen zu liefern. Schluss, wenn `maxHits` neue
   * Treffer da sind, alle Anfragen ausgeschöpft sind oder die Obergrenze an Suchanfragen erreicht ist. Schon geprüfte
   * Profile (`skip`) zählen nicht zu `maxHits`.
   */
  private async searchClassic(
    profile: SearchProfile,
    options: SearchOptions,
    ctx: RunContext,
    accountId: string,
    locationId: string,
  ): Promise<SearchHit[]> {
    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    const isFresh = (hit: SearchHit) => !options.skip?.has(hit.providerId);
    const maxRequests = maxSearchRequests(options.maxHits, PAGE_SIZE.classic);
    const memory = options.memory;
    const now = this.now();
    const queries = classicQueries(profile)
      .map((query, index) => {
        const state = memory?.query(query.key, now) ?? null;
        return {
          ...query,
          index,
          cursor: state?.cursor ?? null,
          // Cursor aus einem früheren Lauf: Ist er abgelaufen, fängt die Anfrage einmal vorne an.
          resumed: Boolean(state?.cursor),
          pages: state?.pages ?? 0,
          stats: { hits: state?.hits ?? 0, fresh: state?.fresh ?? 0, likely: state?.likely ?? 0, qualified: state?.qualified ?? 0 },
          done: state?.exhaustedAt != null || (state?.pages ?? 0) >= MAX_CLASSIC_PAGES,
        };
      });
    const regionName = profile.region.trim().toLowerCase();
    let fresh = 0;
    let requests = 0;
    // Seiten am Stück ohne einen einzigen neuen Treffer: Beim ersten Mal sind die noch unbekannten Anfragen offenbar
    // gesättigt (liefern nur Bekannte) → für diesen Lauf aus, weiter mit den ergiebigen; beim zweiten Mal ist Schluss.
    let barren = 0;
    let saturated = false;
    const full = () => fresh >= options.maxHits || requests >= maxRequests;
    while (!full()) {
      if (barren >= MAX_BARREN_PAGES) {
        if (saturated) break;
        saturated = true;
        barren = 0;
        for (const query of queries) if (query.stats.hits === 0) query.done = true;
      }
      let best: (typeof queries)[number] | null = null;
      let bestPriority = -1;
      for (const query of queries) {
        if (query.done) continue;
        const priority = queryPriority(query.stats);
        if (priority > bestPriority) {
          best = query;
          bestPriority = priority;
        }
      }
      if (!best) break;
      const query = best;
      let where = locationId;
      if (query.region.toLowerCase() !== regionName) {
        // Teilregion erst bei Bedarf nachschlagen (eine Abfrage je Region, zwischengespeichert). Unbekannt → überspringen.
        const id = await this.subLocation(query.region, ctx);
        if (!id || id === locationId) {
          for (const other of queries) if (other.region === query.region) other.done = true;
          continue;
        }
        where = id;
      }
      if (requests > 0) await this.pause(SEARCH_PAGE_PAUSE_MS, ctx.signal);
      const body = buildClassicSearchBody(query.keyword, query.position, where, query.field);
      let response: UnipileSearchResponse;
      try {
        const cursor = query.cursor;
        response = await this.call(
          () => this.unipile.search({ accountId, body, limit: PAGE_SIZE.classic, ...(cursor ? { cursor } : {}) }, ctx.signal),
          'search',
        );
      } catch (error) {
        // Gespeicherter Cursor abgelaufen/ungültig → diese Anfrage vorne anfangen, nicht den Lauf abbrechen.
        if (query.resumed && error instanceof AdapterError && error.code === 'config') {
          requests++;
          query.resumed = false;
          query.cursor = null;
          query.pages = 0;
          memory?.restart(query.key, now);
          continue;
        }
        throw error;
      }
      requests++;
      query.resumed = false;
      query.pages++;
      const items = (response.items ?? []).filter((item) => item.type === 'PEOPLE' && item.id);
      const batch: SearchHit[] = [];
      let pageFresh = 0;
      for (const hit of items.map(toSearchHit)) {
        if (isFresh(hit) && !seen.has(hit.providerId)) pageFresh++;
        if (seen.has(hit.providerId)) continue;
        if (fresh >= options.maxHits && isFresh(hit)) continue;
        seen.add(hit.providerId);
        batch.push(hit);
        if (isFresh(hit)) fresh++;
      }
      hits.push(...batch);
      if (batch.length) options.onHits(batch, query.key);
      barren = pageFresh > 0 ? 0 : barren + 1;
      query.cursor = response.cursor ?? null;
      query.stats.hits += items.length;
      query.stats.fresh += pageFresh;
      const exhausted = !response.cursor || items.length === 0 || query.pages >= MAX_CLASSIC_PAGES;
      if (exhausted) query.done = true;
      memory?.savePage(query.key, query.label, { cursor: query.cursor, hits: items.length, fresh: pageFresh, exhausted }, now);
    }
    return hits;
  }

  /** Teilregion (Bundesland) → LinkedIn-Orts-ID; null, wenn LinkedIn sie nicht kennt (kein Abbruch). */
  private async subLocation(region: string, ctx: RunContext): Promise<string | null> {
    const key = `${this.options.searchApi}:${region.toLowerCase()}`;
    if (this.locations.has(key)) return this.locations.get(key) || null;
    const accountId = await this.account(ctx);
    const type = this.options.searchApi === 'sales_navigator' ? 'REGION' : 'LOCATION';
    const { items } = await this.call(() => this.unipile.searchParameters({ accountId, type, keywords: region, limit: 5 }, ctx.signal), 'setup');
    // Nur ein echter Treffer zählt (kein „erster Vorschlag“) – sonst sucht die Teilregion wieder im ganzen Land.
    const wanted = region.trim().toLowerCase();
    const match = (items ?? []).find((item) => (item.title ?? '').trim().toLowerCase().startsWith(wanted));
    const id = match && match.id !== this.options.locationId ? match.id : '';
    this.locations.set(key, id);
    return id || null;
  }

  async pendingInvitations(ctx: RunContext): Promise<Set<string>> {
    const accountId = await this.account(ctx);
    const pending = new Set<string>();
    let cursor: string | null | undefined;
    try {
      for (let page = 0; page < MAX_INVITATION_PAGES; page++) {
        const response = await this.call(() => this.unipile.invitationsSent({ accountId, limit: 100, cursor }, ctx.signal), 'setup');
        for (const invitation of response.items ?? []) {
          if (invitation.invited_user_id) pending.add(invitation.invited_user_id);
          if (invitation.invited_user_public_id) pending.add(invitation.invited_user_public_id);
        }
        cursor = response.cursor;
        if (!cursor) break;
      }
    } catch (error) {
      // Limit/Zugang → Abbruch. Alles andere ist verschmerzbar: Suche und Profil melden offene Anfragen ebenfalls.
      if (error instanceof AdapterError && (error.code === 'rate_limit' || error.code === 'auth')) throw error;
      if (error instanceof CancelledError) throw error;
    }
    return pending;
  }

  /**
   * Kontakte und offene Anfragen der übrigen Gründer-Accounts. Ein Account, der sich nicht prüfen lässt (getrennt,
   * keine Sitzung, Limit), bekommt `error` – der Runner stellt neue Leads dann zurück, statt sie als neu zu zählen.
   */
  async founderNetworks(ctx: RunContext): Promise<NetworkCheck> {
    const searchAccount = await this.account(ctx);
    const warnings: string[] = [];
    // Account-Liste (nur Unipile, keine LinkedIn-Aktion): Hinweise zum Such-Account und Zustand der Gründer-Accounts.
    let items: UnipileAccount[] | null = null;
    try {
      items = (await this.unipile.listAccounts(ctx.signal)).items ?? [];
      this.accountNotes = accountWarnings(items, this.options.accountId, this.options.searchApi);
      warnings.push(...this.accountNotes);
    } catch (error) {
      if (error instanceof CancelledError) throw error;
    }

    const networks: FounderNetwork[] = [];
    const seen = new Set([searchAccount]);
    for (const founder of AUTH_FOUNDER_IDS) {
      const accountId = this.options.founderAccounts?.[founder];
      if (!accountId || seen.has(accountId)) continue;
      seen.add(accountId);
      const listed = items?.find((account) => account.id === accountId);
      let error: string | null = null;
      if (items && !listed) error = 'Account bei Unipile nicht verbunden';
      else if (listed && !sourceOk(listed)) {
        error = `Account-Status bei Unipile: ${(listed.sources ?? []).map((source) => source.status).filter(Boolean).join(', ')}`;
      }
      if (!error) {
        try {
          const { relations, invitations } = await this.loadNetwork(accountId, ctx);
          if (relations.truncated) {
            warnings.push(
              `Von ${defaultFounderName(founder)} wurden nur die neuesten ${relations.count} Kontakte geprüft (Obergrenze ${MAX_RELATION_PAGES * RELATION_PAGE_SIZE}) – ältere Kontakte erkennt der Dubletten-Filter nicht.`,
            );
          }
          networks.push({ founder, connected: relations.ids, invited: invitations.ids, error: null });
          continue;
        } catch (failure) {
          if (failure instanceof CancelledError) throw failure;
          error = networkErrorText(failure);
        }
      }
      networks.push({ founder, connected: new Set(), invited: new Set(), error });
    }
    this.networkNotes = networks
      .filter((network) => network.error)
      .map(
        (network) =>
          `Die Kontakte von ${defaultFounderName(network.founder)} konnten beim letzten Lauf nicht geprüft werden (${network.error}). Neue Leads werden zurückgestellt, bis das wieder klappt – prüf den Account im Unipile-Dashboard.`,
      );
    return { networks, warnings };
  }

  /** Kontakte und gesendete Anfragen eines Accounts – aus dem Zwischenspeicher oder frisch (mit Pausen). */
  private async loadNetwork(accountId: string, ctx: RunContext): Promise<{ relations: CachedIds; invitations: CachedIds }> {
    const entry = this.networkCache.get(accountId) ?? {};
    this.networkCache.set(accountId, entry);
    const pauseBetween = () => this.pause(LIST_PAGE_PAUSE_MS, ctx.signal);
    let requested = false;
    if (!entry.relations || this.now() - entry.relations.at >= RELATIONS_TTL_MS) {
      const result = await collectIds(
        (cursor) => this.call(() => this.unipile.listRelations({ accountId, limit: RELATION_PAGE_SIZE, cursor }, ctx.signal), 'setup'),
        (relation) => [relation.member_id, relation.public_identifier],
        MAX_RELATION_PAGES,
        pauseBetween,
      );
      entry.relations = { at: this.now(), ...result };
      requested = true;
    }
    if (!entry.invitations || this.now() - entry.invitations.at >= SENT_INVITATIONS_TTL_MS) {
      if (requested) await pauseBetween();
      const result = await collectIds(
        (cursor) => this.call(() => this.unipile.invitationsSent({ accountId, limit: 100, cursor }, ctx.signal), 'setup'),
        (invitation) => [invitation.invited_user_id, invitation.invited_user_public_id],
        MAX_INVITATION_PAGES,
        pauseBetween,
      );
      entry.invitations = { at: this.now(), ...result };
    }
    return { relations: entry.relations, invitations: entry.invitations };
  }

  async dedupeDelay(): Promise<void> {}

  async pauseBeforeProfile(ctx: RunContext): Promise<void> {
    await this.pause(PROFILE_PAUSE_MS, ctx.signal);
  }

  async enrich(hit: SearchHit, ctx: RunContext): Promise<EnrichResult> {
    // Zweite Sicherung neben dem Runner: nie mehr als `MAX_RESULTS_LIMIT` Profile pro Lauf.
    const count = (this.profileFetches.get(ctx.runId) ?? 0) + 1;
    if (count > MAX_RESULTS_LIMIT) {
      throw new AdapterError('config', 'Limit erreicht', `Mehr als ${MAX_RESULTS_LIMIT} Profilabrufe pro Lauf sind nicht erlaubt.`, true);
    }
    this.profileFetches.set(ctx.runId, count);

    const accountId = await this.account(ctx);
    const profile = await this.call(() => this.unipile.getProfile({ accountId, identifier: hit.providerId }, ctx.signal), 'profile');
    const current = currentPosition(profile);

    let companyDescription: string | null = null;
    let companyWebsite: string | null = profile.websites?.[0] ?? null;
    let companyIndustry: string | null = null;
    let companyName = current?.company ?? null;
    if (this.options.fetchCompany && current?.company_id) {
      await this.pause(COMPANY_PAUSE_MS, ctx.signal);
      try {
        const company = await this.call(
          () => this.unipile.getCompany({ accountId, identifier: current.company_id! }, ctx.signal),
          'company',
        );
        companyDescription = company.description?.trim() || null;
        companyWebsite = company.website?.trim() || companyWebsite;
        companyIndustry = company.industry?.[0] ?? null;
        companyName = company.name?.trim() || companyName;
      } catch (error) {
        // Firmenprofil ist optional – nur Limit/Zugang/Abbruch brechen ab.
        if (error instanceof CancelledError || (error instanceof AdapterError && error.fatal)) throw error;
      }
    }

    return {
      providerId: profile.provider_id ?? null,
      publicIdentifier: profile.public_identifier ?? null,
      profile: {
        headline: profile.headline ?? hit.headline,
        position: current?.position ?? null,
        companyName,
        companyDescription,
        companyWebsite,
        companyIndustry,
        location: profile.location ?? hit.location,
      },
      pendingInvitation: profile.invitation?.type === 'SENT' && profile.invitation.status === 'PENDING',
      networkDistance: distanceOf(profile.network_distance),
    };
  }

  /** KI-Vorprüfung – nur Anthropic, kein LinkedIn-Aufruf. */
  prescreen(hits: SearchHit[], ctx: RunContext): Promise<Map<string, PrescreenVerdict>> {
    if (!this.qualifier?.prescreen) return Promise.resolve(new Map());
    return this.qualifier.prescreen(hits, ctx.profile.region, ctx.signal, ctx.runId, ctx.examples);
  }

  qualify(hit: SearchHit, profile: EnrichedProfile, ctx: RunContext): Promise<unknown> {
    if (!this.qualifier) {
      return Promise.reject(new AdapterError('config', 'Keine KI-Bewertung', 'ANTHROPIC_API_KEY fehlt', false));
    }
    return this.qualifier.qualify(hit, profile, ctx.signal, ctx.runId, ctx.examples);
  }

  /** Meta-Werbebibliothek – kein LinkedIn-Aufruf, daher ohne Pause. */
  checkMetaAds(_hit: SearchHit, profile: EnrichedProfile, ctx: RunContext): Promise<MetaAdsCheck> {
    if (!this.adsChecker) {
      return Promise.reject(new AdapterError('config', 'Kein Meta-Ads-Check', 'META_ACCESS_TOKEN fehlt – Meta-Ads nicht geprüft', false));
    }
    return this.adsChecker.check(profile, ctx.signal);
  }
}

/** Unipile-Fehler in verständliche Meldungen übersetzen. Limit- und Zugangsfehler brechen den Lauf ab. */
export function toAdapterError(error: unknown, what: 'search' | 'profile' | 'company' | 'setup'): Error {
  if (error instanceof AdapterError || error instanceof CancelledError) return error;
  if (error instanceof UnipileNetworkError) {
    return new AdapterError(
      'network',
      'Unipile nicht erreichbar',
      `Keine Verbindung zu Unipile (${error.message}). Prüfe UNIPILE_DSN und die Internetverbindung des Servers.`,
      true,
    );
  }
  if (!(error instanceof UnipileHttpError)) {
    return new AdapterError('unknown', 'Unerwarteter Fehler', error instanceof Error ? error.message : String(error), true);
  }
  const detail = error.detail ? ` (${error.detail})` : '';
  const type = (error.type ?? '').toLowerCase();
  const looksLikeLimit = /too_many|limit|throttl|quota/.test(type);

  if (error.status === 429 || looksLikeLimit) {
    return new AdapterError(
      'rate_limit',
      'LinkedIn-Limit erreicht',
      'LinkedIn bzw. Unipile meldet zu viele Anfragen. Der Lauf wurde abgebrochen, um den Account zu schützen – versuch es später erneut, am besten morgen.',
      true,
    );
  }
  if (error.status === 401) {
    return new AdapterError(
      'auth',
      'Unipile-Zugang abgelehnt',
      `Der API-Key ist ungültig oder der LinkedIn-Account ist bei Unipile getrennt. Prüfe UNIPILE_API_KEY und den Account-Status im Unipile-Dashboard.${detail}`,
      true,
    );
  }
  if (error.status === 403) {
    return new AdapterError(
      'auth',
      'Keine Berechtigung',
      `Unipile verweigert die Aktion – z. B. ist Sales Navigator für diesen Account nicht freigeschaltet.${detail}`,
      true,
    );
  }
  // Keine laufende Unipile-Sitzung (Testzeitraum/Abo abgelaufen, Account getrennt) – kein LinkedIn-Limit.
  if (isUnipileSessionDown(error)) {
    return new AdapterError('auth', UNIPILE_SESSION_DOWN_TITLE, UNIPILE_SESSION_DOWN_TEXT, true);
  }
  if (error.status === 404 && (what === 'profile' || what === 'company')) {
    return new AdapterError('provider', 'Nicht gefunden', what === 'profile' ? 'Profil nicht abrufbar' : 'Firma nicht gefunden', false);
  }
  if (error.status === 404) {
    return new AdapterError('config', 'Nicht gefunden', `Unipile kennt den Account oder Endpunkt nicht – prüfe UNIPILE_ACCOUNT_ID und UNIPILE_DSN.${detail}`, true);
  }
  if (error.status === 400 || error.status === 422) {
    return new AdapterError('config', 'Ungültige Anfrage', `Unipile lehnt die Anfrage ab.${detail}`, true);
  }
  // 5xx: zuerst ein Unipile-Problem; laut Unipile kann dahinter auch ein LinkedIn-Limit stecken → vorsichtshalber abbrechen.
  return new AdapterError(
    'provider',
    'Unipile meldet einen Fehler',
    `Unipile antwortet mit einem Serverfehler (Status ${error.status}). Der Lauf wurde vorsichtshalber abgebrochen – meist ist es eine Störung bei Unipile, selten ein verstecktes LinkedIn-Limit. Prüf das Unipile-Dashboard und versuch es später erneut.${detail}`,
    true,
  );
}

export function createLiveAdapter(
  config: Config,
  overrides: { fetch?: typeof fetch; pause?: PauseFn; anthropicBaseURL?: string; metaBaseURL?: string; now?: () => Date } = {},
) {
  const unipile = new UnipileClient({ dsn: config.unipile.dsn ?? '', apiKey: config.unipile.apiKey ?? '', fetch: overrides.fetch });
  // Ohne Anthropic-Schlüssel läuft die Suche trotzdem – die Leads bleiben dann „nicht bewertet“.
  const qualifier = config.anthropic.apiKey
    ? new AnthropicQualifier({ apiKey: config.anthropic.apiKey, model: config.anthropic.model, baseURL: overrides.anthropicBaseURL })
    : null;
  // Ohne Meta-Token bleiben qualifizierte Leads „Meta-Ads nicht geprüft“.
  const adsChecker = config.meta.accessToken
    ? new MetaAdsChecker(
        new MetaAdLibraryClient({
          accessToken: config.meta.accessToken,
          version: config.meta.graphVersion,
          baseUrl: overrides.metaBaseURL,
          fetch: overrides.fetch,
        }),
        overrides.now,
      )
    : null;
  return new LiveAdapter(
    unipile,
    qualifier,
    {
      accountId: config.unipile.accountId,
      searchApi: config.unipile.searchApi,
      locationId: config.unipile.locationId,
      fetchCompany: config.unipile.fetchCompany,
      founderAccounts: config.linkedin.accounts,
      pause: overrides.pause,
      now: overrides.now ? () => overrides.now!().getTime() : undefined,
    },
    adsChecker,
  );
}
