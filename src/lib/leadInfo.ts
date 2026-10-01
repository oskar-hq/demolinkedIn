import type { FitCategory, Lead, Signal } from '../state/types';

export interface FitInfo {
  label: string;
  short: string;
  good: boolean;
}

export const FIT_INFO: Record<FitCategory, FitInfo> = {
  kapitalanlage: { label: 'Passt (Kapitalanlage-Vertrieb)', short: 'Kapitalanlage-Vertrieb', good: true },
  bautraeger: { label: 'Passt (Bauträger)', short: 'Bauträger', good: true },
  makler: { label: 'Vermutlich unpassend (Makler)', short: 'Makler', good: false },
  hausverwaltung: { label: 'Vermutlich unpassend (Hausverwaltung)', short: 'Hausverwaltung', good: false },
};

export function signalLabel(signal: Signal): string {
  return signal.type === 'meta_ads' ? 'Meta Ads aktiv' : `Sucht: ${signal.role}`;
}

export function signalDetail(signal: Signal): string {
  return signal.type === 'meta_ads' ? signal.detail : 'Offene Stelle auf LinkedIn und Jobportalen';
}

export function fullName(lead: Lead): string {
  return `${lead.firstName} ${lead.lastName}`;
}

export function initials(lead: Lead): string {
  return `${lead.firstName[0]}${lead.lastName[0]}`;
}

export function linkedinUrl(lead: Lead): string {
  const slug = `${lead.firstName}-${lead.lastName}`
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
  return `linkedin.com/in/${slug}-${lead.id}`;
}

/** Deterministischer Hash für stabile „Zufallswerte“ je Lead. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}
