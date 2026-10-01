import { useEffect, useRef } from 'react';

export type HotkeyMap = Partial<Record<string, () => void>>;

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Globale Tastaturkürzel. Schlüssel: event.key in Kleinbuchstaben (z. B. 'arrowright', 'e', '1').
 * Wird ignoriert, solange in ein Textfeld getippt wird oder Modifier gedrückt sind.
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      // Offene Dialoge/Panels haben Vorrang.
      if (document.querySelector('[aria-modal="true"]')) return;
      const handler = mapRef.current[event.key.toLowerCase()];
      if (handler) {
        event.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
