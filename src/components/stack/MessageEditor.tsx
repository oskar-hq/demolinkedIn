import { forwardRef, useMemo, useState } from 'react';
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

/**
 * Editierbares Nachrichtenfeld. Eine Textarea mit transparentem Text liegt exakt über einem
 * Backdrop, der denselben Text rendert – dort werden die Variablen farbig hervorgehoben.
 */
export const MessageEditor = forwardRef<HTMLTextAreaElement, MessageEditorProps>(function MessageEditor(
  { value, onChange, variables, placeholder, onSubmit, label = 'Nachricht' },
  ref,
) {
  const [focused, setFocused] = useState(false);
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
          'relative rounded-2xl border bg-surface-2 transition-[border-color,box-shadow] duration-200',
          focused
            ? 'border-white/25 shadow-[0_0_0_4px_rgb(255_255_255/0.04)]'
            : 'border-line hover:border-line-strong',
        )}
      >
        <div aria-hidden className="editor-layer min-h-[132px] text-ink">
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
          ref={ref}
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
              event.currentTarget.blur();
            }
          }}
          className="editor-layer editor-input absolute inset-0 h-full w-full resize-none overflow-hidden rounded-2xl bg-transparent outline-none"
        />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {variables
            .filter((variable) => variable.key !== 'grussformel' && value.includes(variable.value))
            .map((variable) => (
              <span key={variable.key} className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {variable.label}
              </span>
            ))}
        </div>
        <div className="flex items-center gap-3">
          {focused ? (
            <span className="hidden items-center gap-1.5 md:inline-flex">
              <Kbd>⌘ ↵</Kbd> senden <Kbd>Esc</Kbd> fertig
            </span>
          ) : null}
          <span className="tabular-nums">{value.length} Zeichen</span>
        </div>
      </div>
    </div>
  );
});
