import type { CardState, Decision, TimelineKind } from '../../state/types';

export interface DecideArgs {
  decision: Decision;
  /** Bestimmt die Richtung der Übergangsanimation. */
  positive: boolean;
  event: { kind: TimelineKind; title: string; detail?: string };
  message?: { text: string; label: string };
  toast: { pending: string; done: string };
}

export interface CardProps {
  card: CardState;
  onDecide: (args: DecideArgs) => void;
  onOpenLead: (leadId: string) => void;
  /** false während Panel/Modal offen sind oder die Karte gerade hinausanimiert. */
  hotkeysEnabled: boolean;
}
