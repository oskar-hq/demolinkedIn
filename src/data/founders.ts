import type { FounderId } from '../state/types';

export interface Founder {
  id: FounderId;
  name: string;
  fullName: string;
  role: string;
  initials: string;
  /** Grußformel am Ende jeder Nachricht. */
  greeting: string;
  linkedinAccount: string;
}

export const FOUNDERS: Record<FounderId, Founder> = {
  nick: {
    id: 'nick',
    name: 'Nick',
    fullName: 'Nick',
    role: 'Gründer · Vertrieb',
    initials: 'N',
    greeting: 'Viele Grüße\nNick',
    linkedinAccount: 'LinkedIn-Account Nick',
  },
  johannes: {
    id: 'johannes',
    name: 'Johannes',
    fullName: 'Johannes',
    role: 'Gründer · Performance',
    initials: 'J',
    greeting: 'Beste Grüße\nJohannes',
    linkedinAccount: 'LinkedIn-Account Johannes',
  },
};

export const FOUNDER_IDS: FounderId[] = ['nick', 'johannes'];

export function otherFounder(id: FounderId): FounderId {
  return id === 'nick' ? 'johannes' : 'nick';
}
