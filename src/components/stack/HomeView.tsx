import { motion } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { FOUNDERS } from '../../data/founders';
import { formatDuration, formatLongDate, greetingForTime } from '../../lib/time';
import { useHotkeys } from '../../lib/useHotkeys';
import { founderCards, useDemo } from '../../state/demo';
import type { FounderId } from '../../state/types';
import { Button } from '../ui/Button';
import { TYPE_ORDER, daySummary, typeLabel } from './summary';

/** Ruhige Startseite: wie viel heute ansteht – und ein einziger Button zum Loslegen. */
export function HomeView() {
  const { state, dispatch } = useDemo();
  const founder = state.founder as FounderId;
  const all = founderCards(state, founder);
  const pending = all.filter((card) => card.status === 'pending');
  const doneCount = all.length - pending.length;
  const freshReply = pending.some((card) => card.leadId === state.slackToast?.leadId);
  const minutes = Math.max(1, Math.ceil((pending.length * 15) / 60));
  const start = () => dispatch({ type: 'START_FOCUS', filter: 'all' });

  useHotkeys({ enter: start }, pending.length > 0 && !state.panelLeadId);

  return (
    <div className="flex min-h-[calc(100dvh-57px)] flex-col items-center justify-center px-5 pb-28 pt-12 text-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
        className="flex flex-col items-center"
      >
        <p className="text-[14px] font-medium text-ink-3">{formatLongDate(Date.now())}</p>
        <h1 className="display mt-2 text-[34px] font-semibold text-ink-2 sm:text-[40px]">
          {greetingForTime()}, <span className="text-ink">{FOUNDERS[founder].name}.</span>
        </h1>

        {pending.length > 0 ? (
          <>
            <p className="display mt-14 text-[96px] font-semibold leading-none tracking-[-0.04em] sm:text-[120px]" data-testid="open-count">
              {pending.length}
            </p>
            <p className="mt-3 text-[19px] text-ink-2">
              {doneCount === 0 ? 'Aufgaben für heute' : `${pending.length === 1 ? 'Aufgabe' : 'Aufgaben'} offen · ${doneCount} erledigt`}
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-x-1 gap-y-1">
              {TYPE_ORDER.map((type) => {
                const count = pending.filter((card) => card.type === type).length;
                if (count === 0) return null;
                return (
                  <button
                    key={type}
                    type="button"
                    data-testid={`start-${type}`}
                    onClick={() => dispatch({ type: 'START_FOCUS', filter: type })}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[14px] text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink"
                  >
                    {type === 'reply' && freshReply && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                    <span className="tabular-nums text-ink-2">{count}</span> {typeLabel(type, count)}
                  </button>
                );
              })}
            </div>

            <Button
              variant="primary"
              size="xl"
              onClick={start}
              shortcut="↵"
              data-testid="start-focus"
              className="mt-12 h-16 px-8 text-[17px]"
            >
              {doneCount === 0 ? 'Aufgaben für heute abarbeiten' : 'Weiter abarbeiten'}
              <ArrowRight className="h-5 w-5" />
            </Button>
            <p className="mt-4 text-[13px] text-ink-3">Antworten zuerst · ca. {minutes} Min.</p>
          </>
        ) : (
          <AllDone />
        )}
      </motion.div>
    </div>
  );
}

function AllDone() {
  const { state, dispatch } = useDemo();
  const summary = daySummary(founderCards(state, state.founder as FounderId));
  return (
    <>
      <div className="mt-14 flex h-20 w-20 items-center justify-center rounded-full bg-ink text-black shadow-[0_0_80px_rgb(255_255_255/0.22)]">
        <Check className="h-10 w-10" strokeWidth={2.6} />
      </div>
      <p className="display mt-8 text-[32px] font-semibold">Alles erledigt für heute 🎉</p>
      <p className="mt-3 text-[17px] text-ink-2">
        {summary.done} Aufgaben{summary.duration ? ` in ${formatDuration(summary.duration)}` : ''} erledigt.
      </p>
      <Button variant="primary" size="xl" className="mt-10" onClick={() => dispatch({ type: 'SET_VIEW', view: 'dashboard' })}>
        Zum Dashboard
        <ArrowRight className="h-4 w-4" />
      </Button>
    </>
  );
}
