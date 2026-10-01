import { Briefcase, Megaphone, PenLine, Send, UserCheck } from 'lucide-react';
import { useIsPresent } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { FIRST_MESSAGE_TEMPLATES } from '../../data/templates';
import { signalLabel } from '../../lib/leadInfo';
import { fillTemplate, variablesForLead } from '../../lib/template';
import { formatRelative } from '../../lib/time';
import { useHotkeys } from '../../lib/useHotkeys';
import { useLeadHistory } from '../../state/demo';
import type { TemplateId } from '../../state/types';
import { Button } from '../ui/Button';
import { Pill } from '../ui/Pill';
import { Segmented } from '../ui/Segmented';
import { CardShell, FooterSpacer, LeadRow, SectionLabel } from './CardParts';
import { MessageEditor } from './MessageEditor';
import type { CardProps } from './cardTypes';

export function FirstMessageCard({ card, onDecide, onOpenLead, hotkeysEnabled }: CardProps) {
  const { lead, acceptedAt } = useLeadHistory(card.leadId);
  const present = useIsPresent();
  const variables = useMemo(() => variablesForLead(lead), [lead]);
  const isMeta = lead.signal.type === 'meta_ads';
  const [templateId, setTemplateId] = useState<TemplateId>(lead.template ?? (isMeta ? 'A' : 'C'));
  const template = FIRST_MESSAGE_TEMPLATES[templateId];
  const original = useMemo(() => fillTemplate(template.text, variables), [template, variables]);
  const [text, setText] = useState(original);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const edited = text !== original;

  const chooseTemplate = (id: TemplateId) => {
    setTemplateId(id);
    setText(fillTemplate(FIRST_MESSAGE_TEMPLATES[id].text, variables));
  };

  const edit = () => {
    const field = editorRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  };

  const send = () => {
    if (!text.trim()) return;
    onDecide({
      decision: 'send',
      positive: true,
      event: {
        kind: 'message_sent',
        title: `Erstnachricht gesendet · ${template.name}${edited ? ' (bearbeitet)' : ''}`,
        detail: text,
      },
      message: { text, label: `Erstnachricht · ${template.name}` },
      toast: { pending: 'Nachricht wird gesendet…', done: 'Gesendet' },
    });
  };

  const skip = () =>
    onDecide({
      decision: 'skip',
      positive: false,
      event: { kind: 'skipped', title: 'Erstnachricht nicht gesendet' },
      toast: { pending: 'Wird übersprungen…', done: 'Nicht gesendet' },
    });

  useHotkeys(
    {
      arrowright: send,
      arrowleft: skip,
      e: edit,
      ...(isMeta ? { '1': () => chooseTemplate('A'), '2': () => chooseTemplate('B') } : {}),
    },
    hotkeysEnabled && present,
  );

  return (
    <CardShell
      typeLabel="Erstnachricht"
      typeIcon={<Send />}
      meta={
        <>
          <UserCheck />
          Anfrage angenommen {formatRelative(acceptedAt ?? Date.now())}
        </>
      }
      footer={
        <>
          <Button variant="outline" size="lg" shortcut="←" shortcutPosition="start" onClick={skip}>
            Nicht senden
          </Button>
          <FooterSpacer />
          <Button variant="ghost" size="lg" shortcut="E" onClick={edit} icon={<PenLine className="h-4 w-4" />}>
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
          <Pill dot={false} icon={isMeta ? <Megaphone /> : <Briefcase />} className="border-white/15 bg-white/[0.07]">
            {signalLabel(lead.signal)}
          </Pill>
        }
      />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Vorbefüllte Nachricht</SectionLabel>
          {isMeta ? (
            <Segmented
              ariaLabel="Template wählen"
              size="sm"
              value={templateId}
              onChange={chooseTemplate}
              options={[
                { value: 'A', label: 'Template A', shortcut: '1' },
                { value: 'B', label: 'Template B', shortcut: '2' },
              ]}
            />
          ) : (
            <Pill tone="accent">Template C · Recruiting</Pill>
          )}
        </div>
        <p className="text-[12.5px] text-ink-3">
          {template.description}
          {edited && <span className="ml-2 text-ink-2">· bearbeitet</span>}
        </p>
      </div>

      <div className="mt-3">
        <MessageEditor ref={editorRef} value={text} onChange={setText} variables={variables} onSubmit={send} />
      </div>
    </CardShell>
  );
}
