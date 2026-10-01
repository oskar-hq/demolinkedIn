import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { ChevronDown, Send } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { FOLLOW_UP_TEMPLATES, MAX_FOLLOW_UPS } from '../../data/templates';
import { cn } from '../../lib/cn';
import { fillTemplate, variablesForLead } from '../../lib/template';
import { daysBetween } from '../../lib/time';
import { useHotkeys } from '../../lib/useHotkeys';
import { useLeadHistory } from '../../state/demo';
import type { FollowUpVariant } from '../../state/types';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { Segmented } from '../ui/Segmented';
import { ChatThread } from './ChatThread';
import { AiSummary, Eyebrow, FocusPage, PersonHeader } from './FocusParts';
import { MessageEditor, focusAtEnd } from './MessageEditor';
import type { CardProps } from './cardTypes';
import { useSwipeActions } from './swipe';

export function FollowUpCard({ card, onDecide, onOpenLead, hotkeysEnabled }: CardProps) {
  const { lead, messages, lastOwnMessageAt } = useLeadHistory(card.leadId);
  const present = useIsPresent();
  const variables = useMemo(() => variablesForLead(lead), [lead]);
  const stage = Math.min(MAX_FOLLOW_UPS, (lead.followUps?.length ?? 0) + 1) as 1 | 2 | 3;
  const silentDays = lead.daysSilent ?? daysBetween(lastOwnMessageAt ?? Date.now());
  const templates = FOLLOW_UP_TEMPLATES[stage];

  const [variant, setVariant] = useState<FollowUpVariant>('A');
  const [drafts, setDrafts] = useState<Record<FollowUpVariant, string>>(() => ({
    A: fillTemplate(templates.A.text, variables),
    B: fillTemplate(templates.B.text, variables),
    C: fillTemplate(templates.C.text, variables),
    custom: '',
  }));
  const [historyOpen, setHistoryOpen] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const text = drafts[variant];
  const variantName = variant === 'custom' ? 'Eigene Nachricht' : `Variante ${variant}`;
  const edited = variant !== 'custom' && text !== fillTemplate(templates[variant].text, variables);

  const choose = (next: FollowUpVariant) => {
    setVariant(next);
    if (next === 'custom') requestAnimationFrame(() => focusAtEnd(editorRef.current));
  };

  const send = () => {
    if (!text.trim()) return;
    onDecide({
      decision: 'send',
      positive: true,
      event: {
        kind: 'message_sent',
        title: `Follow-up ${stage} gesendet · ${variantName}${edited ? ' (bearbeitet)' : ''}`,
        detail: text,
      },
      message: { text, label: `Follow-up ${stage} · ${variantName}` },
      toast: { pending: `Follow-up ${stage} wird gesendet…`, done: 'Gesendet' },
    });
  };

  const skip = () =>
    onDecide({
      decision: 'skip',
      positive: false,
      event: { kind: 'skipped', title: `Follow-up ${stage} nicht gesendet` },
      toast: { pending: 'Wird übersprungen…', done: 'Nicht gesendet' },
    });

  useHotkeys(
    {
      arrowright: send,
      arrowleft: skip,
      e: () => focusAtEnd(editorRef.current),
      '1': () => choose('A'),
      '2': () => choose('B'),
      '3': () => choose('C'),
      '4': () => choose('custom'),
      v: () => setHistoryOpen((open) => !open),
    },
    hotkeysEnabled && present,
  );
  useSwipeActions({
    right: { label: `Follow-up ${stage} senden`, run: send, enabled: Boolean(text.trim()) },
    left: { label: 'Nicht senden', run: skip },
  });

  return (
    <FocusPage
      actions={
        <>
          <Button variant="outline" size="xl" shortcut="←" shortcutPosition="start" onClick={skip} className="w-full">
            Nicht senden
          </Button>
          <Button
            variant="primary"
            size="xl"
            shortcut="→"
            onClick={send}
            disabled={!text.trim()}
            icon={<Send className="h-4 w-4" />}
            className="w-full"
          >
            Senden
          </Button>
        </>
      }
    >
      <Eyebrow>
        Follow-up {stage} von {MAX_FOLLOW_UPS}
      </Eyebrow>
      <PersonHeader
        lead={lead}
        compact
        onOpen={() => onOpenLead(lead.id)}
        subtitle={`Keine Antwort seit ${silentDays} ${silentDays === 1 ? 'Tag' : 'Tagen'} – Follow-up ${stage} von ${MAX_FOLLOW_UPS}`}
      />
      <AiSummary text={lead.summary} />

      <div className="mt-4 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          {historyOpen ? 'Verlauf ausblenden' : `Bisherigen Verlauf anzeigen · ${messages.length} ${messages.length === 1 ? 'Nachricht' : 'Nachrichten'}`}
          <ChevronDown className={cn('h-4 w-4 transition-transform duration-300', historyOpen && 'rotate-180')} />
          <Kbd>V</Kbd>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {historyOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="overflow-hidden"
          >
            <div className="scroll-thin mt-4 max-h-[320px] overflow-y-auto">
              <ChatThread lead={lead} messages={messages} compact />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 flex flex-col items-center">
        <Segmented
          ariaLabel="Follow-up-Variante"
          value={variant}
          onChange={choose}
          options={[
            { value: 'A', label: 'Variante A', shortcut: '1' },
            { value: 'B', label: 'Variante B', shortcut: '2' },
            { value: 'C', label: 'Variante C', shortcut: '3' },
            { value: 'custom', label: 'Eigene Nachricht', shortcut: '4' },
          ]}
        />
        <p className="mt-2.5 text-[12.5px] text-ink-3">
          {variant === 'custom' ? 'Freitext – Variablen werden trotzdem erkannt' : `„${templates[variant].name}“`}
          {edited && ' · bearbeitet'}
        </p>
      </div>

      <div className="mt-4">
        <MessageEditor
          ref={editorRef}
          value={text}
          onChange={(value) => setDrafts((current) => ({ ...current, [variant]: value }))}
          variables={variables}
          onSubmit={send}
          placeholder={`Eigene Nachricht an ${lead.firstName} schreiben …`}
        />
      </div>
    </FocusPage>
  );
}
