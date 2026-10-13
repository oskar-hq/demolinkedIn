import { ChevronLeft, Gauge, Plug, Search, Send, Server } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useHotkeys } from '../../lib/useHotkeys';
import { useAccess } from '../../state/auth';
import { AutoSearchSection } from '../autoSearch/AutoSearchSection';
import { SystemSection } from '../system/SystemSection';
import { MenuList, MenuRow, type RowBadge } from './MenuRow';
import {
  category,
  categoryOf,
  isValueSection,
  matchesSearch,
  navItem,
  OVERVIEW_ITEM,
  searchSubpages,
  SETTINGS_NAV,
  SETTINGS_SECTIONS,
  subpage,
  type CategoryId,
  type SettingsSection,
} from './settingsNav';
import { SettingsView } from './SettingsView';
import { TemplatesSection } from './TemplatesSection';

/** Früher Reiter, heute Bereiche: `values` (alte Aufrufe) öffnet „Auf einen Blick“. */
export type SettingsTab = SettingsSection | 'values';

const TAB_KEY = 'cockpit.settings.tab';
const PAGE_KEY = 'cockpit.settings.page';

/**
 * Welcher Bereich beim nächsten Öffnen der Einstellungen gezeigt wird (z. B. aus dem Dashboard „Vorlagen bearbeiten“),
 * optional gleich eine Unterseite (`unipile.searchAccount`).
 */
export function openSettingsTab(tab: SettingsTab, page?: string) {
  try {
    sessionStorage.setItem(TAB_KEY, tab === 'values' ? 'overview' : tab);
    if (page) sessionStorage.setItem(PAGE_KEY, page);
    else sessionStorage.removeItem(PAGE_KEY);
  } catch {
    // nur Komfort
  }
}

/** Kennzeichen in den Listen – nur was abweicht (DESIGN.md §1). */
export type NavBadge = RowBadge;

/** Wo man in den Untermenüs steht: erste Ebene (alles null) → Kategorie → Bereich → Unterseite. */
interface Path {
  category: CategoryId | null;
  section: SettingsSection | null;
  page: string | null;
}

const ROOT: Path = { category: null, section: null, page: null };

function pathTo(section: SettingsSection, page: string | null = null): Path {
  return { category: categoryOf(section)?.id ?? null, section, page: page && subpage(page)?.group === section ? page : null };
}

/**
 * Ziel eines Sprungs von anderswo („Vorlagen bearbeiten“, Glocke) – einmalig, danach wieder gelöscht. Sonst beginnen
 * die Einstellungen auf der ersten Ebene, wie eine App.
 */
function readPath(): Path {
  try {
    const stored = sessionStorage.getItem(TAB_KEY);
    const storedPage = sessionStorage.getItem(PAGE_KEY);
    if (!SETTINGS_SECTIONS.includes(stored as SettingsSection)) return ROOT;
    return pathTo(stored as SettingsSection, storedPage);
  } catch {
    return ROOT;
  }
}

function parentOf(path: Path): Path {
  if (path.page) return { ...path, page: null };
  if (path.section) return path.category ? { category: path.category, section: null, page: null } : ROOT;
  return ROOT;
}

function titleOf(path: Path): string {
  if (path.page) return subpage(path.page)?.label ?? '';
  if (path.section) return navItem(path.section).label;
  if (path.category) return category(path.category).title;
  return 'Einstellungen';
}

const CATEGORY_ICON: Record<CategoryId, ReactNode> = {
  connections: <Plug className="h-[18px] w-[18px]" strokeWidth={2.25} />,
  outreach: <Send className="h-[17px] w-[17px]" strokeWidth={2.25} />,
  system: <Server className="h-[17px] w-[17px]" strokeWidth={2.25} />,
};

/**
 * Einstellungen als Untermenüs wie in einer App (Wunsch des Nutzers 11.10., Vorbild Trade Republic): erst die grobe
 * Richtung (Verbindungen, Outreach, System), dann der Bereich, dann eine Unterseite mit nur wenigen Werten. Jede
 * Ebene ist eine kurze Liste; zurück geht es oben links oder mit Esc. Alle Bereiche bleiben geladen, damit beim
 * Wechseln keine ungespeicherten Änderungen verloren gehen.
 */
export function SettingsPage() {
  const { canEditSettings } = useAccess();
  if (!canEditSettings) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-16 text-center sm:px-6" data-testid="settings-not-allowed">
        <p className="display text-[26px] font-semibold">Einstellungen sind für dein Konto gesperrt.</p>
        <p className="mt-2 text-[15px] text-ink-2">Schlüssel, Grenzen und Vorlagen ändern Gründer oder Admins.</p>
      </div>
    );
  }
  return <SettingsContent />;
}

function SettingsContent() {
  const [path, setPath] = useState<Path>(readPath);
  const [query, setQuery] = useState('');
  const [badges, setBadges] = useState<Partial<Record<SettingsSection, NavBadge>>>({});
  const { section, page } = path;
  // Sprungziel nur einmal verwenden (nicht im Initialisierer löschen – React ruft ihn im StrictMode doppelt auf).
  useEffect(() => {
    try {
      sessionStorage.removeItem(TAB_KEY);
      sessionStorage.removeItem(PAGE_KEY);
    } catch {
      // nur Komfort
    }
  }, []);

  const navigate = useCallback((next: Path) => {
    setPath(next);
    window.scrollTo({ top: 0 });
  }, []);
  /** In einen Bereich (und optional eine Unterseite) springen – aus Suche, Übersicht, Fehlern oder „Sicherungen“. */
  const open = useCallback((next: SettingsSection, nextPage: string | null = null) => navigate(pathTo(next, nextPage)), [navigate]);
  const back = () => navigate(parentOf(path));
  const atRoot = !path.category && !path.section;

  // Esc = eine Ebene zurück (Textfelder und offene Dialoge behalten Esc für sich).
  useHotkeys({ escape: back }, !atRoot);

  // „Gespeichert“ neben dem Titel – kurz einblenden, dann wieder weg (Design v2).
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => {
    if (!savedAt) return;
    const timer = window.setTimeout(() => setSavedAt(0), 1800);
    return () => window.clearTimeout(timer);
  }, [savedAt]);
  const onSaved = useCallback(() => setSavedAt(Date.now()), []);

  const listView = !section;

  return (
    <div className="mx-auto max-w-[640px] px-4 pb-10 pt-6 sm:px-6 sm:pt-12">
      {!atRoot && (
        <button
          type="button"
          onClick={back}
          className="-ml-2 mb-4 inline-flex min-h-[44px] items-center gap-0.5 rounded-lg px-2 text-[15px] font-medium text-ink-2 transition-colors hover:text-ink"
          data-testid="settings-back"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden /> {titleOf(parentOf(path))}
        </button>
      )}
      <header className="flex items-baseline justify-between gap-4">
        <h1
          className="display min-w-0 hyphens-auto break-words text-[30px] font-bold leading-[1.1] tracking-[-0.025em] sm:text-[34px]"
          data-testid={listView ? 'settings-title' : 'settings-section-title'}
        >
          {titleOf(path)}
        </h1>
        <span
          aria-hidden
          className={cn('shrink-0 text-[12px] font-semibold text-good transition-opacity duration-300 ease-out', savedAt ? 'opacity-100' : 'opacity-0')}
          data-testid="settings-saved"
        >
          Gespeichert
        </span>
      </header>

      {atRoot && <RootMenu query={query} onQuery={setQuery} badges={badges} onCategory={(id) => navigate({ category: id, section: null, page: null })} onOpen={open} />}

      {path.category && !section && (
        <nav aria-label={category(path.category).title} className="mt-8" data-testid="settings-nav">
          <MenuList>
            {category(path.category).items.map((item) => (
              <MenuRow
                key={item.id}
                title={item.label}
                subtitle={item.lead}
                badge={badges[item.id]}
                badgeTestId={`settings-nav-badge-${item.id}`}
                onClick={() => open(item.id)}
                testId={`settings-nav-${item.id}`}
              />
            ))}
          </MenuList>
        </nav>
      )}

      {/* Bereiche bleiben geladen (Entwürfe, Zustand der Formulare) – sichtbar ist nur der offene. */}
      {/* Sicherungen und Updates: erst Stand und Knöpfe, darunter die Unterseiten mit den Zeitplänen. */}
      <div hidden={section !== 'backup' || page !== null}>
        <SystemSection active={section === 'backup' && page === null} onOpenSetting={(group, target) => open(group, target ?? null)} />
      </div>
      {/* Warnungen (Notfallmodus, Probe) zeigt sie auch auf den Menüs – sie sind nie eingeklappt. */}
      <SettingsView
        section={section && isValueSection(section) ? section : null}
        page={page}
        notices={!section}
        onNavigate={open}
        onBadges={setBadges}
        onSaved={onSaved}
      />
      <div hidden={section !== 'templates'} className="pt-10">
        <TemplatesSection active={section === 'templates'} />
      </div>
      <div hidden={section !== 'auto'}>
        <AutoSearchSection active={section === 'auto'} />
      </div>
    </div>
  );
}

/** Erste Ebene: Suche, „Auf einen Blick“ und die drei Kategorien – oder die Treffer der Suche. */
function RootMenu({
  query,
  onQuery,
  badges,
  onCategory,
  onOpen,
}: {
  query: string;
  onQuery: (query: string) => void;
  badges: Partial<Record<SettingsSection, NavBadge>>;
  onCategory: (id: CategoryId) => void;
  onOpen: (section: SettingsSection, page?: string | null) => void;
}) {
  const searching = query.trim() !== '';
  const sections = searching ? [OVERVIEW_ITEM, ...SETTINGS_NAV.flatMap((group) => group.items)].filter((item) => matchesSearch(item.id, query)) : [];
  const pages = searching ? searchSubpages(query) : [];

  return (
    <nav aria-label="Einstellungen" data-testid="settings-nav">
      <label className="mt-6 flex h-[44px] items-center gap-2.5 rounded-[12px] bg-surface-3 px-3.5">
        <span className="sr-only">Einstellungen durchsuchen</span>
        <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Einstellung suchen"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-4 sm:text-[15px]"
          data-testid="settings-search"
        />
      </label>

      {searching ? (
        sections.length + pages.length === 0 ? (
          <p className="mt-6 text-[14px] text-ink-3">Nichts gefunden für „{query.trim()}“.</p>
        ) : (
          <MenuList className="mt-6" label="Treffer">
            {sections.map((item) => (
              <MenuRow
                key={item.id}
                title={item.label}
                subtitle={categoryOf(item.id)?.title ?? 'Einstellungen'}
                badge={badges[item.id]}
                onClick={() => onOpen(item.id)}
                testId={`settings-nav-${item.id}`}
              />
            ))}
            {pages.map((entry) => (
              <MenuRow
                key={entry.id}
                title={entry.label}
                subtitle={navItem(entry.group).label}
                onClick={() => onOpen(entry.group, entry.id)}
                testId={`settings-result-${entry.id}`}
              />
            ))}
          </MenuList>
        )
      ) : (
        <MenuList className="mt-8">
          <MenuRow
            title={OVERVIEW_ITEM.label}
            subtitle={OVERVIEW_ITEM.lead}
            icon={<Gauge className="h-[18px] w-[18px]" strokeWidth={2.25} />}
            onClick={() => onOpen('overview')}
            testId="settings-nav-overview"
          />
          {SETTINGS_NAV.map((group) => {
            const badge = group.items.map((item) => badges[item.id]).find(Boolean);
            return (
              <MenuRow
                key={group.id}
                title={group.title}
                subtitle={group.summary}
                icon={CATEGORY_ICON[group.id]}
                badge={badge}
                badgeTestId={`settings-cat-badge-${group.id}`}
                onClick={() => onCategory(group.id)}
                testId={`settings-cat-${group.id}`}
              />
            );
          })}
        </MenuList>
      )}
    </nav>
  );
}
