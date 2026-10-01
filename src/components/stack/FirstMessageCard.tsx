import { Briefcase, Megaphone, Send } from 'lucide-react';
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
import { Eyebrow, FocusPage, PersonHeader } from './FocusParts';
import { MessageEditor, focusAtEnd } from './MessageEditor';
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
      e: () => focusAtEnd(editorRef.current),
      ...(isMeta ? { '1': () => chooseTemplate('A'), '2': () => chooseTemplate('B') } : {}),
    },
    hotkeysEnabled && present,
  );

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
      <Eyebrow>Erstnachricht</Eyebrow>
      <PersonHeader
        lead={lead}
        avatarSize={60}
        onOpen={() => onOpenLead(lead.id)}
        subtitle={`Anfrage angenommen ${formatRelative(acceptedAt ?? Date.now())}`}
      >
        <Pill dot={false} icon={isMeta ? <Megaphone /> : <Briefcase />}>
          {signalLabel(lead.signal)}
        </Pill>
      </PersonHeader>

      <div className="mt-10 flex flex-col items-center">
        {isMeta ? (
          <Segmented
            ariaLabel="Template wählen"
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
        <p className="mt-2.5 text-[12.5px] text-ink-3">
          {template.description}
          {edited && ' · bearbeitet'}
        </p>
      </div>

      <div className="mt-5">
        <MessageEditor ref={editorRef} value={text} onChange={setText} variables={variables} onSubmit={send} />
      </div>
    </FocusPage>
  );
}
