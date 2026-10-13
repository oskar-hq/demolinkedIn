import { SETTINGS, type SettingGroup, type SettingKey } from '../../../shared/settings';

/**
 * Einstellungen als Untermenüs wie in einer App (Wunsch des Nutzers 11.10., Vorbild Trade Republic): Einstellungen →
 * Kategorie → Bereich → Unterseite mit nur wenigen Werten. Jede Ebene zeigt eine kurze Liste „Name · aktueller Wert ›“,
 * erst die letzte Ebene hat Eingaben. Werte-Bereiche heißen wie ihre `SettingGroup`, dazu die eigenen Seiten
 * „Auf einen Blick“, Automatische Suche, Vorlagen und Verlauf.
 */
export type SettingsSection = 'overview' | SettingGroup | 'auto' | 'templates' | 'history';

export type CategoryId = 'connections' | 'outreach' | 'system';

export interface NavItem {
  id: SettingsSection;
  label: string;
  /** Ein paar Wörter unter dem Namen in der Liste – was man dort findet. */
  lead: string;
}

export interface NavGroup {
  id: CategoryId;
  title: string;
  /** Was in der Kategorie steckt – Zeile unter dem Namen auf der ersten Ebene. */
  summary: string;
  items: NavItem[];
}

export const OVERVIEW_ITEM: NavItem = { id: 'overview', label: 'Auf einen Blick', lead: 'Was fehlt, Schlüssel und Grenzen' };

export const SETTINGS_NAV: readonly NavGroup[] = [
  {
    id: 'connections',
    title: 'Verbindungen',
    summary: 'LinkedIn, KI, Meta, Firmendaten, Close und Slack',
    items: [
      { id: 'unipile', label: 'LinkedIn (Unipile)', lead: 'Suche und Profile' },
      { id: 'anthropic', label: 'KI-Bewertung', lead: 'Einstufung der Leads' },
      { id: 'meta', label: 'Meta-Werbebibliothek', lead: 'Läuft gerade Werbung?' },
      { id: 'clay', label: 'Firmendaten', lead: 'Treg oder Clay' },
      { id: 'crm', label: 'Close und Slack', lead: 'Übergabe und Ping bei Antworten' },
    ],
  },
  {
    id: 'outreach',
    title: 'Outreach',
    summary: 'Lead-Suche, automatische Suche, Senden, Tagesstapel, Vorlagen',
    items: [
      { id: 'leadSearch', label: 'Lead-Suche', lead: 'Voreinstellungen je Lauf' },
      { id: 'auto', label: 'Automatische Suche', lead: 'Sucht nach Plan selbst' },
      { id: 'linkedin', label: 'Senden über LinkedIn', lead: 'Accounts, Grenzen, Arbeitszeit' },
      { id: 'tasks', label: 'Tagesstapel', lead: 'Leads pro Tag, Follow-ups' },
      { id: 'templates', label: 'Vorlagen', lead: 'Anfragen und Nachrichten' },
    ],
  },
  {
    id: 'system',
    title: 'System',
    summary: 'Sicherungen, Updates, Server, Verlauf',
    items: [
      { id: 'backup', label: 'Sicherungen und Updates', lead: 'Jede Nacht gesichert' },
      { id: 'server', label: 'Server und Anmeldung', lead: 'Adresse und Anmeldung' },
      { id: 'history', label: 'Verlauf', lead: 'Wer hat was geändert' },
    ],
  },
];

export const NAV_ITEMS: readonly NavItem[] = [OVERVIEW_ITEM, ...SETTINGS_NAV.flatMap((group) => group.items)];

export const SETTINGS_SECTIONS: readonly SettingsSection[] = NAV_ITEMS.map((item) => item.id);

export function navItem(section: SettingsSection): NavItem {
  return NAV_ITEMS.find((item) => item.id === section)!;
}

/** Kategorie eines Bereichs – `null` für „Auf einen Blick“ (liegt direkt auf der ersten Ebene). */
export function categoryOf(section: SettingsSection): NavGroup | null {
  return SETTINGS_NAV.find((group) => group.items.some((item) => item.id === section)) ?? null;
}

export function category(id: CategoryId): NavGroup {
  return SETTINGS_NAV.find((group) => group.id === id)!;
}

/** Bereiche, deren Werte aus `shared/settings.ts` kommen (die Seite „Werte“ von früher). */
export function isValueSection(section: SettingsSection): section is 'overview' | SettingGroup | 'history' {
  return section !== 'auto' && section !== 'templates';
}

// ── Unterseiten der Werte-Bereiche ──

/** Eigene Inhalte einer Unterseite neben den Werten. */
export type PageExtra = 'searchAccount' | 'linkedinAccounts' | 'unsentInvites';

export interface SettingsSubpage {
  /** Eindeutig über alle Bereiche: `<group>.<name>`. */
  id: string;
  group: SettingGroup;
  label: string;
  keys: readonly SettingKey[];
  extra?: PageExtra;
  /** Grauer Text unter dem Namen mit Platzhaltern `{KEY}` – sonst die Werte nacheinander. */
  summary?: string;
}

/**
 * Welche Werte zusammen auf einer Unterseite stehen – höchstens vier, was zusammengehört (Zugang = Adresse + Token).
 * Werte, die hier (noch) fehlen, landen automatisch auf „Weitere“ ihres Bereichs.
 */
const PAGE_PLAN: Record<SettingGroup, readonly (Omit<SettingsSubpage, 'group' | 'id'> & { name: string })[]> = {
  leadSearch: [
    { name: 'profiles', label: 'Profile pro Lauf', keys: ['MAX_RESULTS'] },
    { name: 'hits', label: 'Suchtreffer pro Lauf', keys: ['SEARCH_HITS_PER_RUN'] },
    { name: 'confidence', label: 'Mindestsicherheit der KI', keys: ['QUALIFY_MIN_CONFIDENCE'] },
    { name: 'autoQualify', label: 'Ohne KI qualifizieren', keys: ['AUTO_QUALIFY_TERMS'] },
    { name: 'autoPerDay', label: 'Profile pro Tag (automatisch)', keys: ['AUTO_SEARCH_PROFILES_PER_DAY'] },
    { name: 'distribution', label: 'Neue Leads verteilen', keys: ['LEAD_DISTRIBUTION'] },
  ],
  unipile: [
    { name: 'access', label: 'Zugang', keys: ['UNIPILE_DSN', 'UNIPILE_API_KEY'] },
    { name: 'searchAccount', label: 'Such-Account', keys: ['UNIPILE_ACCOUNT_ID'], extra: 'searchAccount' },
    { name: 'search', label: 'Suche', keys: ['UNIPILE_SEARCH_API', 'UNIPILE_LOCATION_ID', 'UNIPILE_FETCH_COMPANY'] },
  ],
  linkedin: [
    { name: 'actions', label: 'Echt senden', keys: ['LINKEDIN_ACTIONS'] },
    { name: 'accounts', label: 'LinkedIn-Accounts', keys: ['UNIPILE_ACCOUNT_NICK', 'UNIPILE_ACCOUNT_JOHANNES'], extra: 'linkedinAccounts' },
    { name: 'unsent', label: 'Nicht gesendete Anfragen', keys: [], extra: 'unsentInvites' },
    {
      name: 'limits',
      label: 'Grenzen',
      keys: ['LINKEDIN_INVITES_PER_DAY', 'LINKEDIN_INVITES_PER_WEEK', 'LINKEDIN_MESSAGES_PER_DAY'],
      summary: '{LINKEDIN_INVITES_PER_DAY} Anfragen am Tag · {LINKEDIN_INVITES_PER_WEEK} in 7 Tagen · {LINKEDIN_MESSAGES_PER_DAY} Nachrichten',
    },
    // Wunsch des Nutzers 12.10.: eigener Account voll → über den des anderen Gründers weiter.
    { name: 'fallback', label: 'Zweiter Account, wenn deiner voll ist', keys: ['LINKEDIN_ACCOUNT_FALLBACK'] },
    {
      name: 'workTime',
      label: 'Arbeitszeit',
      keys: ['LINKEDIN_WORK_HOURS', 'LINKEDIN_WORK_DAYS', 'LINKEDIN_TIMEZONE', 'LINKEDIN_PAUSE_SECONDS'],
      summary: '{LINKEDIN_WORK_HOURS} Uhr · Tage {LINKEDIN_WORK_DAYS} · {LINKEDIN_TIMEZONE}',
    },
    { name: 'sync', label: 'Antworten abholen', keys: ['LINKEDIN_SYNC_MINUTES'], summary: 'Alle {LINKEDIN_SYNC_MINUTES} Minuten' },
  ],
  anthropic: [
    { name: 'key', label: 'API-Schlüssel', keys: ['ANTHROPIC_API_KEY'] },
    { name: 'model', label: 'Modell', keys: ['ANTHROPIC_MODEL'] },
  ],
  meta: [
    { name: 'token', label: 'Access Token', keys: ['META_ACCESS_TOKEN'] },
    { name: 'version', label: 'Graph-API-Version', keys: ['META_GRAPH_VERSION'] },
  ],
  clay: [
    { name: 'provider', label: 'Quelle', keys: ['ENRICHMENT_PROVIDER'] },
    { name: 'treg', label: 'Treg', keys: ['TREG_TOKEN', 'TREG_MAX_COST_USD'] },
    { name: 'clay', label: 'Clay', keys: ['CLAY_WEBHOOK_URL', 'CLAY_WEBHOOK_TOKEN', 'CLAY_CALLBACK_SECRET'] },
    { name: 'auto', label: 'Automatisch anreichern', keys: ['ENRICH_AUTO', 'ENRICH_MAX_PER_DAY'] },
  ],
  crm: [
    { name: 'close', label: 'Close', keys: ['CLOSE_API_KEY', 'CLOSE_STATUS_ID'] },
    { name: 'slack', label: 'Slack', keys: ['SLACK_WEBHOOK_URL'] },
  ],
  tasks: [
    { name: 'newLeads', label: 'Neue Leads pro Tag', keys: ['NEW_LEADS_PER_DAY'] },
    { name: 'followUps', label: 'Follow-ups', keys: ['FOLLOWUP_AFTER_DAYS', 'MAX_FOLLOW_UPS'], summary: 'Nach {FOLLOWUP_AFTER_DAYS} Tagen · höchstens {MAX_FOLLOW_UPS}' },
    { name: 'inviteNote', label: 'Notiz zur Vernetzungsanfrage', keys: ['INVITE_NOTE'] },
    { name: 'stale', label: 'Anfrage hängt nach', keys: ['INVITE_STALE_DAYS'], summary: '{INVITE_STALE_DAYS} Tagen' },
    { name: 'lost', label: '„Verloren“ löschen', keys: ['LOST_DELETE_DAYS'], summary: 'Nach {LOST_DELETE_DAYS} Tagen' },
  ],
  backup: [
    { name: 'plan', label: 'Sicherung', keys: ['BACKUP_HOUR_UTC', 'BACKUP_KEEP', 'BACKUP_MAX_AGE_DAYS'] },
    { name: 'updates', label: 'Updates', keys: ['UPDATE_AUTO', 'UPDATE_HOUR'] },
  ],
  server: [
    { name: 'url', label: 'Öffentliche Adresse', keys: ['PUBLIC_URL'] },
    { name: 'https', label: 'Anmeldung nur über HTTPS', keys: ['AUTH_COOKIE_SECURE'] },
    { name: 'proxy', label: 'Proxys vor dem Backend', keys: ['TRUST_PROXY_HOPS'] },
    { name: 'envOnly', label: 'Nur in .env änderbar', keys: ['DATA_DIR', 'PORT', 'HOST', 'SETTINGS_SAFE_MODE'] },
  ],
};

export const SUBPAGES: readonly SettingsSubpage[] = (Object.keys(PAGE_PLAN) as SettingGroup[]).flatMap((group) => {
  const planned = PAGE_PLAN[group].map(({ name, ...page }) => ({ ...page, id: `${group}.${name}`, group }));
  const known = new Set(planned.flatMap((page) => page.keys));
  const rest = SETTINGS.filter((definition) => definition.group === group && !known.has(definition.key)).map((definition) => definition.key);
  return rest.length ? [...planned, { id: `${group}.more`, group, label: 'Weitere', keys: rest }] : planned;
});

export function subpagesOf(group: SettingGroup): SettingsSubpage[] {
  return SUBPAGES.filter((page) => page.group === group);
}

export function subpage(id: string): SettingsSubpage | undefined {
  return SUBPAGES.find((page) => page.id === id);
}

/** Unterseite, auf der ein Wert steht. */
export function subpageOf(key: SettingKey): SettingsSubpage {
  return SUBPAGES.find((page) => page.keys.includes(key))!;
}

// ── Suche ──

/** Suchbegriffe der eigenen Seiten, die keine Werte im Katalog haben. */
const EXTRA_WORDS: Partial<Record<SettingsSection, string>> = {
  overview: 'zu erledigen schlüssel limits grenzen',
  auto: 'zeitplan uhrzeit stichwörter positionen region suchprofil automatisch budget',
  templates: 'vorlage text anfrage erstnachricht follow-up nachricht',
  backup: 'sicherung herunterladen wiederherstellen update version einspielen',
  history: 'verlauf geändert änderungen wer wann',
};

const words = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

const SECTION_TEXT = new Map<SettingsSection, string>(NAV_ITEMS.map((item) => [item.id, [item.label, item.lead, EXTRA_WORDS[item.id] ?? ''].join(' ').toLowerCase()]));

const PAGE_TEXT = new Map<string, string>(
  SUBPAGES.map((page) => {
    const fields = page.keys.flatMap((key) => {
      const definition = SETTINGS.find((entry) => entry.key === key)!;
      return [definition.label, definition.help ?? ''];
    });
    return [page.id, [page.label, navItem(page.group).label, ...fields].join(' ').toLowerCase()];
  }),
);

/** Passt der Bereich selbst (Name, Kurztext, Stichwörter) zur Suche? */
export function matchesSearch(section: SettingsSection, query: string): boolean {
  const text = SECTION_TEXT.get(section) ?? '';
  return words(query).every((word) => text.includes(word));
}

/** Unterseiten, deren Name oder Werte (Name, Hilfetext) zur Suche passen – „Zeitzone“ → Arbeitszeit. */
export function searchSubpages(query: string): SettingsSubpage[] {
  const list = words(query);
  if (!list.length) return [];
  return SUBPAGES.filter((page) => list.every((word) => PAGE_TEXT.get(page.id)!.includes(word)));
}
