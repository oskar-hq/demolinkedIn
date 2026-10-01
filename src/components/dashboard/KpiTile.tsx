import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { CHART } from './ChartParts';

interface KpiTileProps {
  label: string;
  value: string;
  delta: string;
  up: boolean;
  caption: string;
  trend: number[];
}

function Sparkline({ values }: { values: number[] }) {
  const width = 96;
  const height = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * (width - 6) + 3,
    height - 4 - ((value - min) / range) * (height - 8),
  ]);
  const path = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="hidden h-8 w-[96px] shrink-0 sm:block" aria-hidden>
      <path d={path} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={4} fill={CHART.accent} stroke={CHART.surface} strokeWidth={2} />
    </svg>
  );
}

export function KpiTile({ label, value, delta, up, caption, trend }: KpiTileProps) {
  return (
    <div className="flex flex-col justify-between rounded-[22px] border border-line bg-surface-1 p-5">
      <p className="text-[13px] font-medium text-ink-2">{label}</p>
      <p className="display mt-3 text-[34px] font-semibold">{value}</p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 whitespace-nowrap text-[12.5px] font-medium text-ink">
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full',
                up ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad',
              )}
            >
              {up ? <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} /> : <ArrowDownRight className="h-3 w-3" strokeWidth={2.5} />}
            </span>
            {delta}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{caption}</p>
        </div>
        <Sparkline values={trend} />
      </div>
    </div>
  );
}
