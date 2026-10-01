import { AnimatePresence, motion, type Variants } from 'motion/react';
import { ArrowRight, Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { formatDuration } from '../../lib/time';
import { useHotkeys } from '../../lib/useHotkeys';
import { founderCards, pendingCards, useDemo } from '../../state/demo';
import type { CardState, CardType, FounderId, StackFilter } from '../../state/types';
import { Button } from '../ui/Button';
import { useActivity } from './ActivityToasts';
import { FirstMessageCard } from './FirstMessageCard';
import { FollowUpCard } from './FollowUpCard';
import { LeadCard } from './LeadCard';
import { ReplyCard } from './ReplyCard';
import type { CardProps, DecideArgs } from './cardTypes';
import { TYPE_LABELS, TYPE_ORDER, daySummary } from './summary';

const CARD_COMPONENTS: Record<CardType, ComponentType<CardProps>> = {
  reply: ReplyCard,
  followup: FollowUpCard,
  first: FirstMessageCard,
  lead: LeadCard,
};

const pageVariants: Variants = {
  enter: { opacity: 0, y: 32, scale: 0.98 },
  center: {
    opacity: 1,
    y: 0,
    x: 0,
    scale: 1,
    zIndex: 1,
    transition: { type: 'spring', bounce: 0, duration: 0.55, delay: 0.06 },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * 140,
    scale: 0.985,
    zIndex: 2,
    pointerEvents: 'none',
    transition: { duration: 0.32, ease: [0.32, 0.72, 0, 1] },
  }),
};

/** Fokus-Modus: genau eine Aufgabe füllt den Bildschirm. */
export function FocusView() {
  const { state, dispatch } = useDemo();
  const founder = state.founder as FounderId;
  const { push, undoLatest, busy } = useActivity();
  const [direction, setDirection] = useState(1);

  const all = founderCards(state, founder);
  const pendingAll = all.filter((card) => card.status === 'pending');
  const visible = pendingCards(state, founder, state.filter);
  const current = visible[0];
  const doneCount = all.length - pendingAll.length;
  const exit = () => dispatch({ type: 'SET_VIEW', view: 'home' });

  useHotkeys({ z: undoLatest, escape: exit }, !state.panelLeadId);

  const handleDecide = (card: CardState, args: DecideArgs) => {
    setDirection(args.positive ? 1 : -1);
    dispatch({
      type: 'DECIDE',
      payload: { cardId: card.id, decision: args.decision, event: args.event, message: args.message },
    });
    push(args.toast);
  };

  const CardComponent = current ? CARD_COMPONENTS[current.type] : null;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto grid h-16 max-w-[1240px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
          <div>
            <Button variant="ghost" size="sm" onClick={exit} icon={<X className="h-4 w-4" />} shortcut="Esc">
              Beenden
            </Button>
          </div>
          <p
            className={cn('text-[13px] font-medium tabular-nums text-ink-2 transition-opacity duration-200', busy && 'opacity-0')}
            data-testid="progress"
          >
            {doneCount} von {all.length} erledigt
          </p>
          <div className="flex justify-end">{pendingAll.length > 0 && <FilterMenu pending={pendingAll} />}</div>
        </div>
        <div className="h-px bg-white/[0.08]">
          <motion.div
            className="h-px bg-ink"
            initial={false}
            animate={{ width: `${all.length ? (doneCount / all.length) * 100 : 0}%` }}
            transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
          />
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)]">
        <AnimatePresence custom={direction} initial={false}>
          {current && CardComponent ? (
            <motion.div
              key={current.id}
              custom={direction}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="relative bg-black [grid-area:1/1]"
              data-testid="stack-card"
              data-card-type={current.type}
              data-card-id={current.id}
            >
              <CardComponent
                card={current}
                onDecide={(args) => handleDecide(current, args)}
                onOpenLead={(leadId) => dispatch({ type: 'OPEN_PANEL', leadId })}
                hotkeysEnabled={!state.panelLeadId}
              />
            </motion.div>
          ) : (
            <motion.div
              key={pendingAll.length === 0 ? 'done' : `empty-${state.filter}`}
              className="[grid-area:1/1]"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0, transition: { type: 'spring', bounce: 0, duration: 0.55, delay: 0.15 } }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
            >
              {pendingAll.length === 0 ? <DonePage cards={all} /> : <FilterDonePage remaining={pendingAll.length} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FilterMenu({ pending }: { pending: CardState[] }) {
  const { state, dispatch } = useDemo();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const options: { value: StackFilter; label: string; count: number }[] = [
    { value: 'all', label: 'Alle Aufgaben', count: pending.length },
    ...TYPE_ORDER.map((type) => ({
      value: type as StackFilter,
      label: TYPE_LABELS[type].many.replace(/^n/, 'N'),
      count: pending.filter((card) => card.type === type).length,
    })),
  ];
  const active = options.find((option) => option.value === state.filter) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="filter-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink"
      >
        {active.label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 top-10 z-40 w-[220px] overflow-hidden rounded-2xl border border-line-strong bg-surface-3 p-1.5 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.85)]"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={option.value === state.filter}
                disabled={option.count === 0}
                onClick={() => {
                  dispatch({ type: 'SET_FILTER', filter: option.value });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] text-ink transition-colors hover:bg-white/[0.06] disabled:text-ink-4"
              >
                <span className="flex w-4 justify-center">
                  {option.value === state.filter && <Check className="h-4 w-4" strokeWidth={2.5} />}
                </span>
                <span className="flex-1">{option.label}</span>
                <span className="tabular-nums text-ink-3">{option.count}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-65px)] flex-col items-center justify-center px-5 pb-24 pt-10 text-center">
      {children}
    </div>
  );
}

function DonePage({ cards }: { cards: CardState[] }) {
  const { dispatch } = useDemo();
  const summary = daySummary(cards);
  const stats = summary.stats.filter((stat) => stat.value > 0);

  return (
    <CenteredPage>
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.4, duration: 0.6, delay: 0.25 }}
        className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-ink text-black shadow-[0_0_80px_rgb(255_255_255/0.22)]"
      >
        <Check className="h-10 w-10" strokeWidth={2.6} />
      </motion.div>
      <h1 className="display text-[36px] font-semibold sm:text-[48px]">Alles erledigt für heute 🎉</h1>
      <p className="mt-3 text-[17px] text-ink-2">
        {summary.done} Aufgaben{summary.duration ? ` in ${formatDuration(summary.duration)}` : ''} erledigt.
      </p>

      <dl className="mt-12 grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dd className="display text-[40px] font-semibold">{stat.value}</dd>
            <dt className="mt-1 text-[13px] text-ink-3">{stat.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-14 flex flex-wrap justify-center gap-2">
        <Button variant="primary" size="xl" onClick={() => dispatch({ type: 'SET_VIEW', view: 'dashboard' })}>
          Zum Dashboard
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="xl" onClick={() => dispatch({ type: 'SET_VIEW', view: 'home' })}>
          Zur Übersicht
        </Button>
      </div>
    </CenteredPage>
  );
}

function FilterDonePage({ remaining }: { remaining: number }) {
  const { state, dispatch } = useDemo();
  const label = { all: 'Aufgaben', reply: 'Antworten', followup: 'Follow-ups', first: 'Erstnachrichten', lead: 'neuen Leads' }[state.filter];

  useHotkeys({ enter: () => dispatch({ type: 'SET_FILTER', filter: 'all' }) });

  return (
    <CenteredPage>
      <h1 className="display text-[32px] font-semibold sm:text-[40px]">Alle {label} erledigt</h1>
      <p className="mt-3 text-[17px] text-ink-2">
        Es warten noch {remaining} weitere {remaining === 1 ? 'Aufgabe' : 'Aufgaben'}.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-2">
        <Button variant="primary" size="xl" shortcut="↵" onClick={() => dispatch({ type: 'SET_FILTER', filter: 'all' })}>
          Mit allen weitermachen
        </Button>
        <Button variant="ghost" size="xl" onClick={() => dispatch({ type: 'SET_VIEW', view: 'home' })}>
          Zur Übersicht
        </Button>
      </div>
    </CenteredPage>
  );
}

