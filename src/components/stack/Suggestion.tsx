import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { REPLY_INTENT_LABELS, type MessageSuggestion, type SuggestKind } from '../../../shared/messages';
import { ApiError, messagesApi } from '../../lib/leadSearchApi';
import { letterOf, useTemplates } from '../../state/templates';
import { Button } from '../ui/Button';

type SuggestionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; suggestion: MessageSuggestion }
  | { status: 'error'; message: string };

const SOURCE_LABEL: Record<MessageSuggestion['source'], string> = {
  ai: 'KI-Vorschlag',
  template: 'Vorlage',
  mock: 'Vorschlag',
};

/**
 * Holt einen Textvorschlag vom Backend (`POST /api/leads/:id/suggest`). `templateId`: diese Vorlage als Grundlage
 * (z. B. die gerade gewählte Erstnachricht) – sonst wählt das Backend passend zum Lead.
 */
export function useSuggestion(leadId: string, kind: SuggestKind, onText?: (text: string, templateId: string | null) => void, templateId?: string) {
  const [state, setState] = useState<SuggestionState>({ status: 'idle' });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Immer nur ein Vorschlag gleichzeitig – auch über die Taste K, während der Knopf gesperrt ist.
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState({ status: 'loading' });
    try {
      const suggestion = await messagesApi.suggest(leadId, { kind, ...(templateId ? { templateId } : {}) });
      if (!alive.current) return;
      setState({ status: 'done', suggestion });
      onText?.(suggestion.text, suggestion.templateId);
    } catch (error) {
      if (!alive.current) return;
      const message =
        error instanceof ApiError && error.status === 404 && error.code !== 'not_found'
          ? 'Vorschläge kommen mit dem nächsten Update des Servers.'
          : error instanceof Error
            ? error.message
            : 'Vorschlag nicht möglich.';
      setState({ status: 'error', message });
    } finally {
      busy.current = false;
    }
  }, [kind, leadId, onText, templateId]);

  return { state, run };
}

/** Knopf „Vorschlag“ – Kürzel K. */
export function SuggestButton({ state, onClick, label = 'Vorschlag' }: { state: SuggestionState; onClick: () => void; label?: ReactNode }) {
  const loading = state.status === 'loading';
  return (
    <Button variant="ghost" size="sm" shortcut="K" onClick={onClick} disabled={loading} icon={<Sparkles className="h-3.5 w-3.5" />} data-testid="suggest-button">
      {loading ? 'Wird geschrieben …' : label}
    </Button>
  );
}

/** Zeile unter dem Knopf: woher der Text kommt, warum, Hinweise und bei Antworten die Einschätzung. */
/** `showReply`: Einschätzung der Antwort zeigen – aus, wenn die Karte sie schon zeigt. */
export function SuggestionNote({ state, showReply = true }: { state: SuggestionState; showReply?: boolean }) {
  if (state.status === 'error') {
    return (
      <p role="alert" className="mt-2 text-center text-[12.5px] text-bad" data-testid="suggest-error">
        {state.message}
      </p>
    );
  }
  if (state.status !== 'done') return null;
  const { suggestion } = state;
  return <SuggestionNoteDone suggestion={suggestion} showReply={showReply} />;
}

function SuggestionNoteDone({ suggestion, showReply }: { suggestion: MessageSuggestion; showReply: boolean }) {
  const { state: templates } = useTemplates();
  // Vorlage wie auf der Karte mit Buchstaben („Vorlage B“); unbekannte (z. B. gerade gelöscht) mit ihrer ID.
  const letter = templates.status === 'ready' ? letterOf(templates.templates, suggestion.templateId) : null;
  const source = letter ? `Vorlage ${letter}` : suggestion.templateId;
  return (
    <div className="mt-2 text-center text-[12.5px] leading-[1.5] text-ink-3" data-testid="suggest-note" aria-live="polite">
      <p>
        <span className="text-ink-2">{SOURCE_LABEL[suggestion.source]}</span>
        {source && ` · ${source}`} · {suggestion.basis}
      </p>
      {showReply && suggestion.reply && (
        <p className="mt-0.5">
          Einschätzung: <span className="text-ink-2">{REPLY_INTENT_LABELS[suggestion.reply.intent]}</span> – {suggestion.reply.summary}
        </p>
      )}
      {suggestion.notice && <p className="mt-0.5 text-warn">{suggestion.notice}</p>}
    </div>
  );
}
