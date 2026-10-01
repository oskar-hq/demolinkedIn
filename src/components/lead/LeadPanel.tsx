import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import {
  Ban,
  Briefcase,
  Building2,
  CheckCheck,
  Database,
  EyeOff,
  Inbox,
  Lock,
  MapPin,
  Megaphone,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FOUNDERS, otherFounder } from '../../data/founders';
import { cn } from '../../lib/cn';
import { FIT_INFO, fullName, initials, linkedinUrl, signalLabel } from '../../lib/leadInfo';
import { formatDateTime } from '../../lib/time';
import { useDemo, useLeadHistory } from '../../state/demo';
import type { CardState, TimelineKind } from '../../state/types';
import { Avatar } from '../ui/Avatar';
import { Pill } from '../ui/Pill';

const EVENT_ICONS: Record<TimelineKind, ReactNode> = {
  scraped: <Search />,
  assessed: <Sparkles />,
  connection_sent: <UserPlus />,
  connection_accepted: <UserCheck />,
  message_sent: <Send />,
  message_received: <MessageCircle />,
  rejected: <Ban />,
  skipped: <EyeOff />,
  exported: <Database />,
  discarded: <Trash2 />,
};

function statusLabel(card: CardState): string {
  if (card.status === 'done') {
    switch (card.decision) {
      case 'connect':
        return 'Vernetzungsanfrage gesendet';
      case 'reject':
        return 'Aussortiert';
      case 'send':
        return card.type === 'first' ? 'Angeschrieben' : 'Follow-up gesendet';
      case 'skip':
        return 'Pausiert';
      case 'export':
        return 'In Close übertragen';
      case 'discard':
        return 'Verworfen';
    }
  }
  return {
    lead: 'Neu – wartet auf Prüfung',
    first: 'Vernetzt – Erstnachricht offen',
    followup: 'Angeschrieben – keine Antwort',
    reply: 'Antwort erhalten',
  }[card.type];
}

export function LeadPanel() {
  const { state, dispatch } = useDemo();
  return createPortal(
    <AnimatePresence>
      {state.panelLeadId && (
        <PanelContent key={state.panelLeadId} leadId={state.panelLeadId} onClose={() => dispatch({ type: 'CLOSE_PANEL' })} />
      )}
    </AnimatePresence>,
    document.body,
  );
}

function PanelContent({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { state } = useDemo();
  const { lead, events } = useLeadHistory(leadId);
  const present = useIsPresent();
  const card = state.cards[leadId];
  const owner = FOUNDERS[lead.owner];
  const other = FOUNDERS[otherFounder(lead.owner)];
  const fit = FIT_INFO[lead.fit];

  useEffect(() => {
    if (!present) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [present, onClose]);

  return (
    <div className={cn('fixed inset-0 z-50', !present && 'pointer-events-none')}>
      <motion.div
        className="absolute inset-0 bg-black/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />
      <motion.aside
        role="dialog"
        aria-modal={present ? 'true' : undefined}
        aria-label={`Historie von ${fullName(lead)}`}
        className="absolute inset-y-0 right-0 flex bg-surface-1/[0.97] backdrop-blur-2xl w-full max-w-[500px] flex-col border-l border-line-strong shadow-[-40px_0_120px_-20px_rgb(0_0_0/0.9)] sm:inset-y-2 sm:right-2 sm:rounded-[24px] sm:border"
        initial={{ x: '105%' }}
        animate={{ x: 0 }}
        exit={{ x: '105%' }}
        transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">Lead-Historie</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-ink-2 transition-colors hover:bg-white/[0.12] hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-10 pt-4">
          <div className="flex items-center gap-4">
            <Avatar name={fullName(lead)} initials={initials(lead)} size={56} />
            <div className="min-w-0">
              <h2 className="display text-[24px] font-semibold">{fullName(lead)}</h2>
              <p className="text-[14px] text-ink-2">
                {lead.position} · {lead.company}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Pill dot={false} icon={<Building2 />} size="sm">{lead.industry}</Pill>
            <Pill dot={false} icon={<MapPin />} size="sm">{lead.region}</Pill>
            <Pill dot={false} icon={lead.signal.type === 'meta_ads' ? <Megaphone /> : <Briefcase />} size="sm">
              {signalLabel(lead.signal)}
            </Pill>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-line-strong bg-white/[0.04] px-4 py-3.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08]">
              <Lock className="h-3.5 w-3.5 text-ink" />
            </span>
            <p className="text-[13.5px] leading-[1.5] text-ink">
              Diesem Lead ist nur {owner.name} zugeordnet – {other.name} kann ihn nicht anschreiben.
              <span className="mt-0.5 block text-[12.5px] text-ink-3">
                Alle Nachrichten laufen über den LinkedIn-Account von {owner.name}.
              </span>
            </p>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-[13px]">
            {[
              ['Status', statusLabel(card)],
              ['Zuständig', owner.name],
              ['KI-Einschätzung', fit.label],
              ['LinkedIn', linkedinUrl(lead)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 bg-surface-1/90 px-3.5 py-3">
                <dt className="text-[11.5px] text-ink-3">{label}</dt>
                <dd className="mt-0.5 truncate text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <section className="mt-5">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
              <Sparkles className="h-3.5 w-3.5" /> KI-Zusammenfassung
            </h3>
            <p className="text-[14px] leading-[1.6] text-ink/90">{lead.summary}</p>
          </section>

          <section className="mt-7">
            <h3 className="mb-4 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
              <Inbox className="h-3.5 w-3.5" /> Verlauf · {events.length} Ereignisse
            </h3>
            <ol className="relative">
              {events.map((event, index) => {
                const isMessage = event.kind === 'message_sent' || event.kind === 'message_received';
                const last = index === events.length - 1;
                return (
                  <motion.li
                    key={event.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + index * 0.03, duration: 0.3 }}
                    className="relative flex gap-3.5 pb-5"
                  >
                    {!last && <span aria-hidden className="absolute left-[13px] top-8 bottom-0 w-px bg-line-strong" />}
                    <span
                      className={cn(
                        'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border [&>svg]:h-3.5 [&>svg]:w-3.5',
                        event.live ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line-strong bg-surface-3 text-ink-2',
                      )}
                    >
                      {EVENT_ICONS[event.kind]}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-[13.5px] font-medium text-ink">{event.title}</p>
                        <time className="text-[12px] tabular-nums text-ink-3">{formatDateTime(event.at)}</time>
                      </div>
                      {event.live && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent">
                          <CheckCheck className="h-3 w-3" /> In dieser Sitzung
                        </span>
                      )}
                      {event.detail &&
                        (isMessage ? (
                          <p className="mt-2 whitespace-pre-wrap rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-[13px] leading-[1.55] text-ink-2">
                            {event.detail}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-3">{event.detail}</p>
                        ))}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </section>
        </div>
      </motion.aside>
    </div>
  );
}
