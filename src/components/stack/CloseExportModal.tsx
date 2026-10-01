import { ArrowUpRight, Check, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FOUNDERS } from '../../data/founders';
import { FIT_INFO, fullName, linkedinUrl, signalLabel } from '../../lib/leadInfo';
import type { Lead, Message } from '../../state/types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface CloseExportModalProps {
  open: boolean;
  lead: Lead;
  messages: Message[];
  onClose: () => void;
  onConfirm: () => void;
}

export function CloseExportModal({ open, lead, messages, onClose, onConfirm }: CloseExportModalProps) {
  const [attachThread, setAttachThread] = useState(true);
  const tone = lead.replyAssessment?.tone;
  const status = tone === 'positive' ? 'Termin vereinbaren' : tone === 'question' ? 'Interessiert – Rückfrage' : 'Kein Interesse';
  const ownMessages = messages.filter((message) => message.from === 'founder');
  const firstLabel = ownMessages[0]?.label?.split(' · ')[1];

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onConfirm]);

  const fields: [string, string][] = [
    ['Kontakt', fullName(lead)],
    ['Position', lead.position],
    ['Firma', lead.company],
    ['Branche', lead.industry],
    ['KI-Einschätzung', FIT_INFO[lead.fit].label],
    ['Region', lead.region],
    ['LinkedIn', linkedinUrl(lead)],
    ['Lead-Status', status],
    ['Zuständig', FOUNDERS[lead.owner].name],
    ['Quelle', `LinkedIn Outreach · ${firstLabel ?? '–'}`],
    ['Signal', signalLabel(lead.signal)],
    ['Nachrichten', `${ownMessages.length} gesendet · ${messages.length - ownMessages.length} erhalten`],
    ['Nächster Schritt', lead.nextStep ?? '–'],
  ];

  return (
    <Modal open={open} onClose={onClose} labelledBy="close-export-title">
      <div className="flex max-h-[92vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-7 pb-5 pt-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-ink text-[11px] font-bold text-black">C</span>
              Export nach Close
            </div>
            <h2 id="close-export-title" className="display text-[24px] font-semibold">
              {fullName(lead)} übertragen
            </h2>
            <p className="mt-1 text-[13.5px] text-ink-2">Vorschau – diese Daten werden als Lead in Close angelegt.</p>
          </div>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-7 py-6">
          <section className="rounded-2xl border border-accent/25 bg-accent-soft p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.06em] text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              KI-Zusammenfassung des Verlaufs
            </div>
            <p className="text-[14.5px] leading-[1.6] text-ink">{lead.closeSummary}</p>
          </section>

          <h3 className="mb-2 mt-6 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">Felder</h3>
          <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {fields.map(([label, value]) => (
              <div key={label} className="min-w-0 bg-surface-2 px-4 py-2.5">
                <dt className="text-[11.5px] text-ink-3">{label}</dt>
                <dd className="mt-0.5 truncate text-[13.5px] text-ink" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <label className="mt-5 flex cursor-pointer items-center gap-3 text-[13.5px] text-ink-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={attachThread}
              onClick={() => setAttachThread((value) => !value)}
              className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                attachThread ? 'border-ink bg-ink text-black' : 'border-line-strong'
              }`}
            >
              {attachThread && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </button>
            Kompletten Nachrichtenverlauf als Notiz anhängen ({messages.length} Nachrichten)
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-white/[0.015] px-7 py-4">
          <Button variant="ghost" size="lg" shortcut="Esc" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" size="lg" shortcut="↵" onClick={onConfirm} icon={<ArrowUpRight className="h-4 w-4" />}>
            Jetzt exportieren
          </Button>
        </div>
      </div>
    </Modal>
  );
}
