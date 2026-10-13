import type { CrmMode } from '../../../shared/crm';
import { useLinkedIn } from '../../state/linkedin';

/**
 * Vernetzen und Schreiben (Phase 3, `shared/linkedin.ts`):
 * send = das Cockpit sendet über den LinkedIn-Account des Gründers (Simulation oder echt über Unipile).
 * protocol = LinkedIn-Aktionen aus oder kein Account: Du machst es auf LinkedIn, das Cockpit trägt es nur ein.
 * Solange der Status unbekannt ist, gilt „protocol“: lieber zu ehrlich als „Gesendet“ ohne Senden.
 */
export type ActionMode = 'send' | 'protocol';

export function useActionMode(): ActionMode {
  return useLinkedIn().canSend ? 'send' : 'protocol';
}

/**
 * Übergabe nach Close (`shared/crm.ts`): close = das Backend legt den Lead in Close an (Simulation oder echt),
 * protocol = kein Close-Schlüssel – du legst ihn selbst an, das Cockpit trägt die Übergabe nur ein.
 * null = Status noch unbekannt (dann wird nicht übergeben, bis er da ist).
 */
export type ExportMode = 'close' | 'protocol';

export function exportModeOf(crmMode: CrmMode | null): ExportMode | null {
  return crmMode === null ? null : crmMode === 'off' ? 'protocol' : 'close';
}

export const ACTION_TEXTS = {
  connect: {
    send: {
      button: 'Vernetzen',
      short: 'Vernetzen',
      swipe: 'Vernetzen',
      pending: 'Vernetzungsanfrage wird gesendet',
      done: 'Vernetzungsanfrage gesendet',
      toastShort: { pending: 'Wird gesendet', done: 'Gesendet' },
    },
    protocol: {
      button: 'Anfrage eintragen',
      short: 'Eintragen',
      swipe: 'Anfrage eintragen',
      pending: 'Anfrage wird eingetragen',
      done: 'Anfrage eingetragen',
      toastShort: { pending: 'Wird eingetragen', done: 'Eingetragen' },
    },
  },
  send: {
    send: { button: 'Senden', short: 'Senden', swipe: 'Senden', pending: 'wird gesendet', done: 'Gesendet', toastShort: { pending: 'Wird gesendet', done: 'Gesendet' } },
    protocol: {
      button: 'Als gesendet eintragen',
      short: 'Eintragen',
      swipe: 'Eintragen',
      pending: 'wird eingetragen',
      done: 'Eingetragen',
      toastShort: { pending: 'Wird eingetragen', done: 'Eingetragen' },
    },
  },
  export: {
    close: {
      button: 'An Close übergeben',
      short: 'Nach Close',
      swipe: 'An Close übergeben',
      pending: 'Wird an Close übergeben',
      done: 'An Close übergeben',
      toastShort: { pending: 'Wird übergeben', done: 'Übergeben' },
    },
    protocol: {
      button: 'Übergabe eintragen',
      short: 'Eintragen',
      swipe: 'Übergabe eintragen',
      pending: 'Übergabe wird eingetragen',
      done: 'Als übergeben eingetragen',
      toastShort: { pending: 'Wird eingetragen', done: 'Eingetragen' },
    },
  },
} as const;

export const SKIP_TOAST = { pending: 'Für heute übersprungen', done: 'Für heute übersprungen' };
