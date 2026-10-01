import { Briefcase, Building2, Clock3, MapPin, Megaphone, Sparkles, UserPlus } from 'lucide-react';
import { useIsPresent } from 'motion/react';
import { FOUNDERS } from '../../data/founders';
import { FIT_INFO, signalDetail, signalLabel } from '../../lib/leadInfo';
import { formatDateTime } from '../../lib/time';
import { useHotkeys } from '../../lib/useHotkeys';
import { useLeadHistory } from '../../state/demo';
import { Button } from '../ui/Button';
import { Pill } from '../ui/Pill';
import { CardShell, FooterSpacer, LeadRow, SectionLabel } from './CardParts';
import type { CardProps } from './cardTypes';

export function LeadCard({ card, onDecide, onOpenLead, hotkeysEnabled }: CardProps) {
  const { lead, events } = useLeadHistory(card.leadId);
  const present = useIsPresent();
  const fit = FIT_INFO[lead.fit];
  const scrapedAt = events.find((event) => event.kind === 'scraped')?.at ?? Date.now();

  const connect = () =>
    onDecide({
      decision: 'connect',
      positive: true,
      event: {
        kind: 'connection_sent',
        title: `Vernetzungsanfrage gesendet von ${FOUNDERS[card.owner].name}`,
        detail: `Über den LinkedIn-Account von ${FOUNDERS[card.owner].name}`,
      },
      toast: { pending: 'Vernetzungsanfrage wird gesendet…', done: 'Vernetzungsanfrage gesendet' },
    });

  const reject = () =>
    onDecide({
      decision: 'reject',
      positive: false,
      event: {
        kind: 'rejected',
        title: 'Als nicht geeignet markiert',
        detail: fit.good ? 'Manuell aussortiert – entgegen der KI-Einschätzung.' : 'KI-Einschätzung bestätigt.',
      },
      toast: { pending: 'Lead wird aussortiert…', done: 'Als nicht geeignet markiert' },
    });

  useHotkeys({ arrowright: connect, arrowleft: reject }, hotkeysEnabled && present);

  return (
    <CardShell
      typeLabel="Neuer Lead"
      typeIcon={<UserPlus />}
      meta={
        <>
          <Clock3 />
          Gescrapt {formatDateTime(scrapedAt).replace('Heute', 'heute').replace('Gestern', 'gestern')}
        </>
      }
      footer={
        <>
          <Button variant="outline" size="lg" shortcut="←" shortcutPosition="start" onClick={reject}>
            Nicht geeignet
          </Button>
          {!fit.good && (
            <span className="ml-1 hidden items-center gap-1.5 text-[12.5px] text-ink-2 sm:inline-flex">
              <Sparkles className="h-3.5 w-3.5 text-warn" />
              KI empfiehlt: aussortieren
            </span>
          )}
          <FooterSpacer />
          <Button variant="primary" size="lg" shortcut="→" onClick={connect} icon={<UserPlus className="h-4 w-4" />}>
            Vernetzen
          </Button>
        </>
      }
    >
      <LeadRow lead={lead} size="lg" onOpen={() => onOpenLead(lead.id)} />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Pill dot={false} icon={<Building2 />}>{lead.industry}</Pill>
        <Pill dot={false} icon={<MapPin />}>{lead.region}</Pill>
        <Pill dot={false} icon={lead.signal.type === 'meta_ads' ? <Megaphone /> : <Briefcase />} className="border-white/15 bg-white/[0.07]">
          {signalLabel(lead.signal)}
        </Pill>
      </div>
      <p className="mt-2 pl-0.5 text-[12.5px] text-ink-3">{signalDetail(lead.signal)}</p>

      <div className="mt-6 grid gap-5 sm:grid-cols-[1.35fr_1fr]">
        <section className="rounded-2xl border border-line bg-white/[0.02] p-4">
          <SectionLabel icon={<Sparkles />}>KI-Zusammenfassung</SectionLabel>
          <p className="text-[14.5px] leading-[1.6] text-ink/90">{lead.summary}</p>
        </section>
        <section className="rounded-2xl border border-line bg-white/[0.02] p-4">
          <SectionLabel icon={<Sparkles />}>KI-Einschätzung</SectionLabel>
          <Pill tone={fit.good ? 'good' : 'warn'} wrap>
            {fit.label}
          </Pill>
          <p className="mt-3 text-[13.5px] leading-[1.55] text-ink-2">{lead.fitReason}</p>
        </section>
      </div>
    </CardShell>
  );
}
