import { AnimatePresence, motion, type Variants } from 'motion/react';
import { useState, type ComponentType } from 'react';
import { FOUNDERS } from '../../data/founders';
import { LEADS_BY_ID } from '../../data/leads';
import { formatLongDate, greetingForTime } from '../../lib/time';
import { useHotkeys } from '../../lib/useHotkeys';
import { founderCards, pendingCards, useDemo } from '../../state/demo';
import type { CardState, CardType, FounderId, StackFilter } from '../../state/types';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { Segmented } from '../ui/Segmented';
import { useActivity } from './ActivityToasts';
import { EmptyState } from './EmptyState';
import { FirstMessageCard } from './FirstMessageCard';
import { FollowUpCard } from './FollowUpCard';
import { LeadCard } from './LeadCard';
import { ReplyCard } from './ReplyCard';
import type { CardProps, DecideArgs } from './cardTypes';

const CARD_COMPONENTS: Record<CardType, ComponentType<CardProps>> = {
  reply: ReplyCard,
  followup: FollowUpCard,
  first: FirstMessageCard,
  lead: LeadCard,
};

const FILTER_LABELS: Record<CardType, string> = {
  reply: 'Antworten',
  followup: 'Follow-ups',
  first: 'Erstnachrichten',
  lead: 'Neue Leads',
};

const cardVariants: Variants = {
  enter: { opacity: 0, y: 28, scale: 0.965 },
  center: {
    opacity: 1,
    y: 0,
    x: 0,
    rotate: 0,
    scale: 1,
    zIndex: 1,
    transition: { type: 'spring', bounce: 0, duration: 0.5, delay: 0.04 },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * 160,
    y: -6,
    rotate: direction * 2.5,
    scale: 0.985,
    zIndex: 2,
    pointerEvents: 'none',
    transition: { duration: 0.34, ease: [0.32, 0.72, 0, 1] },
  }),
};

function shortcutsFor(card: CardState): [string[], string][] {
  const undo: [string[], string] = [['Z'], 'Rückgängig'];
  switch (card.type) {
    case 'lead':
      return [[['→'], 'Vernetzen'], [['←'], 'Nicht geeignet'], undo];
    case 'first':
      return [
        [['→'], 'Senden'],
        [['←'], 'Nicht senden'],
        [['E'], 'Bearbeiten'],
        ...(LEADS_BY_ID[card.leadId].signal.type === 'meta_ads' ? [[['1', '2'], 'Template'] as [string[], string]] : []),
        undo,
      ];
    case 'followup':
      return [[['→'], 'Senden'], [['←'], 'Nicht senden'], [['E'], 'Bearbeiten'], [['1', '4'], 'Variante'], [['V'], 'Verlauf'], undo];
    case 'reply':
      return [[['→'], 'In Close exportieren'], [['←'], 'Verwerfen'], undo];
  }
}

export function StackView() {
  const { state, dispatch } = useDemo();
  const founder = state.founder as FounderId;
  const { push, undoLatest } = useActivity();
  const [direction, setDirection] = useState(1);

  const all = founderCards(state, founder);
  const pendingAll = all.filter((card) => card.status === 'pending');
  const visible = pendingCards(state, founder, state.filter);
  const current = visible[0];
  const doneCount = all.length - pendingAll.length;
  const progress = all.length ? doneCount / all.length : 0;
  const counts = (type: CardType) => pendingAll.filter((card) => card.type === type).length;
  const freshReply = pendingAll.some((card) => card.type === 'reply' && card.leadId === state.slackToast?.leadId);

  useHotkeys({ z: undoLatest }, !state.panelLeadId);

  const handleDecide = (card: CardState, args: DecideArgs) => {
    setDirection(args.positive ? 1 : -1);
    dispatch({
      type: 'DECIDE',
      payload: { cardId: card.id, decision: args.decision, event: args.event, message: args.message },
    });
    push(args.toast);
  };

  const CardComponent = current ? CARD_COMPONENTS[current.type] : null;
  const filterOptions = [
    { value: 'all' as StackFilter, label: 'Alle', count: pendingAll.length },
    ...(['reply', 'followup', 'first', 'lead'] as CardType[]).map((type) => ({
      value: type as StackFilter,
      label: FILTER_LABELS[type],
      count: counts(type),
      highlight: type === 'reply' && freshReply,
    })),
  ];

  return (
    <div className="mx-auto w-full max-w-[800px] px-4 pb-36 pt-8 sm:px-6 sm:pt-12">
      <header className="mb-8">
        <p className="text-[13px] font-medium text-ink-3">{formatLongDate(Date.now())}</p>
        <h1 className="display mt-1.5 text-[34px] font-semibold sm:text-[44px]">
          {greetingForTime()}, {FOUNDERS[founder].name}.
        </h1>
        <p className="mt-2 text-[16px] text-ink-2">
          {pendingAll.length > 0
            ? `${pendingAll.length} ${pendingAll.length === 1 ? 'Karte wartet' : 'Karten warten'} auf dich – Antworten zuerst.`
            : 'Dein Stapel für heute ist leer.'}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-3">
          <span className="whitespace-nowrap text-[13.5px] font-medium text-ink" data-testid="progress">
            {doneCount} von {all.length} erledigt
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <motion.div
              className="h-full rounded-full bg-ink"
              initial={false}
              animate={{ width: `${progress * 100}%` }}
              transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
            />
          </div>
          <span className="w-11 whitespace-nowrap text-right text-[12.5px] tabular-nums text-ink-3">{Math.round(progress * 100)} %</span>
        </div>
      </div>

      <Segmented
        ariaLabel="Kartentyp filtern"
        className="mb-6"
        value={state.filter}
        onChange={(filter) => dispatch({ type: 'SET_FILTER', filter })}
        options={filterOptions}
      />

      <div className="relative">
        {current && visible.length > 1 && (
          <div aria-hidden className="pointer-events-none absolute inset-x-5 -bottom-2.5 h-12 rounded-b-[26px] border border-t-0 border-line bg-surface-1/70" />
        )}
        {current && visible.length > 2 && (
          <div aria-hidden className="pointer-events-none absolute inset-x-10 -bottom-5 h-12 rounded-b-[24px] border border-t-0 border-line bg-surface-1/40" />
        )}

        <div className="grid grid-cols-[minmax(0,1fr)]">
          <AnimatePresence custom={direction} initial={false}>
            {current && CardComponent ? (
              <motion.div
                key={current.id}
                custom={direction}
                variants={cardVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="relative [grid-area:1/1]"
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
                animate={{ opacity: 1, y: 0, transition: { type: 'spring', bounce: 0, duration: 0.5, delay: 0.12 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                {pendingAll.length === 0 ? (
                  <EmptyState cards={all} />
                ) : (
                  <div className="rounded-[28px] border border-line bg-surface-1 px-8 py-14 text-center">
                    <p className="display text-[22px] font-semibold">
                      Keine offenen {state.filter !== 'all' ? FILTER_LABELS[state.filter] : 'Karten'} mehr
                    </p>
                    <p className="mt-2 text-ink-2">In den anderen Kategorien warten noch {pendingAll.length} Karten.</p>
                    <Button variant="primary" className="mt-6" onClick={() => dispatch({ type: 'SET_FILTER', filter: 'all' })}>
                      Alle offenen Karten anzeigen
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {current && (
        <div className="mt-10 hidden flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] text-ink-3 md:flex">
          {shortcutsFor(current).map(([keys, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              {keys.map((key, index) => (
                <span key={key} className="flex items-center gap-1.5">
                  {index > 0 && '–'}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
