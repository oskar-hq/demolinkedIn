import { ArrowUpRight, ChevronUp, Sparkles } from 'lucide-react';
import { useIsPresent } from 'motion/react';
import { useCallback, useState } from 'react';
import { formatRelative } from '../../lib/time';
import { useHotkeys } from '../../lib/useHotkeys';
import { useLeadHistory } from '../../state/demo';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { Pill } from '../ui/Pill';
import { ChatThread } from './ChatThread';
import { CloseExportModal } from './CloseExportModal';
import { Eyebrow, FocusPage, PersonHeader } from './FocusParts';
import type { CardProps } from './cardTypes';
import { useSwipeActions } from './swipe';

const TONE = {
  positive: 'good',
  question: 'accent',
  negative: 'bad',
} as const;

/** Standardmäßig sichtbar: nur die neue Antwort – der übrige Verlauf ist einen Klick entfernt. */
const VISIBLE_BY_DEFAULT = 1;

export function ReplyCard({ card, onDecide, onOpenLead, hotkeysEnabled }: CardProps) {
  const { lead, messages } = useLeadHistory(card.leadId);
  const present = useIsPresent();
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const latestReply = [...messages].reverse().find((message) => message.from === 'lead');
  const assessment = lead.replyAssessment;
  const fresh = latestReply ? Date.now() - latestReply.at < 10 * 60_000 : false;
  const hiddenCount = Math.max(0, messages.length - VISIBLE_BY_DEFAULT);
  const visibleMessages = historyOpen ? messages : messages.slice(-VISIBLE_BY_DEFAULT);

  const exportToClose = useCallback(() => {
    setExportOpen(false);
    onDecide({
      decision: 'export',
      positive: true,
      event: { kind: 'exported', title: 'Nach Close exportiert', detail: lead.closeSummary },
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

  useHotkeys(
    { arrowright: () => setExportOpen(true), arrowleft: discard, v: () => setHistoryOpen((open) => !open) },
    hotkeysEnabled && present && !exportOpen,
  );
  useSwipeActions({
    // Export öffnet erst die Vorschau – die Seite bleibt dafür stehen.
    right: {
      label: 'In Close exportieren',
      run: () => {
        setExportOpen(true);
        return false;
      },
    },
    left: { label: 'Verwerfen', run: discard },
  });

  return (
    <>
      <FocusPage
        actions={
          <>
            <Button variant="outline" size="xl" shortcut="←" shortcutPosition="start" onClick={discard} className="w-full">
              Verwerfen
            </Button>
            <Button
              variant="primary"
              size="xl"
              shortcut="→"
              onClick={() => setExportOpen(true)}
              icon={<ArrowUpRight className="h-4 w-4" />}
              className="w-full"
            >
              <span className="sm:hidden">Nach Close</span>
              <span className="hidden sm:inline">In Close exportieren</span>
            </Button>
          </>
        }
      >
        <Eyebrow>
          {fresh && <span className="mr-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold tracking-normal text-white normal-case">Neu</span>}
          Antwort erhalten{latestReply ? ` · ${formatRelative(latestReply.at)}` : ''}
        </Eyebrow>
        <PersonHeader lead={lead} compact onOpen={() => onOpenLead(lead.id)} />

        {assessment && (
          <div className="mt-6 flex flex-col items-center text-center">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">
                <Sparkles className="h-3.5 w-3.5" />
                KI
              </span>
              <Pill tone={TONE[assessment.tone]}>{assessment.label}</Pill>
            </div>
            <p className="mt-2.5 max-w-[460px] text-[14px] leading-[1.55] text-ink-3">{assessment.reason}</p>
          </div>
        )}

        <div className="mt-10">
          {hiddenCount > 0 && (
            <div className="mb-5 flex justify-center">
              <button
                type="button"
                onClick={() => setHistoryOpen((open) => !open)}
                aria-expanded={historyOpen}
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink"
              >
                <ChevronUp className={historyOpen ? 'h-4 w-4 rotate-180 transition-transform' : 'h-4 w-4 transition-transform'} />
                {historyOpen ? 'Verlauf ausblenden' : `Ganzen Verlauf anzeigen · ${hiddenCount} frühere ${hiddenCount === 1 ? 'Nachricht' : 'Nachrichten'}`}
                <Kbd>V</Kbd>
              </button>
            </div>
          )}
          <ChatThread lead={lead} messages={visibleMessages} highlightLatestReply />
        </div>
      </FocusPage>

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
