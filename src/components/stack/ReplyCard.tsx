import { ArrowUpRight, Clock3, MessageCircle, Sparkles } from 'lucide-react';
import { useIsPresent } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatRelative } from '../../lib/time';
import { useHotkeys } from '../../lib/useHotkeys';
import { useLeadHistory } from '../../state/demo';
import { Button } from '../ui/Button';
import { Pill } from '../ui/Pill';
import { CardShell, FooterSpacer, LeadRow, SectionLabel } from './CardParts';
import { ChatThread } from './ChatThread';
import { CloseExportModal } from './CloseExportModal';
import type { CardProps } from './cardTypes';

const TONE = {
  positive: 'good',
  question: 'accent',
  negative: 'bad',
} as const;

export function ReplyCard({ card, onDecide, onOpenLead, hotkeysEnabled }: CardProps) {
  const { lead, messages } = useLeadHistory(card.leadId);
  const present = useIsPresent();
  const [exportOpen, setExportOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const latestReply = [...messages].reverse().find((message) => message.from === 'lead');
  const assessment = lead.replyAssessment;
  const fresh = latestReply ? Date.now() - latestReply.at < 10 * 60_000 : false;

  useEffect(() => {
    const element = threadRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, []);

  const exportToClose = useCallback(() => {
    setExportOpen(false);
    onDecide({
      decision: 'export',
      positive: true,
      event: {
        kind: 'exported',
        title: 'Nach Close exportiert',
        detail: lead.closeSummary,
      },
      toast: { pending: 'Wird nach Close exportiert…', done: 'In Close angelegt' },
    });
  }, [lead.closeSummary, onDecide]);

  const discard = () =>
    onDecide({
      decision: 'discard',
      positive: false,
      event: { kind: 'discarded', title: 'Antwort verworfen', detail: assessment ? `KI-Einschätzung: ${assessment.label}` : undefined },
      toast: { pending: 'Wird archiviert…', done: 'Verworfen' },
    });

  useHotkeys({ arrowright: () => setExportOpen(true), arrowleft: discard }, hotkeysEnabled && present && !exportOpen);

  return (
    <>
      <CardShell
        typeLabel="Antwort erhalten"
        typeIcon={<MessageCircle />}
        badge={
          fresh ? (
            <span className="flex h-6 items-center rounded-full bg-accent px-2.5 text-[11.5px] font-semibold text-white">Neu</span>
          ) : null
        }
        meta={
          latestReply && (
            <>
              <Clock3 />
              Antwort {formatRelative(latestReply.at)}
            </>
          )
        }
        footer={
          <>
            <Button variant="outline" size="lg" shortcut="←" shortcutPosition="start" onClick={discard}>
              Verwerfen
            </Button>
            <FooterSpacer />
            <Button
              variant="primary"
              size="lg"
              shortcut="→"
              onClick={() => setExportOpen(true)}
              icon={<ArrowUpRight className="h-4 w-4" />}
            >
              In Close exportieren
            </Button>
          </>
        }
      >
        <LeadRow lead={lead} onOpen={() => onOpenLead(lead.id)} />

        {assessment && (
          <section className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-white/[0.02] px-4 py-3">
            <SectionLabel icon={<Sparkles />} className="mb-0">
              KI-Einschätzung
            </SectionLabel>
            <Pill tone={TONE[assessment.tone]}>{assessment.label}</Pill>
            <p className="min-w-[200px] flex-1 text-[13px] text-ink-2">{assessment.reason}</p>
          </section>
        )}

        <div
          ref={threadRef}
          className="scroll-thin -mx-2 mt-5 max-h-[380px] overflow-y-auto px-2 pb-1 pt-4 [mask-image:linear-gradient(to_bottom,transparent,black_28px)]"
        >
          <ChatThread lead={lead} messages={messages} highlightLatestReply />
        </div>
      </CardShell>

      <CloseExportModal
        open={exportOpen && present}
        lead={lead}
        messages={messages}
        onClose={() => setExportOpen(false)}
        onConfirm={exportToClose}
      />
    </>
  );
}
