import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { BOARD_COLUMN_NAME_MAX, CLOSED_LEAD_STAGES, LEAD_STAGE_LABELS, LEAD_STAGES, type BoardColumn, type CockpitLead, type LeadStage } from '../../../shared/leads';
import { SCORE_TIER_LABELS, type ScoreTier } from '../../../shared/scoring';
import { FOUNDERS } from '../../data/founders';
import { cn } from '../../lib/cn';
import { ApiError, boardApi, leadsApi } from '../../lib/leadSearchApi';
import { leadCompany, leadName, leadPosition } from '../../lib/leadView';
import { formatRelative } from '../../lib/time';
import { useAuth } from '../../state/auth';
import { useDemo } from '../../state/demo';
import { canEditBoardColumns } from '../../../shared/auth';
import { actionAllowed } from '../lead/LeadActions';
import type { FounderId } from '../../state/types';
import { Button } from '../ui/Button';
import { PageHeader } from '../ui/PageHeader';
import { Segmented } from '../ui/Segmented';
import { SPRING_MENU } from '../../lib/motion';

type Layout = 'board' | 'table';
type Scope = 'mine' | 'all';
type Sort = 'activity' | 'score';

const LAYOUT_KEY = 'cockpit.leads.layout';
/**
 * Mehr zeigt die Ansicht nicht auf einmal – die Datenbank hat in Phase 2 einige hundert Leads. Im Board je für „Neu“
 * und für die übrigen Stufen, damit viele neue Leads die weiteren Spalten nicht verdrängen.
 */
const LIMIT = 500;
/** Offene Stufen – abgeschlossene (verloren, übergeben) erst auf Wunsch („Abgeschlossene zeigen“). */
const OPEN_STAGES = LEAD_STAGES.filter((stage) => !CLOSED_LEAD_STAGES.includes(stage));

const TIER_DOT: Record<ScoreTier, string> = { high: 'bg-good', medium: 'bg-warn', low: 'bg-ink-3' };

/** Reihenfolge wie im Backend (`sort=recent` bzw. `sort=score`) – fürs Zusammenführen der Teilabfragen im Board. */
const byRecent = (a: CockpitLead, b: CockpitLead) => b.lastActivityAt - a.lastActivityAt || a.id.localeCompare(b.id);
const byScore = (a: CockpitLead, b: CockpitLead) => {
  const left = a.score?.total ?? null;
  const right = b.score?.total ?? null;
  if (left === null || right === null) return left === right ? a.lastActivityAt - b.lastActivityAt || a.id.localeCompare(b.id) : left === null ? 1 : -1;
  return right - left || a.lastActivityAt - b.lastActivityAt || a.id.localeCompare(b.id);
};

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'table' ? 'table' : 'board';
  } catch {
    return 'board';
  }
}

/** Alle Leads aus der Datenbank (`GET /api/leads`) – als Pipeline-Board nach Stufe oder als Tabelle. */
export function LeadsView() {
  const { state, dispatch } = useDemo();
  const founder = state.founder as FounderId;
  // Eigene Spalten gelten für alle – anlegen, umbenennen, löschen nur Gründer und Admin (Mitarbeiter: nur ansehen).
  const { auth } = useAuth();
  const editColumns = auth.status !== 'authenticated' || canEditBoardColumns(auth.user);
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [scope, setScope] = useState<Scope>('mine');
  const [sort, setSort] = useState<Sort>('activity');
  const [showClosed, setShowClosed] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [result, setResult] = useState<{ leads: CockpitLead[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [boardNotice, setBoardNotice] = useState<string | null>(null);
  const requestId = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boardApi
      .columns()
      .then((response) => setColumns(response.columns))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setError(null);
    try {
      // „Länger nichts passiert“: zuletzt bearbeitete zuerst laden und umdrehen – bei mehr als LIMIT Leads fehlen so die
      // ältesten, nicht die neuesten.
      const base = { owner: scope === 'mine' ? founder : undefined, q: debounced, sort: sort === 'activity' ? ('recent' as const) : sort, limit: LIMIT };
      let response: { leads: CockpitLead[]; total: number };
      if (layout === 'board') {
        // „Neu“ getrennt laden. Eigene Spalten bleiben vollständig: auch verlorene/übergebene Leads, die in einer eigenen
        // Spalte liegen (und neue in eigenen Spalten – die doppelten fallen unten heraus).
        const rest = LEAD_STAGES.filter((stage) => stage !== 'new' && (showClosed || OPEN_STAGES.includes(stage)));
        const [fresh, others] = await Promise.all([
          leadsApi.list({ ...base, stage: ['new'] }),
          leadsApi.list({ ...base, stage: rest, withBoardColumns: !showClosed }),
        ]);
        const known = new Set(others.leads.map((lead) => lead.id));
        const extra = fresh.leads.filter((lead) => !known.has(lead.id));
        const doubled = fresh.leads.length - extra.length;
        response = { leads: [...others.leads, ...extra].sort(sort === 'score' ? byScore : byRecent), total: fresh.total + others.total - doubled };
      } else {
        response = await leadsApi.list({ ...base, ...(showClosed ? {} : { stage: OPEN_STAGES }) });
      }
      if (id === requestId.current) setResult(sort === 'activity' ? { ...response, leads: [...response.leads].reverse() } : response);
    } catch {
      if (id === requestId.current) setError('Die Leads konnten nicht geladen werden.');
    }
  }, [scope, founder, debounced, sort, showClosed, layout]);

  // Neu laden bei anderen Filtern, nach Änderungen im Lead-Panel (schließt) und wenn der Tagesstapel neu kam.
  const panelOpen = !!state.panelLeadId;
  useEffect(() => {
    if (!panelOpen) void load();
  }, [load, panelOpen, state.stack.fetchedAt]);

  const changeLayout = (next: Layout) => {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // nur Komfort
    }
  };

  const open = (leadId: string) => dispatch({ type: 'OPEN_PANEL', leadId });
  const leads = result?.leads ?? [];

  // Ziehen und Ablegen im Board: in eigene Spalten frei; in Stufen-Spalten nur zurück in die eigene Stufe, nach
  // „Vernetzt“ (Anfrage angenommen), „Termin“ oder „Verloren“ (mit Rückfrage) – alles andere über die Aufgaben.
  const move = async (lead: CockpitLead, target: BoardTarget) => {
    setBoardNotice(null);
    // Schon etwas gespeichert (z. B. die Stufe), das Zweite scheitert: trotzdem neu laden, sonst stimmt das Board nicht.
    let changed = false;
    try {
      if (target.kind === 'custom') {
        if (lead.boardColumn === target.id) return;
        await leadsApi.update(lead.id, { boardColumn: target.id });
      } else if (target.stage === lead.stage) {
        if (!lead.boardColumn) return;
        await leadsApi.update(lead.id, { boardColumn: null });
      } else if (target.stage === 'connected' && actionAllowed(lead, 'invite_accepted')) {
        await leadsApi.act(lead.id, { action: 'invite_accepted' });
        changed = true;
        if (lead.boardColumn) await leadsApi.update(lead.id, { boardColumn: null });
      } else if (target.stage === 'meeting' && !actionAllowed(lead, 'meeting_booked')) {
        setBoardNotice(
          CLOSED_LEAD_STAGES.includes(lead.stage)
            ? `${leadName(lead)} ist ${lead.stage === 'lost' ? 'verloren' : 'übergeben'} – erst im Lead-Panel wieder öffnen, dann den Termin eintragen.`
            : `Einen Termin gibt es erst ab „Vernetzt“ – ${leadName(lead)} steht noch in „${LEAD_STAGE_LABELS[lead.stage]}“.`,
        );
        return;
      } else if (target.stage === 'meeting' || target.stage === 'lost') {
        // Rückfrage erst nach dem Ablegen – ein Dialog mitten im Ziehen bringt den Browser durcheinander.
        if (target.stage === 'lost') await new Promise((resolve) => window.setTimeout(resolve, 0));
        if (target.stage === 'lost' && !window.confirm(`${leadName(lead)} als verloren markieren? Im Lead-Panel kannst du ihn wieder öffnen.`)) return;
        await leadsApi.act(lead.id, { action: target.stage === 'meeting' ? 'meeting_booked' : 'lost' });
        changed = true;
        if (lead.boardColumn) await leadsApi.update(lead.id, { boardColumn: null });
      } else {
        setBoardNotice(
          `Nach „${LEAD_STAGE_LABELS[target.stage]}“ kommt ein Lead über seine Aufgaben. Ziehen geht in eigene Spalten, nach „Vernetzt“ (Anfrage angenommen), „Termin“ und „Verloren“.`,
        );
        return;
      }
      await load();
    } catch (caught) {
      setBoardNotice(caught instanceof ApiError ? caught.message : 'Verschieben hat nicht geklappt.');
      if (changed) void load();
    }
  };

  const addColumn = async (name: string) => {
    const column = await boardApi.add(name);
    setColumns((current) => [...current, column]);
  };
  const renameColumn = async (id: string, name: string) => {
    const column = await boardApi.rename(id, name);
    setColumns((current) => current.map((entry) => (entry.id === id ? column : entry)));
  };
  const removeColumn = async (id: string) => {
    setColumns((await boardApi.remove(id)).columns);
    await load();
  };

  return (
    // Board nutzt die ganze Monitorbreite (Wunsch des Nutzers 11.10.: möglichst wenig seitlich scrollen), Tabelle bleibt schmal.
    <div
      className={cn('mx-auto w-full px-4 pb-28 pt-8 sm:px-6 sm:pt-12', layout === 'board' ? 'lg:px-10' : 'max-w-[1240px]')}
      data-testid="leads-view"
    >
      <PageHeader
        className="mb-6"
        title="Leads"
        aside={
          result && (
            <span data-testid="leads-count">
              {result.total}
              {result.total > leads.length ? ` · die ersten ${leads.length}` : ''}
            </span>
          )
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Zuständig"
          size="sm"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'mine', label: 'Meine' },
            { value: 'all', label: 'Alle' },
          ]}
        />
        <label className="relative order-last w-full sm:order-none sm:ml-auto sm:w-64">
          <span className="sr-only">Leads durchsuchen</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, Firma …"
            className="h-[38px] w-full rounded-[10px] border border-transparent bg-surface-3 pl-9 pr-3 text-[16px] text-ink outline-none placeholder:text-ink-4 focus:border-accent sm:text-[13px]"
            data-testid="leads-search"
          />
        </label>
        <div className="relative ml-auto sm:ml-0" ref={menuRef}>
          <ViewMenu
            layout={layout}
            sort={sort}
            showClosed={showClosed}
            onLayout={changeLayout}
            onSort={setSort}
            onShowClosed={setShowClosed}
            container={menuRef}
          />
        </div>
      </div>

      {result && result.total > leads.length && (
        <p role="status" className="mb-4 flex items-baseline gap-2 text-[13.5px] text-ink" data-testid="leads-limit">
          <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-warn" aria-hidden />
          {sort === 'score' ? `Nur die ${leads.length} mit dem höchsten Score` : `Nur die ${leads.length} zuletzt bearbeiteten`} von {result.total} Leads –
          such nach Name oder Firma, um die übrigen zu finden.
        </p>
      )}

      {error ? (
        <div role="alert" className="py-16 text-center">
          <p className="text-[15px] text-ink">{error}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => void load()}>
            Erneut versuchen
          </Button>
        </div>
      ) : !result ? (
        <p role="status" className="py-16 text-center text-[14px] text-ink-3">
          Leads werden geladen …
        </p>
      ) : leads.length === 0 ? (
        <p className="py-16 text-center text-[14px] text-ink-3">{debounced.trim() ? 'Keine Leads zu dieser Suche.' : 'Noch keine Leads.'}</p>
      ) : layout === 'board' ? (
        <>
          {boardNotice && (
            <p role="status" className="mb-4 flex items-baseline gap-2 text-[13.5px] text-ink" data-testid="board-notice">
              <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-warn" aria-hidden />
              {boardNotice}
            </p>
          )}
          <Board
            leads={leads}
            columns={columns}
            showOwner={scope === 'all'}
            closedHidden={!showClosed}
            onShowClosed={() => setShowClosed(true)}
            onOpen={open}
            onMove={(lead, target) => void move(lead, target)}
            {...(editColumns ? { onAddColumn: addColumn, onRenameColumn: renameColumn, onRemoveColumn: removeColumn } : {})}
          />
        </>
      ) : (
        <Table leads={leads} showOwner={scope === 'all'} onOpen={open} />
      )}
    </div>
  );
}

const LAYOUTS: Array<{ value: Layout; label: string }> = [
  { value: 'board', label: 'Board' },
  { value: 'table', label: 'Tabelle' },
];
const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'activity', label: 'Länger nichts passiert' },
  { value: 'score', label: 'Score' },
];

/** Darstellung und Sortierung in einem Menü – wie der Filter im Fokus-Modus. */
function ViewMenu({
  layout,
  sort,
  showClosed,
  onLayout,
  onSort,
  onShowClosed,
  container,
}: {
  layout: Layout;
  sort: Sort;
  showClosed: boolean;
  onLayout: (layout: Layout) => void;
  onSort: (sort: Sort) => void;
  onShowClosed: (show: boolean) => void;
  container: RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Esc schließt nur das Menü – nicht zusätzlich die Ansicht dahinter.
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, container, close]);

  const item = (checked: boolean, label: string, onSelect: () => void, role: 'menuitemradio' | 'menuitemcheckbox' = 'menuitemradio') => (
    <button
      key={label}
      type="button"
      role={role}
      aria-checked={checked}
      onClick={() => {
        onSelect();
        close();
      }}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] text-ink transition-colors hover:bg-surface-3"
    >
      <span className="flex w-4 justify-center">{checked && <Check className="h-4 w-4" strokeWidth={2.5} />}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
  const eyebrow = 'px-3 pb-1 pt-2 text-[11.5px] font-semibold text-ink-3';

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="leads-view-options"
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
      >
        <span className="sr-only">Ansicht: </span>
        {layout === 'board' ? 'Board' : 'Tabelle'}
        {sort === 'score' ? ' · Score' : ''}
        {showClosed ? ' · alle' : ''}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Ansicht"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } }}
            transition={SPRING_MENU}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 top-10 z-40 w-[240px] overflow-hidden rounded-[14px] border border-line bg-surface-2 p-1.5 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.85)]"
          >
            <div role="group" aria-label="Darstellung">
              <p aria-hidden className={eyebrow}>
                Darstellung
              </p>
              {LAYOUTS.map((option) => item(layout === option.value, option.label, () => onLayout(option.value)))}
            </div>
            <div role="group" aria-label="Sortierung" className="mt-1 border-t border-line pt-1">
              <p aria-hidden className={eyebrow}>
                Sortierung
              </p>
              {SORTS.map((option) => item(sort === option.value, option.label, () => onSort(option.value)))}
            </div>
            <div role="group" aria-label="Filter" className="mt-1 border-t border-line pt-1">
              {item(showClosed, 'Abgeschlossene zeigen', () => onShowClosed(!showClosed), 'menuitemcheckbox')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ScoreBadge({ lead }: { lead: CockpitLead }) {
  if (!lead.score) return null;
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums" title={`Score ${SCORE_TIER_LABELS[lead.score.tier]}`}>
      <span className={cn('h-1.5 w-1.5 rounded-full', TIER_DOT[lead.score.tier])} aria-hidden />
      {Math.round(lead.score.total * 100)}
    </span>
  );
}

type BoardTarget = { kind: 'stage'; stage: LeadStage } | { kind: 'custom'; id: string };

interface BoardProps {
  leads: CockpitLead[];
  columns: BoardColumn[];
  showOwner: boolean;
  /** Abgeschlossene Stufen (verloren, übergeben) nicht geladen – Spalten bleiben als Ablage für „Verloren“. */
  closedHidden: boolean;
  onShowClosed: () => void;
  onOpen: (leadId: string) => void;
  onMove: (lead: CockpitLead, target: BoardTarget) => void;
  /** Fehlen alle drei, lassen sich Spalten nur ansehen (Mitarbeiter). */
  onAddColumn?: (name: string) => Promise<void>;
  onRenameColumn?: (id: string, name: string) => Promise<void>;
  onRemoveColumn?: (id: string) => Promise<void>;
}

/**
 * Pipeline nach `LEAD_STAGES` plus eigene Spalten (z. B. „Meeting Close“) – Leads per Ziehen verschieben. Spalten
 * scrollen innerhalb des Boards, nie die ganze Seite.
 */
function Board({ leads, columns, showOwner, closedHidden, onShowClosed, onOpen, onMove, onAddColumn, onRenameColumn, onRemoveColumn }: BoardProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const byColumn = useMemo(() => {
    const map = new Map<string, CockpitLead[]>();
    const custom = new Set(columns.map((column) => column.id));
    for (const lead of leads) {
      const key = lead.boardColumn && custom.has(lead.boardColumn) ? `custom:${lead.boardColumn}` : `stage:${lead.stage}`;
      map.set(key, [...(map.get(key) ?? []), lead]);
    }
    return map;
  }, [leads, columns]);

  const dropProps = (key: string, target: BoardTarget) => ({
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dragOver !== key) setDragOver(key);
    },
    onDragLeave: () => setDragOver((current) => (current === key ? null : current)),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(null);
      const lead = leads.find((entry) => entry.id === event.dataTransfer.getData('text/plain'));
      if (lead) onMove(lead, target);
    },
  });

  // Ruhige Zeilen statt Karten (Wunsch des Nutzers 07.10.: minimalistisch): Name, Score, Firma – mehr im Lead-Panel.
  const renderCards = (list: CockpitLead[]) => (
    <ul className="space-y-0.5">
      {list.map((lead) => (
        <li key={lead.id}>
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', lead.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onClick={() => onOpen(lead.id)}
            className="-mx-2.5 w-[calc(100%+1.25rem)] cursor-grab rounded-[10px] px-2.5 py-2.5 text-left transition-colors hover:bg-surface-3 active:cursor-grabbing"
            data-testid="board-card"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[14px] font-semibold text-ink">{leadName(lead)}</span>
              <span className="shrink-0 text-[12.5px] text-ink-3">
                <ScoreBadge lead={lead} />
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">{leadCompany(lead)}</span>
            {(showOwner || lead.boardColumn) && (
              <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                {showOwner && FOUNDERS[lead.owner].name}
                {showOwner && lead.boardColumn && ' · '}
                {lead.boardColumn && LEAD_STAGE_LABELS[lead.stage]}
              </span>
            )}
          </button>
        </li>
      ))}
      {list.length === 0 && <li className="py-2.5 text-[13px] text-ink-4">Noch niemand</li>}
    </ul>
  );

  return (
    <div className="scroll-thin -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10" data-testid="leads-board">
      {/* Spalten wachsen gleichmäßig mit der Breite; erst unter der Mindestbreite scrollt das Board seitlich. */}
      <div className="flex gap-5">
        {LEAD_STAGES.map((stage) => {
          const key = `stage:${stage}`;
          const list = byColumn.get(key) ?? [];
          const hidden = closedHidden && CLOSED_LEAD_STAGES.includes(stage);
          return (
            <section
              key={stage}
              className={cn(
                'basis-0 rounded-xl transition-colors',
                // Ausgeblendete Endstufen brauchen nur Platz für „Ausgeblendet · zeigen“.
                hidden ? 'min-w-[120px] flex-[0.6]' : 'min-w-[150px] flex-1',
                dragOver === key && 'bg-surface-2',
              )}
              aria-label={LEAD_STAGE_LABELS[stage]}
              data-testid={`column-${stage}`}
              {...dropProps(key, { kind: 'stage', stage })}
            >
              <h2 className="mb-3 flex items-baseline justify-between text-[13px] font-bold text-ink">
                {LEAD_STAGE_LABELS[stage]}
                {!hidden && <span className="tabular-nums text-ink-3">{list.length}</span>}
              </h2>
              {hidden ? (
                <button
                  type="button"
                  onClick={onShowClosed}
                  className="w-full py-2.5 text-left text-[13px] text-ink-3 transition-colors hover:text-ink"
                  data-testid={`show-closed-${stage}`}
                >
                  Ausgeblendet · zeigen
                </button>
              ) : (
                renderCards(list)
              )}
            </section>
          );
        })}
        {columns.map((column) => {
          const key = `custom:${column.id}`;
          const list = byColumn.get(key) ?? [];
          return (
            <section
              key={column.id}
              className={cn('min-w-[150px] flex-1 basis-0 rounded-xl transition-colors', dragOver === key && 'bg-surface-2')}
              aria-label={column.name}
              data-testid="custom-column"
              {...dropProps(key, { kind: 'custom', id: column.id })}
            >
              {onRenameColumn && onRemoveColumn ? (
                <CustomColumnHeader column={column} count={list.length} onRename={onRenameColumn} onRemove={onRemoveColumn} />
              ) : (
                <h2 className="mb-2.5 flex items-baseline justify-between gap-2 px-1 text-[12.5px] font-medium text-accent">
                  <span className="truncate">{column.name}</span>
                  <span className="tabular-nums text-ink-3">{list.length}</span>
                </h2>
              )}
              {renderCards(list)}
            </section>
          );
        })}
        {onAddColumn && <AddColumn onAdd={onAddColumn} />}
      </div>
    </div>
  );
}

function CustomColumnHeader({
  column,
  count,
  onRename,
  onRemove,
}: {
  column: BoardColumn;
  count: number;
  onRename: (id: string, name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!name.trim() || name.trim() === column.name) return setEditing(false);
    try {
      await onRename(column.id, name);
      setEditing(false);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Umbenennen hat nicht geklappt.');
    }
  };
  if (editing) {
    return (
      <div className="mb-2.5 px-1">
        <input
          autoFocus
          value={name}
          maxLength={BOARD_COLUMN_NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
            if (event.key === 'Escape') setEditing(false);
          }}
          aria-label="Name der Spalte"
          className="h-8 w-full rounded-[8px] border border-transparent bg-surface-3 px-2 text-[16px] text-ink outline-none focus:border-accent sm:text-[12.5px]"
        />
        {error && <p className="mt-1 text-[11.5px] text-ink">{error}</p>}
      </div>
    );
  }
  return (
    <h2 className="group mb-2.5 flex items-baseline justify-between gap-2 px-1 text-[12.5px] font-medium text-accent">
      <span className="truncate">{column.name}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={() => setEditing(true)} aria-label={`Spalte „${column.name}“ umbenennen`} className="text-ink-4 hover:text-ink-2">
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Spalte „${column.name}“ löschen? Die Leads darin kommen zurück in ihre Stufe.`)) void onRemove(column.id);
          }}
          aria-label={`Spalte „${column.name}“ löschen`}
          className="text-ink-4 hover:text-ink-2"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        <span className="tabular-nums text-ink-3">{count}</span>
      </span>
    </h2>
  );
}

function AddColumn({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    if (!name.trim()) return;
    try {
      await onAdd(name);
      setName('');
      setOpen(false);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Anlegen hat nicht geklappt.');
    }
  };
  return (
    <section className={cn('shrink-0', open ? 'w-[200px]' : 'w-9')} aria-label="Eigene Spalte anlegen">
      {open ? (
        <div className="px-1">
          <input
            autoFocus
            value={name}
            maxLength={BOARD_COLUMN_NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void add();
              if (event.key === 'Escape') setOpen(false);
            }}
            placeholder="z. B. Meeting Close"
            aria-label="Name der neuen Spalte"
            className="h-9 w-full rounded-[10px] border border-transparent bg-surface-3 px-3 text-[16px] text-ink outline-none placeholder:text-ink-4 focus:border-accent sm:text-[13px]"
            data-testid="board-column-name"
          />
          {error && <p className="mt-1 text-[11.5px] text-ink">{error}</p>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void add()} disabled={!name.trim()} data-testid="board-column-add">
              Anlegen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          // Zugeklappt nur „+“ – spart Breite, damit das ganze Board auf den Bildschirm passt.
          aria-label="Eigene Spalte"
          title="Eigene Spalte"
          className="flex h-9 w-full items-center justify-center rounded-[10px] bg-surface-2 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
          data-testid="board-column-new"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}

function Table({ leads, showOwner, onOpen }: { leads: CockpitLead[]; showOwner: boolean; onOpen: (leadId: string) => void }) {
  return (
    <div data-testid="leads-table">
      <table className="w-full table-fixed text-left text-[13.5px]">
        <thead className="text-[12px] font-semibold text-ink-3">
          <tr>
            <th className="w-[60%] px-2 py-2.5 font-medium sm:w-[30%]">Lead</th>
            <th className="w-[40%] px-3 py-2.5 font-medium sm:w-[14%]">Stufe</th>
            <th className="hidden w-[9%] px-3 py-2.5 font-medium sm:table-cell">Score</th>
            {showOwner && <th className="hidden w-[11%] px-3 py-2.5 font-medium md:table-cell">Zuständig</th>}
            <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Nächster Schritt</th>
            <th className="hidden w-[14%] px-2 py-2.5 text-right font-medium sm:table-cell">Zuletzt</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => onOpen(lead.id)}
              className="cursor-pointer transition-colors hover:bg-surface-2"
            >
              <td className="px-2 py-3">
                {/* Der Name ist der Knopf – so erreicht man jede Zeile auch per Tastatur. */}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(lead.id);
                  }}
                  className="block max-w-full truncate text-left font-semibold text-ink hover:underline"
                >
                  {leadName(lead)}
                </button>
                <span className="block truncate text-[12.5px] text-ink-3">
                  <span className="hidden sm:inline">{leadPosition(lead)} · </span>
                  {leadCompany(lead)}
                </span>
              </td>
              <td className="truncate px-3 py-3 text-ink-2">{LEAD_STAGE_LABELS[lead.stage]}</td>
              <td className="hidden px-3 py-3 text-ink-2 sm:table-cell">
                <ScoreBadge lead={lead} />
              </td>
              {showOwner && <td className="hidden px-3 py-3 text-ink-2 md:table-cell">{FOUNDERS[lead.owner].name}</td>}
              <td className="hidden truncate px-3 py-3 text-ink-2 lg:table-cell">{lead.nextStep ?? null}</td>
              <td className="hidden px-2 py-3 text-right text-[12.5px] tabular-nums text-ink-3 sm:table-cell">{formatRelative(lead.lastActivityAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
