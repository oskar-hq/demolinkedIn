import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DayStat, RateStat } from '../../data/dashboard';
import { formatInt, formatPercent, formatShortDate, formatWeekdayDate } from '../../lib/format';
import { CHART, TooltipBox } from './ChartParts';

const axisProps = {
  stroke: 'transparent',
  tick: { fill: CHART.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/* ───────────── Anfragen & Antworten pro Tag ───────────── */

export function ActivityChart({ days }: { days: DayStat[] }) {
  const data = days.map((day) => ({ date: day.date, Anfragen: day.requests, Antworten: day.replies }));
  const ticks = data.filter((_, index) => (data.length - 1 - index) % 7 === 0).map((entry) => entry.date);

  return (
    <div className="h-[280px]" role="img" aria-label="Liniendiagramm: Anfragen und Antworten pro Tag, letzte 8 Wochen">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="fill-requests" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.12} />
              <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fill-replies" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} ticks={ticks} tickFormatter={formatShortDate} {...axisProps} dy={6} />
          <YAxis allowDecimals={false} {...axisProps} width={44} />
          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}
            content={(props) => {
              if (!props.active || !props.payload?.length) return null;
              const entry = props.payload[0].payload as (typeof data)[number];
              return (
                <TooltipBox
                  title={formatWeekdayDate(entry.date)}
                  rows={[
                    { color: CHART.primary, label: 'Anfragen', value: formatInt(entry.Anfragen) },
                    { color: CHART.accent, label: 'Antworten', value: formatInt(entry.Antworten) },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="Anfragen"
            stroke={CHART.primary}
            strokeWidth={2}
            fill="url(#fill-requests)"
            activeDot={{ r: 4, fill: CHART.primary, stroke: CHART.surface, strokeWidth: 2 }}
            animationDuration={700}
          />
          <Area
            type="monotone"
            dataKey="Antworten"
            stroke={CHART.accent}
            strokeWidth={2}
            fill="url(#fill-replies)"
            activeDot={{ r: 4, fill: CHART.accent, stroke: CHART.surface, strokeWidth: 2 }}
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───────────── Antwortquote je Template / Stufe ───────────── */

export function RateBarChart({ data, ariaLabel }: { data: RateStat[]; ariaLabel: string }) {
  const best = Math.max(...data.map((entry) => entry.rate));
  const chartData = data.map((entry) => ({ ...entry, value: entry.rate * 100 }));

  return (
    <div className="h-[230px]" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 24, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="label" {...axisProps} interval={0} dy={6} />
          <YAxis hide domain={[0, best * 100 * 1.15]} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)', radius: 8 }}
            content={(props) => {
              if (!props.active || !props.payload?.length) return null;
              const entry = props.payload[0].payload as (typeof chartData)[number];
              return (
                <TooltipBox
                  title={entry.label}
                  rows={[
                    {
                      color: entry.rate === best ? CHART.accent : CHART.primary,
                      label: 'Antwortquote',
                      value: formatPercent(entry.rate),
                      shape: 'square',
                    },
                  ]}
                  footnote={`${formatInt(entry.replies)} Antworten auf ${formatInt(entry.sent)} Nachrichten`}
                />
              );
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={700}>
            {chartData.map((entry) => (
              <Cell key={entry.key} fill={entry.rate === best ? CHART.accent : CHART.primary} />
            ))}
            <LabelList
              dataKey="value"
              content={(props) => {
                const x = Number(props.x ?? 0);
                const y = Number(props.y ?? 0);
                const width = Number(props.width ?? 0);
                return (
                  <text x={x + width / 2} y={y - 8} textAnchor="middle" fill="#f5f5f7" fontSize={12} fontWeight={600}>
                    {formatPercent(Number(props.value) / 100)}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───────────── Termine pro Woche: Nick vs. Johannes ───────────── */

export interface WeekCompare {
  week: string;
  Nick: number;
  Johannes: number;
}

export function WeeklyCompareChart({ data }: { data: WeekCompare[] }) {
  return (
    <div className="h-[240px]" role="img" aria-label="Säulendiagramm: Termine pro Woche, Nick und Johannes">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="week" {...axisProps} dy={6} />
          <YAxis allowDecimals={false} {...axisProps} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)', radius: 8 }}
            content={(props) => {
              if (!props.active || !props.payload?.length) return null;
              const entry = props.payload[0].payload as WeekCompare;
              return (
                <TooltipBox
                  title={`Termine ${entry.week}`}
                  rows={[
                    { color: CHART.primary, label: 'Nick', value: formatInt(entry.Nick), shape: 'square' },
                    { color: CHART.accent, label: 'Johannes', value: formatInt(entry.Johannes), shape: 'square' },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="Nick" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={14} animationDuration={700} />
          <Bar dataKey="Johannes" fill={CHART.accent} radius={[4, 4, 0, 0]} maxBarSize={14} animationDuration={700} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
