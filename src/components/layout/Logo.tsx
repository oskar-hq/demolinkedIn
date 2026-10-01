import { cn } from '../../lib/cn';

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="7.5" width="15" height="11" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.6" />
      <rect x="6" y="4.5" width="15" height="11" rx="3" fill="currentColor" />
    </svg>
  );
}

export function Logo({ alwaysShowName = false }: { alwaysShowName?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-ink">
      <LogoMark />
      <span className={cn('whitespace-nowrap text-[15px] font-semibold tracking-[-0.02em]', !alwaysShowName && 'hidden sm:inline')}>
        Outreach Cockpit
      </span>
    </div>
  );
}
