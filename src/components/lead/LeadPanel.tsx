import { AnimatePresence, animate, motion, useDragControls, useIsPresent, useMotionValue, useReducedMotion, type PanInfo } from 'motion/react';
import { workingFounders } from '../../../shared/auth';
import {
  ArrowUpRight,
  Ban,
  Building2,
  CalendarCheck,
  Database,
  MessageCircle,
  PenLine,
  Repeat,
  Search,
  Send,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useId, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { metaAdsLabel } from '../../../shared/leadSearch';
import { LEAD_STAGE_LABELS, type LeadEventKind } from '../../../shared/leads';
import { FOUNDERS } from '../../data/founders';
import { cn } from '../../lib/cn';
import { NO_GESTURE, SPRING_BACK, shouldDismiss } from '../../lib/gesture';
import { EASE_OUT } from '../../lib/motion';
import {
  confidencePercent,
  leadCompany,
  leadFit,
  leadName,
  leadPosition,
  leadRegion,
  leadSignal,
  linkedinProfileUrl,
  replyAssessmentParts,
} from '../../lib/leadView';
import { formatDateTime } from '../../lib/time';
import { isTypingTarget } from '../../lib/useHotkeys';
import { useAccess } from '../../state/auth';
import { useCockpit, useLeadDetail, type TimelineEntry } from '../../state/cockpit';
import { useDemo } from '../../state/demo';
import { DisclosureToggle } from '../ui/Disclosure';
import { MetaLine } from '../ui/MetaLine';
import { SectionLabel } from '../ui/SectionLabel';
import { Dot } from '../ui/Status';
import { CompanyData } from './CompanyData';
import { LeadActions } from './LeadActions';
import { LeadDataActions } from './LeadDataActions';
import { ScoreCard, ScoreDetails } from './ScoreCard';
import { safeHref } from '../../lib/safeHref';

const EVENT_ICONS: Record<LeadEventKind, ReactNode> = {
  created: <Search />,
  assessed: <Sparkles />,
  invite_sent: <UserPlus />,
  invite_accepted: <UserCheck />,
  message_sent: <Send />,
  message_received: <MessageCircle />,
  meeting_booked: <CalendarCheck />,
  handed_over: <Database />,
  lost: <Ban />,
  note: <PenLine />,
  stage_changed: <Repeat />,
  owner_changed: <Users />,
  enriched: <Building2 />,
  reopened: <Repeat />,
};

const PENDING_LABELS = {
  scheduled: 'Noch nicht gespeichert',
  sending: 'Wird gespeichert …',
  waiting: 'Wartet aufs Speichern',
} as const;

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
  const detail = useLeadDetail(leadId);
  const { ensureDetail } = useCockpit();
  const present = useIsPresent();
  const lead = detail.lead;
  // Mit dem Finger nach rechts wegwischen – dorthin, woher das Panel kam. Die Maus markiert weiter Text.
  const x = useMotionValue(0);
  const dragControls = useDragControls();
  const [flick, setFlick] = useState(0);
  // „Bewegung reduzieren“: Transforms fallen weg – dann überblenden statt hart aufploppen.
  const fade = useReducedMotion() ?? false;

  const startDrag = (event: ReactPointerEvent) => {
    if (!present || event.pointerType === 'mouse' || (event.target as HTMLElement).closest(NO_GESTURE)) return;
    dragControls.start(event);
  };

  const endDrag = (event: PointerEvent, info: PanInfo) => {
    const width = (event.target as HTMLElement | null)?.closest('aside')?.getBoundingClientRect().width ?? 400;
    if (shouldDismiss(x.get(), info.velocity.x, width)) {
      setFlick(info.velocity.x);
      onClose();
      return;
    }
    animate(x, 0, { ...SPRING_BACK, velocity: info.velocity.x });
  };

  useEffect(() => {
    if (!present) return;
    const onKey = (event: KeyboardEvent) => {
      // Esc in einem Eingabefeld bricht dort ab (Notiz, nächster Schritt) – erst das nächste Esc schließt.
      if (event.key === 'Escape' && !isTypingTarget(event.target)) {
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
        aria-label={lead ? `Historie von ${leadName(lead)}` : 'Lead-Historie'}
        aria-busy={detail.status === 'loading'}
        className="absolute inset-y-0 right-0 flex w-full max-w-[500px] touch-pan-y flex-col pt-[var(--safe-top)] pb-[var(--safe-bottom)] sm:pt-0 sm:pb-0 bg-surface-1 shadow-[-40px_0_120px_-20px_rgb(0_0_0/0.9)] sm:inset-y-2 sm:right-2 sm:rounded-[20px]"
        style={{ x }}
        initial={fade ? { opacity: 0 } : { x: '105%' }}
        animate={fade ? { opacity: 1 } : { x: 0 }}
        exit={fade ? { opacity: 0, transition: { duration: 0.2 } } : { x: '105%', transition: { type: 'spring', bounce: 0, duration: 0.45, velocity: flick } }}
        transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
        drag="x"
        dragListener={false}
        dragControls={dragControls}
        dragDirectionLock
        // Nach links nur zäher Widerstand (Gummiband), nach rechts folgt das Panel dem Finger 1:1.
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.06, right: 1 }}
        dragMomentum={false}
        onPointerDown={startDrag}
        onDragEnd={endDrag}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="min-w-0">
            {lead && (
              <>
                <h2 className="display text-[24px] font-bold leading-tight tracking-[-0.025em]">{leadName(lead)}</h2>
                <p className="mt-1 text-[13px] text-ink-2">
                  {leadPosition(lead)} · {leadCompany(lead)}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink-2 transition-colors hover:bg-surface-4 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-thin flex-1 touch-pan-y overflow-y-auto px-6 pb-10 pt-3">
          {!lead ? (
            detail.status === 'error' ? (
              <PanelError onRetry={() => ensureDetail(leadId, true)} />
            ) : (
              <p role="status" className="py-16 text-center text-[14px] text-ink-3">
                Wird geladen …
              </p>
            )
          ) : (
            <PanelBody detail={detail} onRetry={() => ensureDetail(leadId, true)} />
          )}
        </div>
      </motion.aside>
    </div>
  );
}

function PanelError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="py-16 text-center">
      <p className="text-[15px] text-ink">Der Lead konnte nicht geladen werden.</p>
      <button type="button" onClick={onRetry} className="mt-3 text-[13.5px] font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
        Erneut versuchen
      </button>
    </div>
  );
}

function PanelBody({ detail, onRetry }: { detail: ReturnType<typeof useLeadDetail>; onRetry: () => void }) {
  const lead = detail.lead!;
  const events = detail.events;
  const fit = leadFit(lead);
  const confidence = confidencePercent(lead);
  const signal = leadSignal(lead, detail.status === 'ready' ? events : undefined);
  const profile = linkedinProfileUrl(lead);
  const region = leadRegion(lead);
  // Noch offene Entscheidung zu diesem Lead (Rückgängig-Fenster, offline): erst die – sonst überholt eine Änderung
  // hier die Entscheidung und das Backend lehnt sie ab.
  const locked = events.some((event) => !!event.pending);
  const access = useAccess();
  // Mitarbeiter bearbeiten nur Leads ihrer Gründer (mit mehreren Gründern: aller).
  const readOnly = access.role === 'assistant' && !(access.user ? workingFounders(access.user) : [access.founder]).includes(lead.owner);
  const reply = lead.conversation ? replyAssessmentParts(lead.conversation) : null;
  // Seltenes (Branche, Region, Meta-Ads, Score-Teile, Firmendaten) liegt hinter einem „Details“.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();

  const facts: [string, string][] = [];
  if (lead.company.industry) facts.push(['Branche', lead.company.industry]);
  if (region) facts.push(['Region', region]);
  if (lead.metaAds) facts.push(['Meta-Ads', metaAdsLabel(lead.metaAds)]);
  if (!lead.assessment) facts.push(['KI', 'Nicht bewertet']);

  const stage = (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink">
      <Dot tone={lead.stage === 'lost' ? 'bad' : lead.stage === 'meeting' || lead.stage === 'handed_over' ? 'good' : 'neutral'} />
      {LEAD_STAGE_LABELS[lead.stage]}
    </span>
  );
  const linkedinLink = profile && (
    <a
      href={profile}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="LinkedIn-Profil öffnen"
      className="inline-flex items-center gap-0.5 whitespace-nowrap text-ink hover:underline"
    >
      LinkedIn
      <ArrowUpRight className="h-3.5 w-3.5" />
    </a>
  );
  const crmItem =
    lead.crm &&
    (lead.crm.url ? (
      <a
        href={safeHref(lead.crm.url)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="In Close öffnen"
        data-testid="crm-link"
        className="inline-flex items-center gap-0.5 whitespace-nowrap text-ink hover:underline"
      >
        Close
        <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    ) : (
      <span data-testid="crm-link" className="whitespace-nowrap">
        Close · {lead.crm.externalId}
      </span>
    ));

  return (
    <>
      <MetaLine
        testId="panel-meta"
        className="items-center text-[13px] text-ink-2"
        items={[stage, signal && <span className="min-w-0 break-words">{signal.label}</span>, linkedinLink, crmItem]}
      />

      <div className="mt-4 flex items-start justify-between gap-3">
        {lead.score && <ScoreCard score={lead.score} />}
        <DisclosureToggle
          look="chip"
          className="ml-auto"
          testId="panel-details-toggle"
          open={detailsOpen}
          onToggle={() => setDetailsOpen((value) => !value)}
          controls={detailsId}
        >
          Details
        </DisclosureToggle>
      </div>

      {/* Immer eingehängt: Firmendaten fragen weiter nach und behalten ihren Stand. */}
      <div id={detailsId} hidden={!detailsOpen} data-testid="panel-details" className="mt-4 space-y-6">
        {facts.length > 0 && (
          <dl className="space-y-1.5 text-[13px]">
            {facts.map(([label, value]) => (
              <div key={label} className="flex gap-4">
                <dt className="w-36 shrink-0 text-ink-2">{label}</dt>
                <dd className="min-w-0 break-words font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {lead.score && <ScoreDetails score={lead.score} />}
        {!readOnly && <CompanyData lead={lead} disabled={locked} />}
      </div>

      {reply && lead.conversation && (
        <section className="mt-6" data-testid="panel-conversation">
          <SectionLabel as="h3" className="mb-1.5">
            Gespräch
          </SectionLabel>
          <p className="text-[14px] leading-[1.6] text-ink">
            <span className="font-medium">{reply.label}</span>
            {reply.detail && <span className="text-ink/90"> · {reply.detail}</span>}
          </p>
          {lead.conversation.summary && <p className="mt-1 text-[13.5px] leading-[1.6] text-ink-2">{lead.conversation.summary}</p>}
        </section>
      )}

      {lead.assessment && fit && (
        <section className="mt-6">
          <SectionLabel as="h3" icon={<Sparkles className="h-3.5 w-3.5" />} className="mb-1.5">
            KI-Einschätzung
          </SectionLabel>
          <p className="text-[14px] text-ink">
            <span className="font-medium">{fit.label}</span>
            {confidence && <span className="text-ink-3"> · {confidence} sicher</span>}
          </p>
          {lead.assessment.summary && <p className="mt-1 text-[14px] leading-[1.6] text-ink-2">{lead.assessment.summary}</p>}
        </section>
      )}

      {readOnly ? (
        // Mitarbeiter buchen nur auf Leads ihres Gründers (`shared/auth.ts` → Rollen und Rechte).
        <p className="mt-6 text-[13px] leading-[1.55] text-ink-3" data-testid="lead-read-only">
          Dieser Lead gehört {FOUNDERS[lead.owner].name} – du kannst ihn nur ansehen.
        </p>
      ) : (
        <LeadActions lead={lead} locked={locked} />
      )}

      <section className="mt-6">
        <SectionLabel as="h3" className="mb-1.5">
          Verlauf
        </SectionLabel>
        {detail.status === 'ready' ? (
          <Timeline events={events} />
        ) : detail.status === 'error' ? (
          <p className="text-[13.5px] text-ink-2">
            Verlauf konnte nicht geladen werden.{' '}
            <button type="button" onClick={onRetry} className="font-medium text-ink underline-offset-4 hover:underline">
              Erneut versuchen
            </button>
          </p>
        ) : (
          <p role="status" className="text-[13.5px] text-ink-3">
            Verlauf wird geladen …
          </p>
        )}
      </section>

      {/* Datenschutz (Auskunft, Löschen) – nur Gründer und Admins, ganz unten. */}
      <LeadDataActions lead={lead} />
    </>
  );
}

function Timeline({ events }: { events: TimelineEntry[] }) {
  return (
    <ol className="relative">
      {events.map((event, index) => {
        const isMessage = event.kind === 'message_sent' || event.kind === 'message_received';
        const last = index === events.length - 1;
        return (
          <motion.li
            key={event.id}
            // Ohne Staffelung: Das Panel öffnest du oft und willst den Verlauf sofort lesen. Neue Einträge blenden kurz ein.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            className="relative flex gap-3.5 pb-5"
          >
            {!last && <span aria-hidden className="absolute bottom-0 left-[13px] top-8 w-px bg-line-strong" />}
            <span
              className={cn(
                'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border [&>svg]:h-3.5 [&>svg]:w-3.5',
                // Noch nicht gespeichert: gestrichelt und neutral, offline wartend in Warnfarbe.
                event.pending === 'waiting'
                  ? 'border-dashed border-warn/70 bg-surface-3 text-warn'
                  : event.pending
                    ? 'border-dashed border-line-strong bg-surface-3 text-ink-3'
                    : 'border-line-strong bg-surface-3 text-ink-2',
              )}
            >
              {EVENT_ICONS[event.kind] ?? <PenLine />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-[13px] font-semibold text-ink">{event.title}</p>
                <time className="text-[12px] tabular-nums text-ink-3">{formatDateTime(event.at)}</time>
              </div>
              {/* `actor` setzt das Backend nur, wenn nicht der Gründer selbst gebucht hat (`shared/leads.ts`). */}
              {event.actor && (
                <p className="text-[12px] text-ink-3" data-testid="event-actor">
                  von {event.actor}
                  {event.by ? ` für ${FOUNDERS[event.by].name}` : ''}
                </p>
              )}
              {event.pending && (
                <span className="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2">
                  <span className={cn('h-1.5 w-1.5 rounded-full', event.pending === 'waiting' ? 'bg-warn' : 'bg-ink-3')} aria-hidden />
                  {PENDING_LABELS[event.pending]}
                </span>
              )}
              {event.text &&
                (isMessage ? (
                  <p className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] leading-[1.55] text-ink-2 [overflow-wrap:anywhere]">
                    {event.text}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-3 [overflow-wrap:anywhere]">{event.text}</p>
                ))}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
