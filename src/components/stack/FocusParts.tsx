import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { fullName, initials } from '../../lib/leadInfo';
import type { Lead } from '../../state/types';
import { Avatar } from '../ui/Avatar';

/** Eine Aufgabe = eine Seite: Inhalt mittig, Entscheidung unten in fester Position. */
export function FocusPage({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-64px)] flex-col">
      <div className="flex flex-1 flex-col items-center px-5 pb-10 pt-8 sm:pt-11">
        <div className="w-full max-w-[600px]">{children}</div>
      </div>
      <div className="sticky bottom-0 z-10 bg-gradient-to-t from-black from-65% to-transparent px-5 pb-6 pt-10">
        <div className="mx-auto grid w-full max-w-[600px] grid-cols-2 gap-3">{actions}</div>
      </div>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-6 text-center text-[12px] font-medium uppercase tracking-[0.1em] text-ink-3">{children}</p>
  );
}

interface PersonHeaderProps {
  lead: Lead;
  onOpen: () => void;
  subtitle?: ReactNode;
  children?: ReactNode;
  avatarSize?: number;
}

/** Zentrierter Kopf: Profilbild, Name (öffnet die Historie), Position und Firma. */
export function PersonHeader({ lead, onOpen, subtitle, children, avatarSize = 72 }: PersonHeaderProps) {
  const name = fullName(lead);
  return (
    <div className="flex flex-col items-center text-center">
      <Avatar name={name} initials={initials(lead)} size={avatarSize} />
      <button
        type="button"
        onClick={onOpen}
        title="Lead-Historie öffnen"
        className="group mt-5 flex items-center gap-1 rounded-lg px-1 font-semibold text-ink"
      >
        <span className="display text-[30px] decoration-white/30 underline-offset-[6px] group-hover:underline sm:text-[36px]">
          {name}
        </span>
        <ChevronRight className="h-6 w-6 shrink-0 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink-2" />
      </button>
      <p className="mt-1.5 text-[16px] text-ink-2">
        {lead.position} · {lead.company}
      </p>
      {subtitle && <p className="mt-1 text-[14px] text-ink-3">{subtitle}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
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
