import { motion, useTransform, type MotionValue } from 'motion/react';
import { ArrowLeft, ArrowRight, ChevronRight, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { fullName, initials } from '../../lib/leadInfo';
import type { Lead } from '../../state/types';
import { Avatar } from '../ui/Avatar';
import { useSwipeContext, type SwipeActions } from './swipe';

/** Eine Aufgabe = eine Seite: Inhalt mittig, Entscheidung unten in fester Position. */
export function FocusPage({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  const swipe = useSwipeContext();
  return (
    <div className="relative flex min-h-[calc(100dvh-64px)] flex-col">
      {swipe?.actionsRef.current && <SwipeHints x={swipe.x} actions={swipe.actionsRef.current} />}
      <div className="flex flex-1 flex-col items-center px-5 pb-10 pt-6 sm:pt-8">
        <div className="w-full max-w-[600px]">{children}</div>
      </div>
      <div className="sticky bottom-0 z-10 bg-gradient-to-t from-black from-70% to-transparent px-5 pb-5 pt-7">
        <div className="mx-auto grid w-full max-w-[600px] grid-cols-2 gap-3">{actions}</div>
      </div>
    </div>
  );
}

/**
 * Hinweis in Richtung der Geste: Schon während des Wischens zeigt ein Label, welche Entscheidung
 * gleich fällt – es blendet proportional zur Auslenkung ein.
 */
function SwipeHints({ x, actions }: { x: MotionValue<number>; actions: SwipeActions }) {
  const rightOpacity = useTransform(x, [24, 140], [0, 1]);
  const leftOpacity = useTransform(x, [-140, -24], [1, 0]);
  const rightScale = useTransform(x, [24, 140], [0.9, 1]);
  const leftScale = useTransform(x, [-140, -24], [1, 0.9]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[18px] z-20 flex justify-center sm:top-[26px]">
      <motion.span
        style={{ opacity: rightOpacity, scale: rightScale }}
        className={cn(
          'absolute flex h-9 items-center gap-2 rounded-full px-4 text-[14px] font-semibold shadow-[0_12px_32px_-8px_rgb(0_0_0/0.8)]',
          actions.right.enabled === false ? 'bg-surface-4 text-ink-3' : 'bg-ink text-black',
        )}
      >
        {actions.right.label}
        <ArrowRight className="h-4 w-4" />
      </motion.span>
      <motion.span
        style={{ opacity: leftOpacity, scale: leftScale }}
        className="absolute flex h-9 items-center gap-2 rounded-full border border-line-strong bg-surface-3 px-4 text-[14px] font-semibold text-ink shadow-[0_12px_32px_-8px_rgb(0_0_0/0.8)]"
      >
        <ArrowLeft className="h-4 w-4" />
        {actions.left.label}
      </motion.span>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const swipe = useSwipeContext();
  const className = 'mb-5 text-center text-[12px] font-medium uppercase tracking-[0.1em] text-ink-3';
  return swipe ? (
    <SwipeAwareEyebrow x={swipe.x} className={className}>
      {children}
    </SwipeAwareEyebrow>
  ) : (
    <p className={className}>{children}</p>
  );
}

/** Die Überschrift weicht dem Richtungs-Hinweis, der an ihrer Stelle erscheint. */
function SwipeAwareEyebrow({ x, className, children }: { x: MotionValue<number>; className: string; children: ReactNode }) {
  const opacity = useTransform(x, [-60, -16, 16, 60], [0, 1, 1, 0]);
  return (
    <motion.p style={{ opacity }} className={className}>
      {children}
    </motion.p>
  );
}

interface PersonHeaderProps {
  lead: Lead;
  onOpen: () => void;
  subtitle?: ReactNode;
  children?: ReactNode;
  /** Kompakter Kopf für Seiten mit Nachrichtenfeld. */
  compact?: boolean;
}

/** Zentrierter Kopf: Profilbild, Name (öffnet die Historie), Position und Firma. */
export function PersonHeader({ lead, onOpen, subtitle, children, compact = false }: PersonHeaderProps) {
  const name = fullName(lead);
  return (
    <div className="flex flex-col items-center text-center">
      <Avatar name={name} initials={initials(lead)} size={compact ? 44 : 72} />
      <button
        type="button"
        onClick={onOpen}
        title="Lead-Historie öffnen"
        className={cn('group flex items-center gap-1 rounded-lg px-1 font-semibold text-ink', compact ? 'mt-3' : 'mt-5')}
      >
        <span
          className={cn(
            'display decoration-white/30 underline-offset-[6px] group-hover:underline',
            compact ? 'text-[28px] sm:text-[30px]' : 'text-[30px] sm:text-[36px]',
          )}
        >
          {name}
        </span>
        <ChevronRight className="h-6 w-6 shrink-0 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink-2" />
      </button>
      <p className="mt-1.5 text-[16px] text-ink-2">
        {lead.position} · {lead.company}
      </p>
      {subtitle && <p className="mt-1 text-[14px] text-ink-3">{subtitle}</p>}
      {children && <div className={cn('flex flex-wrap justify-center gap-2', compact ? 'mt-3' : 'mt-5')}>{children}</div>}
    </div>
  );
}

/** Kleiner Abschnitt ohne Rahmen: Label + Inhalt. */
export function Block({ label, icon, children, className }: { label: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mt-10', className)}>
      <h2 className="mb-2.5 flex items-center justify-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        {label}
      </h2>
      {children}
    </section>
  );
}

/** KI-Zusammenfassung zum Lead – Kontext, um die Nachricht passend anzupassen. */
export function AiSummary({ text }: { text: string }) {
  return (
    <section className="mx-auto mt-5 max-w-[540px] text-center" data-testid="ai-summary">
      <h2 className="mb-1.5 flex items-center justify-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
        <Sparkles className="h-3.5 w-3.5" />
        KI-Zusammenfassung
      </h2>
      <p className="text-[14.5px] leading-[1.6] text-ink-2">{text}</p>
    </section>
  );
}
