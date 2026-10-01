import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { fullName, initials } from '../../lib/leadInfo';
import type { Lead } from '../../state/types';
import { Avatar } from '../ui/Avatar';

interface CardShellProps {
  typeLabel: string;
  typeIcon: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  badge?: ReactNode;
}

export function CardShell({ typeLabel, typeIcon, meta, children, footer, badge }: CardShellProps) {
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-[28px] border border-line-strong bg-surface-1',
        'shadow-[0_1px_0_rgb(255_255_255/0.06)_inset,0_30px_80px_-30px_rgb(0_0_0/0.9)]',
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 sm:px-8 sm:pt-6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 items-center gap-2 rounded-full bg-white/[0.06] pl-2 pr-3 text-[12.5px] font-medium text-ink [&>svg]:h-3.5 [&>svg]:w-3.5">
            {typeIcon}
            {typeLabel}
          </span>
          {badge}
        </div>
        {meta && <div className="flex items-center gap-1.5 text-[12.5px] text-ink-2 [&>svg]:h-3.5 [&>svg]:w-3.5">{meta}</div>}
      </header>
      <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-7">{children}</div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-white/[0.015] px-6 py-4 sm:px-8">{footer}</footer>
    </article>
  );
}

interface LeadRowProps {
  lead: Lead;
  onOpen: () => void;
  size?: 'lg' | 'md';
  aside?: ReactNode;
}

export function LeadRow({ lead, onOpen, size = 'md', aside }: LeadRowProps) {
  const name = fullName(lead);
  const large = size === 'lg';
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar name={name} initials={initials(lead)} size={large ? 64 : 46} />
        <div className="min-w-0">
          <button
            type="button"
            onClick={onOpen}
            className={cn(
              'group -mx-1 flex items-center gap-1 rounded-md px-1 text-left font-semibold text-ink transition-colors hover:text-white',
              large ? 'display text-[26px]' : 'text-[17px] tracking-[-0.015em]',
            )}
            title="Lead-Historie öffnen"
          >
            <span className="decoration-white/30 underline-offset-4 group-hover:underline">{name}</span>
            <ChevronRight
              className={cn(
                'shrink-0 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink-2',
                large ? 'h-5 w-5' : 'h-4 w-4',
              )}
            />
          </button>
          <p className={cn('truncate text-ink-2', large ? 'mt-1 text-[15px]' : 'text-[13.5px]')}>
            {lead.position} · {lead.company}
          </p>
        </div>
      </div>
      {aside}
    </div>
  );
}

export function SectionLabel({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3 [&>svg]:h-3.5 [&>svg]:w-3.5', className)}>
      {icon}
      {children}
    </div>
  );
}

/** Abstandshalter in der Fußzeile, damit positive Aktionen rechts stehen. */
export function FooterSpacer() {
  return <div className="flex-1" />;
}
