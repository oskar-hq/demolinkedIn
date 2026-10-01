import { motion } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { formatDuration } from '../../lib/time';
import { useDemo } from '../../state/demo';
import type { CardState, Decision } from '../../state/types';
import { Button } from '../ui/Button';

export function EmptyState({ cards }: { cards: CardState[] }) {
  const { dispatch } = useDemo();
  const done = cards.filter((card) => card.status === 'done');
  const count = (decision: Decision, type?: CardState['type']) =>
    done.filter((card) => card.decision === decision && (!type || card.type === type)).length;
  const times = done.map((card) => card.decidedAt ?? 0).filter(Boolean);
  const duration = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;

  const stats = [
    { label: 'Vernetzungsanfragen', value: count('connect') },
    { label: 'Erstnachrichten', value: count('send', 'first') },
    { label: 'Follow-ups', value: count('send', 'followup') },
    { label: 'Exporte nach Close', value: count('export') },
    { label: 'Aussortiert', value: count('reject') },
    { label: 'Übersprungen / verworfen', value: count('skip') + count('discard') },
  ];

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-line-strong bg-surface-1 px-6 pb-8 pt-12 text-center sm:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-72 w-[520px] rounded-full bg-white/[0.06] blur-3xl"
      />
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.4, duration: 0.6, delay: 0.2 }}
        className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-ink text-black shadow-[0_0_60px_rgb(255_255_255/0.25)]"
      >
        <Check className="h-8 w-8" strokeWidth={2.6} />
      </motion.div>
      <h2 className="display relative text-[32px] font-semibold sm:text-[38px]">Alles erledigt für heute 🎉</h2>
      <p className="relative mx-auto mt-3 max-w-md text-[15.5px] text-ink-2">
        {done.length} Karten in {duration ? formatDuration(duration) : 'Rekordzeit'} durchgearbeitet
        {duration && done.length > 1 ? ` – im Schnitt ${Math.max(1, Math.round(duration / 1000 / done.length))} Sek. pro Karte.` : '.'}
        {' '}Neue Leads und Antworten landen morgen früh wieder hier.
      </p>

      <dl className="relative mx-auto mt-8 grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-surface-1 px-4 py-4 text-left">
            <dd className="display text-[28px] font-semibold">{stat.value}</dd>
            <dt className="mt-0.5 text-[12.5px] text-ink-3">{stat.label}</dt>
          </div>
        ))}
      </dl>

      <div className="relative mt-8 flex flex-wrap justify-center gap-2">
        <Button variant="primary" size="lg" onClick={() => dispatch({ type: 'SET_VIEW', view: 'dashboard' })}>
          Zum Dashboard
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
