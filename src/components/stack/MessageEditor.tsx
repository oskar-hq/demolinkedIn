import { PenLine } from 'lucide-react';
import { forwardRef, useCallback, useMemo, useRef, useState, type ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { findHighlights, type TemplateVariable } from '../../lib/template';
import { Kbd } from '../ui/Kbd';

interface MessageEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables: TemplateVariable[];
  placeholder?: string;
  onSubmit?: () => void;
  label?: string;
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/** Cursor ans Ende setzen und Feld fokussieren. */
export function focusAtEnd(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
}

/**
 * Editierbares Nachrichtenfeld. Eine Textarea mit transparentem Text liegt exakt über einem
 * Backdrop, der denselben Text rendert – dort werden die Variablen farbig hervorgehoben.
 */
export const MessageEditor = forwardRef<HTMLTextAreaElement, MessageEditorProps>(function MessageEditor(
  { value, onChange, variables, placeholder, onSubmit, label = 'Nachricht' },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      fieldRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  const segments = useMemo(() => {
    const ranges = findHighlights(value, variables);
    const parts: { text: string; key?: string }[] = [];
    let cursor = 0;
    for (const range of ranges) {
      if (range.start > cursor) parts.push({ text: value.slice(cursor, range.start) });
      parts.push({ text: value.slice(range.start, range.end), key: range.key });
      cursor = range.end;
    }
    if (cursor < value.length) parts.push({ text: value.slice(cursor) });
    return parts;
  }, [value, variables]);

  return (
    <div>
      <div
        className={cn(
          'relative rounded-[22px] border text-left transition-[border-color,background-color] duration-200',
          focused ? 'border-white/25 bg-white/[0.05]' : 'border-transparent bg-white/[0.04] hover:bg-white/[0.055]',
        )}
      >
        <div aria-hidden className="editor-layer min-h-[140px] text-ink">
          {value.length === 0 && <span className="text-ink-3">{placeholder}</span>}
          {segments.map((part, index) =>
            part.key ? (
              <span key={index} className="variable-mark">
                {part.text}
              </span>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
          {value.endsWith('\n') && ' '}
        </div>
        <textarea
          ref={setRefs}
          aria-label={label}
          value={value}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              onSubmit?.();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.blur();
            }
          }}
          className="editor-layer editor-input absolute inset-0 h-full w-full resize-none overflow-hidden rounded-[22px] bg-transparent outline-none"
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 px-1 text-[12.5px] text-ink-3">
        {focused ? (
          <span className="inline-flex items-center gap-1.5">
            <Kbd>⌘ ↵</Kbd> senden <Kbd>Esc</Kbd> fertig
          </span>
        ) : (
          <button
            type="button"
            onClick={() => focusAtEnd(fieldRef.current)}
            className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <PenLine className="h-3.5 w-3.5" />
            Bearbeiten
            <Kbd>E</Kbd>
          </button>
        )}
        <span className="tabular-nums">{value.length} Zeichen</span>
      </div>
    </div>
  );
});
