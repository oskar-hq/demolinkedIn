import { useIsPresent, type MotionValue } from 'motion/react';
import { createContext, useContext, type MutableRefObject } from 'react';

export interface SwipeAction {
  label: string;
  /** `false` zurückgeben, wenn die Seite stehen bleiben soll (z. B. weil erst eine Vorschau öffnet). */
  run: () => boolean | void;
  enabled?: boolean;
}

export interface SwipeActions {
  left: SwipeAction;
  right: SwipeAction;
}

interface SwipeContextValue {
  x: MotionValue<number>;
  actionsRef: MutableRefObject<SwipeActions | null>;
}

export const SwipeContext = createContext<SwipeContextValue | null>(null);

export function useSwipeContext() {
  return useContext(SwipeContext);
}

/** Jede Aufgabe meldet hier, was Wischen nach links bzw. rechts auslöst (dieselben Aktionen wie ← / →). */
export function useSwipeActions(actions: SwipeActions) {
  const context = useContext(SwipeContext);
  const present = useIsPresent();
  if (context && present) context.actionsRef.current = actions;
}

/**
 * Wohin trägt der Schwung die Seite? Apples Projektion aus „Designing Fluid Interfaces“ (WWDC 2018):
 * exponentielles Abbremsen wie beim Scrollen.
 */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}
