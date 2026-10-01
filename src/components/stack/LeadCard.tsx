import { Briefcase, Megaphone, Sparkles, UserPlus } from 'lucide-react';
import { useIsPresent } from 'motion/react';
import { FOUNDERS } from '../../data/founders';
import { FIT_INFO, signalLabel } from '../../lib/leadInfo';
import { useHotkeys } from '../../lib/useHotkeys';
import { useLeadHistory } from '../../state/demo';
import { Button } from '../ui/Button';
import { Pill } from '../ui/Pill';
import { Block, Eyebrow, FocusPage, PersonHeader } from './FocusParts';
import type { CardProps } from './cardTypes';
import { useSwipeActions } from './swipe';

export function LeadCard({ card, onDecide, onOpenLead, hotkeysEnabled }: CardProps) {
  const { lead } = useLeadHistory(card.leadId);
  const present = useIsPresent();
  const fit = FIT_INFO[lead.fit];

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
  useSwipeActions({ right: { label: 'Vernetzen', run: connect }, left: { label: 'Nicht geeignet', run: reject } });

  return (
    <FocusPage
      actions={
        <>
          <Button variant="outline" size="xl" shortcut="←" shortcutPosition="start" onClick={reject} className="w-full">
            Nicht geeignet
          </Button>
          <Button variant="primary" size="xl" shortcut="→" onClick={connect} icon={<UserPlus className="h-4 w-4" />} className="w-full">
            Vernetzen
          </Button>
        </>
      }
    >
      <Eyebrow>Neuer Lead</Eyebrow>
      <PersonHeader lead={lead} onOpen={() => onOpenLead(lead.id)} subtitle={`${lead.industry} · ${lead.region}`}>
        <Pill dot={false} icon={lead.signal.type === 'meta_ads' ? <Megaphone /> : <Briefcase />}>
          {signalLabel(lead.signal)}
        </Pill>
      </PersonHeader>

      <Block label="KI-Zusammenfassung" icon={<Sparkles />}>
        <p className="text-center text-[16px] leading-[1.65] text-ink/85">{lead.summary}</p>
      </Block>

      <Block label="KI-Einschätzung" icon={<Sparkles />} className="flex flex-col items-center text-center">
        <Pill tone={fit.good ? 'good' : 'warn'} size="md">
          {fit.label}
        </Pill>
        <p className="mt-3 max-w-[460px] text-[14px] leading-[1.55] text-ink-3">{lead.fitReason}</p>
      </Block>
    </FocusPage>
  );
}
