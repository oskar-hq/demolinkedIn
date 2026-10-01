import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { LEADS, LEADS_BY_ID } from '../data/leads';
import { buildHistory, type LeadHistory } from '../data/history';
import type {
  CardState,
  CardType,
  Decision,
  FounderId,
  Message,
  StackFilter,
  TimelineEvent,
  TimelineKind,
  View,
} from './types';

export const TYPE_PRIORITY: Record<CardType, number> = { reply: 0, followup: 1, first: 2, lead: 3 };

interface Snapshot {
  cards: Record<string, CardState>;
  order: string[];
  sessionMessages: Record<string, Message[]>;
  sessionEvents: Record<string, TimelineEvent[]>;
  cardId: string;
}

/**
 * Wie die zuletzt sichtbare Aufgabe den Bildschirm verlassen hat – steuert die Übergänge,
 * damit Ein- und Ausgang räumlich zusammenpassen (z. B. kommt „Rückgängig“ von der Seite zurück,
 * zu der die Aufgabe verschwunden ist).
 */
export interface PageMotion {
  kind: 'decide' | 'undo' | 'jump';
  /** Richtung der Entscheidung: true = rechts (positiv), false = links. */
  positive: boolean;
}

export interface DemoState {
  founder: FounderId | null;
  loginAt: number | null;
  view: View;
  filter: StackFilter;
  /** Zeitpunkt, relativ zu dem der Verlauf erzeugt wurde. */
  createdAt: number;
  histories: Record<string, LeadHistory>;
  cards: Record<string, CardState>;
  order: string[];
  sessionMessages: Record<string, Message[]>;
  sessionEvents: Record<string, TimelineEvent[]>;
  pinged: Record<FounderId, boolean>;
  slackToast: { leadId: string; at: number } | null;
  panelLeadId: string | null;
  pageMotion: PageMotion;
  undoStack: Snapshot[];
  /** Erhöht sich bei jedem Reset – dient als React-Key zum vollständigen Neuaufbau. */
  generation: number;
}

export interface DecisionPayload {
  cardId: string;
  decision: Decision;
  positive: boolean;
  event: { kind: TimelineKind; title: string; detail?: string };
  message?: { text: string; label: string };
}

export type DemoAction =
  | { type: 'LOGIN'; founder: FounderId }
  | { type: 'LOGOUT' }
  | { type: 'RESET' }
  | { type: 'SET_VIEW'; view: View }
  | { type: 'SET_FILTER'; filter: StackFilter }
  | { type: 'START_FOCUS'; filter: StackFilter }
  | { type: 'DECIDE'; payload: DecisionPayload }
  | { type: 'UNDO' }
  | { type: 'PING_ARRIVE'; founder: FounderId }
  | { type: 'DISMISS_SLACK' }
  | { type: 'FOCUS_CARD'; cardId: string }
  | { type: 'OPEN_PANEL'; leadId: string }
  | { type: 'CLOSE_PANEL' };

function createInitialState(generation = 0): DemoState {
  const now = Date.now();
  const histories: Record<string, LeadHistory> = {};
  const cards: Record<string, CardState> = {};
  for (const lead of LEADS) {
    histories[lead.id] = buildHistory(lead, now);
    cards[lead.id] = {
      id: lead.id,
      leadId: lead.id,
      type: lead.stage,
      owner: lead.owner,
      status: 'pending',
      available: !lead.arrivesViaPing,
    };
  }
  const order = LEADS.map((lead, index) => ({ lead, index }))
    .sort((a, b) => TYPE_PRIORITY[a.lead.stage] - TYPE_PRIORITY[b.lead.stage] || a.index - b.index)
    .map(({ lead }) => lead.id);

  return {
    founder: null,
    loginAt: null,
    view: 'home',
    filter: 'all',
    createdAt: now,
    histories,
    cards,
    order,
    sessionMessages: {},
    sessionEvents: {},
    pinged: { nick: false, johannes: false },
    slackToast: null,
    panelLeadId: null,
    pageMotion: { kind: 'jump', positive: true },
    undoStack: [],
    generation,
  };
}

/** Offene Karten des Gründers in Stapel-Reihenfolge, optional gefiltert. */
export function pendingCards(state: DemoState, founder: FounderId, filter: StackFilter = 'all'): CardState[] {
  return state.order
    .map((id) => state.cards[id])
    .filter(
      (card) =>
        card.owner === founder &&
        card.available &&
        card.status === 'pending' &&
        (filter === 'all' || card.type === filter),
    );
}

export function founderCards(state: DemoState, founder: FounderId): CardState[] {
  return state.order.map((id) => state.cards[id]).filter((card) => card.owner === founder && card.available);
}

function moveToFront(order: string[], id: string): string[] {
  return [id, ...order.filter((entry) => entry !== id)];
}

function append<T>(map: Record<string, T[]>, key: string, item: T): Record<string, T[]> {
  return { ...map, [key]: [...(map[key] ?? []), item] };
}

function reducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, founder: action.founder, loginAt: Date.now(), view: 'home', filter: 'all' };

    case 'LOGOUT':
      return { ...state, founder: null, loginAt: null, slackToast: null, panelLeadId: null };

    case 'RESET':
      return createInitialState(state.generation + 1);

    case 'SET_VIEW':
      return { ...state, view: action.view, panelLeadId: null };

    case 'SET_FILTER':
      return { ...state, filter: action.filter, pageMotion: { kind: 'jump', positive: true } };

    case 'START_FOCUS':
      return { ...state, view: 'focus', filter: action.filter, panelLeadId: null, pageMotion: { kind: 'jump', positive: true } };

    case 'DECIDE': {
      const { cardId, decision, positive, event, message } = action.payload;
      const card = state.cards[cardId];
      if (!card || card.status !== 'pending') return state;
      const now = Date.now();
      const snapshot: Snapshot = {
        cards: state.cards,
        order: state.order,
        sessionMessages: state.sessionMessages,
        sessionEvents: state.sessionEvents,
        cardId,
      };
      let sessionMessages = state.sessionMessages;
      if (message) {
        sessionMessages = append(sessionMessages, card.leadId, {
          id: `${card.leadId}-live-${now}`,
          from: 'founder',
          founder: card.owner,
          text: message.text,
          label: message.label,
          at: now,
        });
      }
      return {
        ...state,
        cards: { ...state.cards, [cardId]: { ...card, status: 'done', decision, decidedAt: now } },
        sessionMessages,
        sessionEvents: append(state.sessionEvents, card.leadId, {
          id: `${card.leadId}-live-e-${now}`,
          ...event,
          at: now,
          by: card.owner,
          live: true,
        }),
        undoStack: [...state.undoStack.slice(-29), snapshot],
        pageMotion: { kind: 'decide', positive },
      };
    }

    case 'UNDO': {
      const snapshot = state.undoStack[state.undoStack.length - 1];
      if (!snapshot) return state;
      const card = snapshot.cards[snapshot.cardId];
      const filterMatches = state.filter === 'all' || state.filter === card.type;
      const undone = state.cards[snapshot.cardId].decision;
      const wasPositive = undone === 'connect' || undone === 'send' || undone === 'export';
      return {
        ...state,
        cards: snapshot.cards,
        order: moveToFront(snapshot.order, snapshot.cardId),
        sessionMessages: snapshot.sessionMessages,
        sessionEvents: snapshot.sessionEvents,
        undoStack: state.undoStack.slice(0, -1),
        filter: filterMatches ? state.filter : 'all',
        view: 'focus',
        pageMotion: { kind: 'undo', positive: wasPositive },
      };
    }

    case 'PING_ARRIVE': {
      if (state.pinged[action.founder]) return state;
      const lead = LEADS.find((entry) => entry.owner === action.founder && entry.arrivesViaPing);
      if (!lead) return state;
      const now = Date.now();
      const reply = lead.replies?.[0];
      // Neue Antwort direkt hinter die aktuell sichtbare Karte legen → sie ist als Nächstes dran.
      const current = pendingCards(state, action.founder, state.filter)[0] ?? pendingCards(state, action.founder)[0];
      const withoutLead = state.order.filter((id) => id !== lead.id);
      const insertAt = current ? withoutLead.indexOf(current.id) + 1 : 0;
      const order = [...withoutLead.slice(0, insertAt), lead.id, ...withoutLead.slice(insertAt)];
      let sessionMessages = state.sessionMessages;
      let sessionEvents = state.sessionEvents;
      if (reply) {
        sessionMessages = append(sessionMessages, lead.id, {
          id: `${lead.id}-ping`,
          from: 'lead',
          text: reply.text,
          at: now,
        });
        sessionEvents = append(sessionEvents, lead.id, {
          id: `${lead.id}-ping-e`,
          kind: 'message_received',
          at: now,
          title: `Antwort von ${lead.firstName} erhalten`,
          detail: reply.text,
          live: true,
        });
      }
      return {
        ...state,
        order,
        cards: { ...state.cards, [lead.id]: { ...state.cards[lead.id], available: true } },
        sessionMessages,
        sessionEvents,
        pinged: { ...state.pinged, [action.founder]: true },
        slackToast: { leadId: lead.id, at: now },
      };
    }

    case 'DISMISS_SLACK':
      return { ...state, slackToast: null };

    case 'FOCUS_CARD': {
      const card = state.cards[action.cardId];
      if (!card) return state;
      return {
        ...state,
        order: moveToFront(state.order, action.cardId),
        filter: 'all',
        view: 'focus',
        slackToast: null,
        panelLeadId: null,
        pageMotion: { kind: 'jump', positive: true },
      };
    }

    case 'OPEN_PANEL':
      return { ...state, panelLeadId: action.leadId };

    case 'CLOSE_PANEL':
      return { ...state, panelLeadId: null };
  }
}

const DemoContext = createContext<{ state: DemoState; dispatch: Dispatch<DemoAction> } | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, 0, createInitialState);
  return <DemoContext.Provider value={{ state, dispatch }}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('useDemo muss innerhalb von DemoProvider verwendet werden');
  return context;
}

/** Vollständiger Verlauf eines Leads inkl. der Aktionen aus dieser Sitzung. */
export function useLeadHistory(leadId: string) {
  const { state } = useDemo();
  const base = state.histories[leadId];
  const messages = [...base.messages, ...(state.sessionMessages[leadId] ?? [])].sort((a, b) => a.at - b.at);
  const events = [...base.events, ...(state.sessionEvents[leadId] ?? [])].sort((a, b) => a.at - b.at);
  return { lead: LEADS_BY_ID[leadId], messages, events, acceptedAt: base.acceptedAt, lastOwnMessageAt: base.lastOwnMessageAt };
}
