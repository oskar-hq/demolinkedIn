import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { Briefcase, ChevronDown, Clock3, Megaphone, PenLine, Repeat2, Send } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { FOLLOW_UP_TEMPLATES, MAX_FOLLOW_UPS } from '../../data/templates';
import { cn } from '../../lib/cn';
import { signalLabel } from '../../lib/leadInfo';
import { fillTemplate, variablesForLead } from '../../lib/template';
import { daysBetween } from '../../lib/time';
import { useHotkeys } from '../../lib/useHotkeys';
import { useLeadHistory } from '../../state/demo';
import type { FollowUpVariant } from '../../state/types';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { Pill } from '../ui/Pill';
import { Segmented } from '../ui/Segmented';
import { CardShell, FooterSpacer, LeadRow, SectionLabel } from './CardParts';
import { ChatThread } from './ChatThread';
import { MessageEditor } from './MessageEditor';
import type { CardProps } from './cardTypes';

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

  const focusEditor = () => {
    const field = editorRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  };

  const choose = (next: FollowUpVariant) => {
    setVariant(next);
    if (next === 'custom') requestAnimationFrame(focusEditor);
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
      e: focusEditor,
      '1': () => choose('A'),
      '2': () => choose('B'),
      '3': () => choose('C'),
      '4': () => choose('custom'),
      v: () => setHistoryOpen((open) => !open),
    },
    hotkeysEnabled && present,
  );

  return (
    <CardShell
      typeLabel="Follow-up"
      typeIcon={<Repeat2 />}
      meta={
        <>
          <Clock3 />
          Keine Antwort seit {silentDays} {silentDays === 1 ? 'Tag' : 'Tagen'} – Follow-up {stage} von {MAX_FOLLOW_UPS}
        </>
      }
      footer={
        <>
          <Button variant="outline" size="lg" shortcut="←" shortcutPosition="start" onClick={skip}>
            Nicht senden
          </Button>
          <FooterSpacer />
          <Button variant="ghost" size="lg" shortcut="E" onClick={focusEditor} icon={<PenLine className="h-4 w-4" />}>
            Bearbeiten
          </Button>
          <Button variant="primary" size="lg" shortcut="→" onClick={send} disabled={!text.trim()} icon={<Send className="h-4 w-4" />}>
            Senden
          </Button>
        </>
      }
    >
      <LeadRow
        lead={lead}
        onOpen={() => onOpenLead(lead.id)}
        aside={
          <Pill dot={false} icon={lead.signal.type === 'meta_ads' ? <Megaphone /> : <Briefcase />} className="border-white/15 bg-white/[0.07]">
            {signalLabel(lead.signal)}
          </Pill>
        }
      />

      <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        >
          <span className="flex items-center gap-2 text-[13.5px] text-ink-2">
            <span className="font-medium text-ink">Bisheriger Verlauf</span>
            <span>·</span>
            <span>
              {messages.length} {messages.length === 1 ? 'Nachricht' : 'Nachrichten'}, keine Antwort
            </span>
          </span>
          <span className="flex items-center gap-2 text-[12px] text-ink-3">
            <Kbd>V</Kbd>
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-300', historyOpen && 'rotate-180')} />
          </span>
        </button>
        <AnimatePresence initial={false}>
          {historyOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            >
              <div className="scroll-thin max-h-[300px] overflow-y-auto border-t border-line px-4 py-4">
                <ChatThread lead={lead} messages={messages} compact />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Follow-up {stage} wählen</SectionLabel>
          <Segmented
            ariaLabel="Follow-up-Variante"
            size="sm"
            value={variant}
            onChange={choose}
            options={[
              { value: 'A', label: 'Variante A', shortcut: '1' },
              { value: 'B', label: 'Variante B', shortcut: '2' },
              { value: 'C', label: 'Variante C', shortcut: '3' },
              { value: 'custom', label: 'Eigene Nachricht', shortcut: '4' },
            ]}
          />
        </div>
        <p className="text-[12.5px] text-ink-3">
          {variant === 'custom' ? 'Freitext – Variablen werden trotzdem erkannt' : `„${templates[variant].name}“`}
          {edited && <span className="ml-2 text-ink-2">· bearbeitet</span>}
        </p>
      </div>

      <div className="mt-3">
        <MessageEditor
          ref={editorRef}
          value={text}
          onChange={(value) => setDrafts((current) => ({ ...current, [variant]: value }))}
          variables={variables}
          onSubmit={send}
          placeholder={`Eigene Nachricht an ${lead.firstName} schreiben …`}
        />
      </div>
    </CardShell>
  );
}
