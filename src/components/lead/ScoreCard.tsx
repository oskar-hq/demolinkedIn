import { AD_STATUS_LABELS, LEAD_TYPE_LABELS, SCORE_TIER_LABELS, type LeadScore, type ScoreTier } from '../../../shared/scoring';
import { cn } from '../../lib/cn';
import { Dot, StatusLine, type Tone } from '../ui/Status';

const TIER_TONE: Record<ScoreTier, Tone> = { high: 'good', medium: 'warn', low: 'neutral' };

const percent = (value: number) => `${Math.round(value * 100)}`;

/** Score-Kurzzeile: Gesamtwert, Stufe, verletzte Hard-Filter (`shared/scoring.ts`). Einzelteile: `ScoreDetails`. */
export function ScoreCard({ score }: { score: LeadScore }) {
  const failed = score.hardFilters.filter((check) => check.passed === false);

  return (
    <div data-testid="score-card" className="min-w-0">
      <div className="flex min-h-7 flex-wrap items-center gap-x-2.5">
        <span className="text-[13px] text-ink-3">Score</span>
        <p data-testid="score-total" className="text-[20px] font-semibold leading-none tabular-nums">
          {percent(score.total)}
          <span className="text-[13px] font-medium text-ink-3"> / 100</span>
        </p>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-ink">
          <Dot tone={TIER_TONE[score.tier]} />
          {SCORE_TIER_LABELS[score.tier]}
        </span>
      </div>
      {failed.length > 0 && (
        <StatusLine tone="bad" className="mt-1 text-[12.5px]">
          Hard-Filter nicht erfüllt: {failed.map((check) => check.label).join(', ')}
        </StatusLine>
      )}
    </div>
  );
}

/** Woraus sich der Score zusammensetzt: ICP-Teile, Opportunity, Meta-Ads, Lead-Typ und alle Hard-Filter. */
export function ScoreDetails({ score }: { score: LeadScore }) {
  return (
    <section data-testid="score-details">
      <h4 className="mb-2 text-[12px] font-medium text-ink-3">Score</h4>
      <p className="mb-2 text-[12px] text-ink-3">
        ICP {percent(score.icp.score)} · 70 % des Scores · Daten für {percent(score.completeness)} % der Gewichte
      </p>
      <ul className="space-y-2.5">
        {score.icp.components.map((component) => (
          <li key={component.key}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-ink">
                {component.label} <span className="text-ink-3">· {percent(component.weight)} %</span>
              </span>
              <span className="tabular-nums text-ink-2">{component.value === null ? 'unbekannt' : percent(component.value)}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="h-full origin-left rounded-full bg-ink/60" style={{ transform: `scaleX(${component.value ?? 0})` }} />
            </div>
            <p className="mt-1 text-[12px] leading-[1.45] text-ink-3">{component.detail}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12px] text-ink-3">Opportunity {percent(score.ads.opportunity)} · 30 % des Scores</p>
      <p className="mt-1 text-[13px] leading-[1.5] text-ink-2">
        Meta-Ads: {AD_STATUS_LABELS[score.ads.status]}
        {score.ads.status !== 'unknown' && ` · ${percent(score.ads.confidence)} % sicher`}
        {score.ads.status !== 'unknown' && score.ads.detail && <span className="block text-[12.5px] text-ink-3">{score.ads.detail}</span>}
      </p>
      <p className="mt-1 text-[13px] text-ink-2">Lead-Typ: {LEAD_TYPE_LABELS[score.leadType]}</p>
      <h5 className="mb-1.5 mt-4 text-[12px] font-medium text-ink-3">Hard-Filter</h5>
      <ul className="space-y-1">
        {score.hardFilters.map((check) => (
          <li key={check.key} className="flex items-baseline gap-2 text-[13px]">
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full',
                check.passed === true ? 'bg-good' : check.passed === false ? 'bg-bad' : 'bg-warn',
              )}
              aria-hidden
            />
            <span className="min-w-0 text-ink">
              {check.label}
              <span className="sr-only">: {check.passed === true ? 'erfüllt' : check.passed === false ? 'nicht erfüllt' : 'nicht geprüft'}</span>
              <span className="text-ink-3"> – {check.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
