import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import {
  DAILY,
  VISIBLE_DAYS,
  dailyFor,
  stageStats,
  sumDays,
  templateStats,
  type DayStat,
  type LiveAdds,
  type Scope,
} from '../../data/dashboard';
import { FOUNDERS } from '../../data/founders';
import { formatDeltaPercent, formatInt, formatPercent, formatPoints, isoWeek } from '../../lib/format';
import { formatTime } from '../../lib/time';
import { useDemo } from '../../state/demo';
import type { FounderId } from '../../state/types';
import { Segmented } from '../ui/Segmented';
import { CHART, ChartCard, Legend, LegendKey } from './ChartParts';
import { ActivityChart, RateBarChart, WeeklyCompareChart, type WeekCompare } from './Charts';
import { KpiTile } from './KpiTile';

const ratio = (a: number, b: number) => (b ? a / b : 0);

function weeks(days: DayStat[], count: number): DayStat[][] {
  const result: DayStat[][] = [];
  for (let i = count; i > 0; i--) {
    result.push(days.slice(days.length - i * 7, days.length - (i - 1) * 7));
  }
  return result;
}

function useLiveAdds(): Record<FounderId, LiveAdds> {
  const { state } = useDemo();
  return useMemo(() => {
    const adds: Record<FounderId, LiveAdds> = {
      nick: { requests: 0, messaged: 0, replies: 0, exports: 0 },
      johannes: { requests: 0, messaged: 0, replies: 0, exports: 0 },
    };
    for (const card of Object.values(state.cards)) {
      if (card.status !== 'done') continue;
      const add = adds[card.owner];
      if (card.decision === 'connect') add.requests++;
      if (card.decision === 'send' && card.type === 'first') add.messaged++;
      if (card.decision === 'export') add.exports++;
    }
    (Object.keys(state.pinged) as FounderId[]).forEach((founder) => {
      if (state.pinged[founder]) adds[founder].replies++;
    });
    return adds;
  }, [state.cards, state.pinged]);
}

export function DashboardView() {
  const [scope, setScope] = useState<Scope>('all');
  const live = useLiveAdds();
  const days = useMemo(() => dailyFor(scope, live), [scope, live]);
  const visible = days.slice(-VISIBLE_DAYS);
  const thisWeek = sumDays(days.slice(-7));
  const lastWeek = sumDays(days.slice(-14, -7));
  const eightWeeks = weeks(days, 8).map(sumDays);
  const total = sumDays(visible);

  const kpis = [
    {
      label: 'Anfragen diese Woche',
      value: formatInt(thisWeek.requests),
      delta: formatDeltaPercent(thisWeek.requests, lastWeek.requests),
      up: thisWeek.requests >= lastWeek.requests,
      trend: eightWeeks.map((week) => week.requests),
    },
    {
      label: 'Annahmequote',
      value: formatPercent(ratio(thisWeek.accepted, thisWeek.requests)),
      delta: formatPoints(ratio(thisWeek.accepted, thisWeek.requests) - ratio(lastWeek.accepted, lastWeek.requests)),
      up: ratio(thisWeek.accepted, thisWeek.requests) >= ratio(lastWeek.accepted, lastWeek.requests),
      trend: eightWeeks.map((week) => ratio(week.accepted, week.requests)),
    },
    {
      label: 'Antwortquote',
      value: formatPercent(ratio(thisWeek.replies, thisWeek.messaged)),
      delta: formatPoints(ratio(thisWeek.replies, thisWeek.messaged) - ratio(lastWeek.replies, lastWeek.messaged)),
      up: ratio(thisWeek.replies, thisWeek.messaged) >= ratio(lastWeek.replies, lastWeek.messaged),
      trend: eightWeeks.map((week) => ratio(week.replies, week.messaged)),
    },
    {
      label: 'Termine',
      value: formatInt(thisWeek.meetings),
      delta: formatDeltaPercent(thisWeek.meetings, lastWeek.meetings),
      up: thisWeek.meetings >= lastWeek.meetings,
      trend: eightWeeks.map((week) => week.meetings),
    },
    {
      label: 'Exporte nach Close',
      value: formatInt(thisWeek.exports),
      delta: formatDeltaPercent(thisWeek.exports, lastWeek.exports),
      up: thisWeek.exports >= lastWeek.exports,
      trend: eightWeeks.map((week) => week.exports),
    },
  ];

  const funnel = [
    { label: 'Lead', sub: 'geprüft & angefragt', value: total.requests },
    { label: 'Vernetzt', sub: 'Anfrage angenommen', value: total.accepted },
    { label: 'Angeschrieben', sub: 'Erstnachricht gesendet', value: total.messaged },
    { label: 'Geantwortet', sub: 'inkl. Follow-ups', value: total.replies },
    { label: 'Termin', sub: 'Erstgespräch gebucht', value: total.meetings },
  ];

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-ink-3">Letzte 8 Wochen · aktualisiert {formatTime(Date.now())} Uhr</p>
          <h1 className="display mt-1.5 text-[34px] font-semibold sm:text-[44px]">Dashboard</h1>
        </div>
        <Segmented
          ariaLabel="Gründer filtern"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'Gesamt' },
            { value: 'nick', label: 'Nick' },
            { value: 'johannes', label: 'Johannes' },
          ]}
        />
      </header>

      <motion.div
        key={scope}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {kpis.map((kpi) => (
            <KpiTile key={kpi.label} {...kpi} caption="vs. Vorwoche" />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard
            className="lg:col-span-2"
            title="Anfragen und Antworten pro Tag"
            subtitle={`${formatInt(total.requests)} Anfragen · ${formatInt(total.replies)} Antworten in 8 Wochen`}
            legend={
              <Legend>
                <LegendKey color={CHART.primary} label="Anfragen" />
                <LegendKey color={CHART.accent} label="Antworten" />
              </Legend>
            }
          >
            <ActivityChart days={visible} />
          </ChartCard>

          <ChartCard title="Funnel" subtitle="Vom Lead zum Termin · 8 Wochen">
            <Funnel stages={funnel} />
          </ChartCard>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ChartCard title="Antwortquote je Template" subtitle="Inklusive Follow-ups · bestes Template hervorgehoben">
            <RateBarChart data={templateStats(scope)} ariaLabel="Säulendiagramm: Antwortquote je Template A, B und C" />
          </ChartCard>
          <ChartCard title="Antwortquote je Follow-up-Stufe" subtitle="Anteil der Angeschriebenen, die nach dieser Stufe antworten">
            <RateBarChart data={stageStats(scope)} ariaLabel="Säulendiagramm: Antwortquote je Follow-up-Stufe" />
          </ChartCard>
        </div>
      </motion.div>

      <FounderComparison />
    </div>
  );
}

function Funnel({ stages }: { stages: { label: string; sub: string; value: number }[] }) {
  const max = stages[0].value || 1;
  return (
    <ol className="space-y-1" aria-label="Funnel vom Lead zum Termin">
      {stages.map((stage, index) => {
        const previous = stages[index - 1];
        const last = index === stages.length - 1;
        return (
          <li key={stage.label}>
            {previous && (
              <p className="py-0.5 pl-0.5 text-[11.5px] tabular-nums text-ink-3">↓ {formatPercent(ratio(stage.value, previous.value))}</p>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13.5px] font-medium text-ink">
                {stage.label} <span className="font-normal text-ink-3">· {stage.sub}</span>
              </span>
              <span className="text-[13.5px] font-semibold tabular-nums text-ink">{formatInt(stage.value)}</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: last ? CHART.accent : CHART.primary }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(1.5, (stage.value / max) * 100)}%` }}
                transition={{ type: 'spring', bounce: 0, duration: 0.9, delay: 0.05 * index }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function FounderComparison() {
  const totals = {
    nick: sumDays(DAILY.nick.slice(-VISIBLE_DAYS)),
    johannes: sumDays(DAILY.johannes.slice(-VISIBLE_DAYS)),
  };
  const metrics: { label: string; nick: number; johannes: number; format: (value: number) => string }[] = [
    { label: 'Anfragen', nick: totals.nick.requests, johannes: totals.johannes.requests, format: formatInt },
    {
      label: 'Annahmequote',
      nick: ratio(totals.nick.accepted, totals.nick.requests),
      johannes: ratio(totals.johannes.accepted, totals.johannes.requests),
      format: formatPercent,
    },
    {
      label: 'Antwortquote',
      nick: ratio(totals.nick.replies, totals.nick.messaged),
      johannes: ratio(totals.johannes.replies, totals.johannes.messaged),
      format: formatPercent,
    },
    { label: 'Termine', nick: totals.nick.meetings, johannes: totals.johannes.meetings, format: formatInt },
    { label: 'Exporte nach Close', nick: totals.nick.exports, johannes: totals.johannes.exports, format: formatInt },
  ];

  const weekly: WeekCompare[] = weeks(DAILY.nick, 8).map((week, index) => ({
    week: `KW ${isoWeek(week[week.length - 1].date)}`,
    Nick: sumDays(week).meetings,
    Johannes: sumDays(weeks(DAILY.johannes, 8)[index]).meetings,
  }));

  const legend = (
    <Legend>
      <LegendKey color={CHART.primary} label={FOUNDERS.nick.name} shape="square" />
      <LegendKey color={CHART.accent} label={FOUNDERS.johannes.name} shape="square" />
    </Legend>
  );

  return (
    <div className="mt-10">
      <div className="mb-4">
        <h2 className="display text-[26px] font-semibold">Nick vs. Johannes</h2>
        <p className="mt-1 text-[13.5px] text-ink-3">Beide LinkedIn-Accounts im Vergleich · letzte 8 Wochen · unabhängig vom Filter</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard className="lg:col-span-2" title="Kennzahlen" legend={legend}>
          <div className="space-y-4">
            {metrics.map((metric) => {
              const max = Math.max(metric.nick, metric.johannes) || 1;
              return (
                <div key={metric.label}>
                  <p className="mb-1.5 text-[12.5px] text-ink-3">{metric.label}</p>
                  {(['nick', 'johannes'] as FounderId[]).map((founder) => (
                    <div key={founder} className="mb-1 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: founder === 'nick' ? CHART.primary : CHART.accent }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(metric[founder] / max) * 100}%` }}
                          transition={{ type: 'spring', bounce: 0, duration: 0.9 }}
                        />
                      </div>
                      <span className="w-16 text-right text-[13px] font-semibold tabular-nums text-ink">{metric.format(metric[founder])}</span>
                      <span className="w-16 text-[12px] text-ink-3">{FOUNDERS[founder].name}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </ChartCard>
        <ChartCard className="lg:col-span-3" title="Termine pro Woche" subtitle="Gebuchte Erstgespräche je Gründer" legend={legend}>
          <WeeklyCompareChart data={weekly} />
        </ChartCard>
      </div>
    </div>
  );
}
