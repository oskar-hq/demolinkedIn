import { Check, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  CLOSED_LEAD_STAGES,
  LEAD_ACTION_RULES,
  LEAD_STAGE_LABELS,
  type BoardColumn,
  type CockpitLead,
  type LeadAction,
  type LeadActionRequest,
  type LeadDetailResponse,
} from '../../../shared/leads';
import { FOUNDERS, otherFounder } from '../../data/founders';
import { cn } from '../../lib/cn';
import { HANDOVER_NOTE_MAX_LENGTH } from '../../../shared/crm';
import { metaAdsLabel } from '../../../shared/leadSearch';
import { DEAL_VALUE_MAX, type ManualMetaAds } from '../../../shared/leads';
import { metaPauseText } from '../../../shared/messages';
import { LEAD_FEEDBACK_REASONS, LEAD_FEEDBACK_REASON_LABELS, type LeadFeedbackInput } from '../../../shared/learning';
import { ApiError, boardApi, crmApi, leadsApi } from '../../lib/leadSearchApi';
import { readableError } from '../../lib/leadView';
import { MESSAGE_TEXT_LIMIT, useCockpit } from '../../state/cockpit';
import { useCrmMode } from '../../state/crm';
import { Button } from '../ui/Button';
import { SectionLabel } from '../ui/SectionLabel';

const NEXT_STEP_LIMIT = 200;

/** Darf die Aktion aus der aktuellen Stufe gemeldet werden? (`LEAD_ACTION_RULES`, wie im Backend.) */
export function actionAllowed(lead: CockpitLead, action: LeadAction): boolean {
  const rule = LEAD_ACTION_RULES[action];
  return rule.from === 'any' || rule.from.includes(lead.stage);
}

type Form = null | 'note' | 'message' | 'reply' | 'meeting' | 'handover' | 'lost';

const FORMS: Record<Exclude<Form, null>, { action: LeadAction; title: string; placeholder: string; required: boolean; submit: string }> = {
  note: { action: 'note', title: 'Notiz', placeholder: 'Was ist passiert, was ist wichtig?', required: true, submit: 'Notiz speichern' },
  // Auf LinkedIn geschrieben, ohne dass die Aufgabe heute im Stapel war (z. B. ein Lead außerhalb des Tageslimits).
  message: {
    action: 'message_sent',
    title: 'Nachricht gesendet',
    placeholder: 'Was hast du auf LinkedIn geschrieben? (optional)',
    required: false,
    submit: 'Nachricht eintragen',
  },
  reply: {
    action: 'message_received',
    title: 'Antwort eintragen',
    placeholder: 'Antwort aus LinkedIn hier einfügen …',
    required: true,
    submit: 'Antwort eintragen',
  },
  meeting: { action: 'meeting_booked', title: 'Termin vereinbart', placeholder: 'Wann und wie? (optional)', required: false, submit: 'Termin eintragen' },
  handover: {
    action: 'handed_over',
    title: 'An Close übergeben',
    placeholder: 'Notiz für Close (optional), z. B. „Termin Do. 10 Uhr“',
    required: false,
    submit: 'An Close übergeben',
  },
  lost: { action: 'lost', title: 'Als verloren markieren', placeholder: 'Grund (optional)', required: false, submit: 'Als verloren eintragen' },
};

/**
 * Von Hand eintragen, was außerhalb des Cockpits passiert ist (Phase 2: gesendet wird auf LinkedIn):
 * nächster Schritt, Zuständig, Anfrage gesendet/angenommen, Notiz, Nachricht, Antwort, Termin, verloren, wieder öffnen. Gespeichert wird sofort – ohne Rückgängig-Fenster.
 */
export function LeadActions({ lead, locked }: { lead: CockpitLead; locked: boolean }) {
  const { mutateLead } = useCockpit();
  // Mit Close-Anbindung legt das Backend den Lead in Close an, sonst wird die Übergabe nur eingetragen.
  const crmMode = useCrmMode();
  const viaClose = crmMode === 'mock' || crmMode === 'live';
  const [form, setForm] = useState<Form>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const closed = CLOSED_LEAD_STAGES.includes(lead.stage);
  const other = otherFounder(lead.owner);

  useEffect(() => {
    if (form) fieldRef.current?.focus();
  }, [form]);

  /** true, wenn gespeichert. */
  const run = async (request: () => Promise<LeadDetailResponse>, after?: () => void, messageSent = false): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await mutateLead(request, lead.id, { messageSent });
      after?.();
      return true;
    } catch (failure) {
      setError(failure instanceof ApiError ? readableError(failure, 'Das hat nicht geklappt.') : 'Keine Verbindung – nichts gespeichert.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const open = (next: Form) => {
    setForm((current) => (current === next ? null : next));
    setText('');
    setError(null);
  };

  const submit = () => {
    if (!form) return;
    const spec = FORMS[form];
    const trimmed = text.trim();
    if (spec.required && !trimmed) return;
    const body: LeadActionRequest = { action: spec.action, ...(trimmed ? { text: trimmed } : {}) };
    void run(
      () => (form === 'handover' && viaClose ? crmApi.handover(lead.id, trimmed ? { note: trimmed } : {}) : leadsApi.act(lead.id, body)),
      () => {
        setForm(null);
        setText('');
      },
      spec.action === 'message_sent',
    );
  };

  const actions: { key: Exclude<Form, null>; label: string; enabled: boolean }[] = [
    { key: 'note', label: 'Notiz', enabled: true },
    { key: 'message', label: 'Nachricht gesendet', enabled: actionAllowed(lead, 'message_sent') },
    { key: 'reply', label: 'Antwort eintragen', enabled: actionAllowed(lead, 'message_received') },
    { key: 'meeting', label: 'Termin vereinbart', enabled: actionAllowed(lead, 'meeting_booked') },
    { key: 'handover', label: 'An Close übergeben', enabled: actionAllowed(lead, 'handed_over') && crmMode !== null },
    { key: 'lost', label: 'Verloren', enabled: !closed },
  ];
  // Ein Klick, ohne Formular: angenommene Anfrage (manueller Betrieb – angenommen wird auf LinkedIn) und „Wieder öffnen“
  // für verlorene oder übergebene Leads (Stufe leitet das Backend aus dem Verlauf ab).
  const instant: { action: LeadAction; label: string; testId: string }[] = [
    { action: 'invite_sent' as const, label: 'Anfrage gesendet', testId: 'action-invite-sent' },
    { action: 'invite_accepted' as const, label: 'Anfrage angenommen', testId: 'action-accepted' },
    { action: 'reopened' as const, label: 'Wieder öffnen', testId: 'action-reopen' },
  ].filter((entry) => actionAllowed(lead, entry.action));
  // In dieser Stufe unmögliche Aktionen erscheinen gar nicht; gesperrt (Speichern läuft) bleibt sichtbar, aber grau.
  const shown = actions.filter((action) => action.enabled);
  const formShown = form !== null && shown.some((action) => action.key === form);
  const baseSpec = form ? FORMS[form] : null;
  // Ohne Close-Anbindung: du legst den Lead selbst in Close an, hier wird die Übergabe nur eingetragen.
  const spec =
    baseSpec && form === 'handover' && !viaClose
      ? { ...baseSpec, title: 'Übergabe eintragen (Close ist nicht angebunden)', placeholder: 'Notiz (optional)', submit: 'Als übergeben eintragen' }
      : baseSpec;
  // Formular eines Chips, der in dieser Stufe nicht mehr gilt, schließen.
  useEffect(() => {
    if (form && !formShown) setForm(null);
  }, [form, formShown]);
  const limit = form === 'handover' ? HANDOVER_NOTE_MAX_LENGTH : MESSAGE_TEXT_LIMIT;
  const tooLong = text.length > limit;

  return (
    <section className="mt-6" aria-label="Eintragen" data-testid="lead-actions">
      <SectionLabel as="h3" className="mb-2.5">
        Eintragen
      </SectionLabel>
      {locked && (
        <p role="status" className="mb-3 text-[12.5px] text-ink-3" data-testid="actions-locked">
          Wartet, bis die letzte Entscheidung gespeichert ist.
        </p>
      )}

      <QualityFeedback lead={lead} disabled={locked || busy} onSave={(feedback) => run(() => leadsApi.update(lead.id, { feedback }))} />
      <NextStep lead={lead} disabled={locked || busy} onSave={(nextStep) => run(() => leadsApi.update(lead.id, { nextStep }))} />
      <DealValue lead={lead} disabled={locked || busy} onSave={(dealValue) => run(() => leadsApi.update(lead.id, { dealValue }))} />
      <MetaAdsEditor lead={lead} disabled={locked || busy} onSave={(metaAds) => run(() => leadsApi.update(lead.id, { metaAds }))} />
      <BoardColumnPicker lead={lead} disabled={locked || busy} onSave={(boardColumn) => run(() => leadsApi.update(lead.id, { boardColumn }))} />

      <div className="mt-3 flex flex-wrap gap-2">
        {instant.map((entry) => (
          <button
            key={entry.action}
            type="button"
            onClick={() => {
              setForm(null);
              void run(() => leadsApi.act(lead.id, { action: entry.action }));
            }}
            disabled={locked || busy}
            data-testid={entry.testId}
            className="inline-flex h-8 items-center rounded-[8px] bg-surface-3 px-3 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-surface-4 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {entry.label}
          </button>
        ))}
        {shown.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => open(action.key)}
            disabled={locked || busy}
            aria-expanded={form === action.key}
            data-testid={`action-form-${action.key}`}
            className={cn(
              'inline-flex h-8 items-center rounded-[8px] px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              form === action.key ? 'bg-surface-4 text-ink' : 'bg-surface-3 text-ink-2 hover:bg-surface-4 hover:text-ink',
            )}
          >
            {action.label}
          </button>
        ))}
      </div>

      {spec && (
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="mb-1.5 block text-[12.5px] text-ink-2" htmlFor={`lead-form-${lead.id}`}>
            {spec.title}
          </label>
          <textarea
            id={`lead-form-${lead.id}`}
            ref={fieldRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
              if (event.key === 'Escape') {
                event.stopPropagation();
                setForm(null);
              }
            }}
            rows={form === 'reply' || form === 'message' ? 4 : 2}
            placeholder={spec.placeholder}
            className="w-full resize-y rounded-xl border border-transparent bg-surface-3 px-3 py-2.5 text-[13.5px] leading-[1.5] text-ink outline-none placeholder:text-ink-4 focus:border-accent"
          />
          {tooLong && <p className="mt-1 text-[12px] text-ink">Höchstens {limit.toLocaleString('de-DE')} Zeichen.</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setForm(null)}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={busy || locked || tooLong || (spec.required && !text.trim())}
              aria-busy={busy}
              icon={<Check className="h-3.5 w-3.5" />}
            >
              {busy ? 'Wird gespeichert …' : spec.submit}
            </Button>
          </div>
        </form>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-3">
        <span>Zuständig: {FOUNDERS[lead.owner].name}</span>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={() => void run(() => leadsApi.update(lead.id, { owner: other }))}
          disabled={locked || busy}
          className="font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-40"
        >
          An {FOUNDERS[other].name} übergeben
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 flex items-baseline gap-2 text-[12.5px] text-ink">
          <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-bad" aria-hidden />
          {error}
        </p>
      )}
    </section>
  );
}

/** Nächster Schritt: ein Satz, direkt bearbeitbar. ↵ speichert, Esc verwirft. */
function NextStep({ lead, disabled, onSave }: { lead: CockpitLead; disabled: boolean; onSave: (value: string | null) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(lead.nextStep ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setValue(lead.nextStep ?? '');
  }, [lead.nextStep, editing]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = async () => {
    const next = value.trim() || null;
    if (next === (lead.nextStep ?? null)) return setEditing(false);
    if (await onSave(next)) setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={disabled}
        className="group flex w-full items-baseline gap-2 rounded-xl px-0 py-1 text-left text-[13.5px] disabled:cursor-not-allowed"
        data-testid="next-step"
      >
        <span className="shrink-0 text-ink-3">Nächster Schritt:</span>
        <span className={cn('min-w-0 flex-1', lead.nextStep ? 'text-ink' : 'text-ink-3')}>{lead.nextStep ?? 'noch keiner'}</span>
        <span className="shrink-0 text-[12.5px] text-ink-3 group-hover:text-ink group-disabled:opacity-40">Ändern</span>
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <input
        ref={inputRef}
        value={value}
        maxLength={NEXT_STEP_LIMIT}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setEditing(false);
          }
        }}
        aria-label="Nächster Schritt"
        placeholder="z. B. Termin Do. 10 Uhr bestätigen"
        className="h-9 min-w-0 flex-1 rounded-full border border-transparent bg-surface-3 px-3.5 text-[13.5px] text-ink outline-none placeholder:text-ink-4 focus:border-accent"
      />
      <Button variant="primary" size="sm" type="submit" disabled={disabled}>
        Speichern
      </Button>
    </form>
  );
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Deal Value (11.10.): ganze Euro, direkt bearbeitbar wie der nächste Schritt. Leer = keiner. Zählt im Dashboard. */
function DealValue({ lead, disabled, onSave }: { lead: CockpitLead; disabled: boolean; onSave: (value: number | null) => Promise<boolean> }) {
  const current = lead.dealValue ?? null;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current === null ? '' : String(current));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setValue(current === null ? '' : String(current));
  }, [current, editing]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = async () => {
    // „25.000“ oder „25000 €“ – nur die Ziffern zählen.
    const digits = value.replace(/\D/g, '');
    const next = digits ? Math.min(DEAL_VALUE_MAX, Number(digits)) : null;
    if (next === current) return setEditing(false);
    if (await onSave(next)) setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={disabled}
        className="group flex w-full items-baseline gap-2 rounded-xl px-0 py-1 text-left text-[13.5px] disabled:cursor-not-allowed"
        data-testid="deal-value"
      >
        <span className="shrink-0 text-ink-3">Deal Value:</span>
        <span className={cn('min-w-0 flex-1 tabular-nums', current !== null ? 'text-ink' : 'text-ink-3')}>{current !== null ? euro.format(current) : 'noch keiner'}</span>
        <span className="shrink-0 text-[12.5px] text-ink-3 group-hover:text-ink group-disabled:opacity-40">Ändern</span>
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <input
        ref={inputRef}
        value={value}
        inputMode="numeric"
        maxLength={14}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setEditing(false);
          }
        }}
        aria-label="Deal Value in Euro"
        placeholder="z. B. 25000"
        className="h-9 min-w-0 flex-1 rounded-full border border-transparent bg-surface-3 px-3.5 text-[13.5px] tabular-nums text-ink outline-none placeholder:text-ink-4 focus:border-accent"
        data-testid="deal-value-input"
      />
      <span className="text-[13.5px] text-ink-3">€</span>
      <Button variant="primary" size="sm" type="submit" disabled={disabled} data-testid="deal-value-save">
        Speichern
      </Button>
    </form>
  );
}

const META_OPTIONS: { value: ManualMetaAds['state']; label: string }[] = [
  { value: 'none', label: 'Nie geschaltet' },
  { value: 'stopped', label: 'Aus' },
  { value: 'active', label: 'Läuft' },
];

/**
 * Meta-Ads von Hand (11.10.): Ohne Meta-Token prüft niemand, ob die Firma Anzeigen schaltet. Hier eintragen – „Aus“ mit
 * Datum macht den Lead zur Reactivation (andere Erstnachricht, {{metapause}} = „seit rund 4 Monaten“).
 */
function MetaAdsEditor({ lead, disabled, onSave }: { lead: CockpitLead; disabled: boolean; onSave: (value: ManualMetaAds) => Promise<boolean> }) {
  const known = lead.metaAds && lead.metaAds.state !== 'unchecked' ? lead.metaAds.state : null;
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<ManualMetaAds['state']>(known ?? 'stopped');
  const [lastStop, setLastStop] = useState(lead.metaAds?.lastStop ?? '');

  useEffect(() => {
    if (!editing) {
      setState(known ?? 'stopped');
      setLastStop(lead.metaAds?.lastStop ?? '');
    }
  }, [known, lead.metaAds?.lastStop, editing]);

  const summary = lead.metaAds
    ? lead.metaAds.state === 'stopped'
      ? `aus · ${metaPauseText(lead.metaAds.lastStop)}`
      : metaAdsLabel(lead.metaAds)
    : 'nicht geprüft';

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={disabled}
        className="group flex w-full items-baseline gap-2 rounded-xl px-0 py-1 text-left text-[13.5px] disabled:cursor-not-allowed"
        data-testid="meta-ads"
      >
        <span className="shrink-0 text-ink-3">Meta-Ads:</span>
        <span className={cn('min-w-0 flex-1', known ? 'text-ink' : 'text-ink-3')}>
          {summary}
          {lead.metaAds?.manual ? <span className="text-ink-3"> · von Hand</span> : null}
        </span>
        <span className="shrink-0 text-[12.5px] text-ink-3 group-hover:text-ink group-disabled:opacity-40">Ändern</span>
      </button>
    );
  }

  return (
    <form
      className="space-y-2 py-1"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(state === 'stopped' ? { state, lastStop: lastStop || null } : { state }).then((ok) => ok && setEditing(false));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setEditing(false);
        }
      }}
      data-testid="meta-ads-form"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13.5px] text-ink-3">Meta-Ads:</span>
        <div role="radiogroup" aria-label="Meta-Ads" className="inline-flex gap-1 rounded-full bg-surface-3 p-[3px]">
          {META_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={state === option.value}
              onClick={() => setState(option.value)}
              className={cn(
                'h-7 rounded-full px-3 text-[12.5px] font-medium transition-colors',
                state === option.value ? 'bg-ink text-black' : 'text-ink-2 hover:text-ink',
              )}
              data-testid={`meta-ads-${option.value}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {state === 'stopped' && (
        <label className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink-3">
          Aus seit
          <input
            type="date"
            value={lastStop}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setLastStop(event.target.value)}
            className="h-9 rounded-full border border-transparent bg-surface-3 px-3.5 text-[13.5px] text-ink outline-none focus:border-accent"
            data-testid="meta-ads-since"
          />
          <span className="text-[12.5px]">{lastStop ? metaPauseText(lastStop) : 'Datum unbekannt → „seit einiger Zeit“'}</span>
        </label>
      )}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" type="submit" disabled={disabled} data-testid="meta-ads-save">
          Speichern
        </Button>
        <Button variant="ghost" size="sm" type="button" onClick={() => setEditing(false)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

/**
 * Lead-Qualität (Wunsch des Nutzers 13.10., `shared/learning.ts`): „Passt“ / „Passt nicht“ mit einem Klick – bei „Passt
 * nicht“ danach optional ein Grund (ein Klick). Erneuter Klick auf die gewählte Seite nimmt die Rückmeldung zurück.
 * Automatische Rückmeldungen (Antwort, Termin, Übergabe) stehen als „automatisch“ da und lassen sich überschreiben.
 * Fließt als Beispiel in die KI-Bewertung und in die Gewichtung der Suchanfragen.
 */
function QualityFeedback({
  lead,
  disabled,
  onSave,
}: {
  lead: CockpitLead;
  disabled: boolean;
  onSave: (value: LeadFeedbackInput | null) => Promise<boolean>;
}) {
  const feedback = lead.feedback ?? null;
  const verdict = feedback?.verdict ?? null;
  const manual = feedback?.source === 'manual';
  const choose = (next: 'good' | 'bad') => void onSave(verdict === next && manual ? null : { verdict: next });
  const options = [
    { value: 'good' as const, label: 'Passt', Icon: ThumbsUp },
    { value: 'bad' as const, label: 'Passt nicht', Icon: ThumbsDown },
  ];

  return (
    <div className="py-1" data-testid="lead-feedback">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13.5px] text-ink-3">Lead-Qualität:</span>
        <div role="radiogroup" aria-label="Lead-Qualität" className="inline-flex gap-1 rounded-full bg-surface-3 p-[3px]">
          {options.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={verdict === value}
              disabled={disabled}
              onClick={() => choose(value)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                verdict === value ? 'bg-ink text-black' : 'text-ink-2 hover:text-ink',
              )}
              data-testid={`lead-feedback-${value}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        {feedback && !manual && (
          <span className="text-[12.5px] text-ink-3" data-testid="lead-feedback-auto">
            automatisch{feedback.outcome ? ` · ${feedback.outcome}` : ''}
          </span>
        )}
      </div>
      {verdict === 'bad' && manual && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Grund" data-testid="lead-feedback-reasons">
          {LEAD_FEEDBACK_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              aria-pressed={feedback?.reason === reason}
              disabled={disabled}
              onClick={() => void onSave({ verdict: 'bad', reason: feedback?.reason === reason ? null : reason })}
              className={cn(
                'h-7 rounded-full border px-2.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                feedback?.reason === reason ? 'border-ink bg-ink text-black' : 'border-white/10 text-ink-2 hover:text-ink',
              )}
              data-testid={`lead-feedback-reason-${reason}`}
            >
              {LEAD_FEEDBACK_REASON_LABELS[reason]}
            </button>
          ))}
        </div>
      )}
      {verdict && (
        <p className="mt-1.5 text-[12px] leading-snug text-ink-3">Die KI bekommt das bei der nächsten Suche als Beispiel mit.</p>
      )}
    </div>
  );
}

/** Eigene Board-Spalte wählen (auch ohne Ziehen, z. B. per Tastatur oder auf dem Handy). Nur, wenn es Spalten gibt. */
function BoardColumnPicker({ lead, disabled, onSave }: { lead: CockpitLead; disabled: boolean; onSave: (value: string | null) => Promise<boolean> }) {
  const [columns, setColumns] = useState<BoardColumn[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    boardApi
      .columns()
      .then((response) => !cancelled && setColumns(response.columns))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!columns?.length) return null;
  return (
    <label className="mt-1 flex items-baseline gap-2 text-[13.5px]">
      <span className="shrink-0 text-ink-3">Spalte im Board:</span>
      <select
        value={lead.boardColumn ?? ''}
        disabled={disabled}
        onChange={(event) => void onSave(event.target.value || null)}
        className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2 py-1 text-[13px] text-ink outline-none focus:border-accent"
        data-testid="board-column-select"
      >
        <option value="">Nach Stufe ({LEAD_STAGE_LABELS[lead.stage]})</option>
        {columns.map((column) => (
          <option key={column.id} value={column.id}>
            {column.name}
          </option>
        ))}
      </select>
    </label>
  );
}
