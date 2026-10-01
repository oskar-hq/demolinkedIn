import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  shortcut?: string;
  highlight?: boolean;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel: string;
}

/** Apple-artige Segmentsteuerung mit gleitender Auswahl. */
export function Segmented<T extends string>({ options, value, onChange, size = 'md', className, ariaLabel }: SegmentedProps<T>) {
  const layoutId = useId();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-white/[0.03] p-1', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 rounded-full font-medium transition-colors duration-150',
              size === 'md' ? 'h-8 px-3.5 text-[13px]' : 'h-7 px-3 text-[12.5px]',
              active ? 'text-black' : 'text-ink-2 hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-ink"
                transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {option.label}
              {option.count !== undefined && (
                <span
                  className={cn(
                    'min-w-[18px] rounded-full px-1 text-center text-[11px] tabular-nums',
                    active ? 'bg-black/10 text-black/70' : 'bg-white/[0.08] text-ink-2',
                  )}
                >
                  {option.count}
                </span>
              )}
              {option.highlight && !active && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
              {option.shortcut && (
                <span className={cn('hidden text-[11px] md:inline', active ? 'text-black/45' : 'text-ink-3')}>{option.shortcut}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
