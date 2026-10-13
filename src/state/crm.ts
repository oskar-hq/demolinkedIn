import { useEffect, useState } from 'react';
import type { CrmMode } from '../../shared/crm';
import { crmApi } from '../lib/leadSearchApi';

/** Letzter bekannter Stand – damit die Karte beim nächsten Öffnen nicht erst „lädt“. */
let lastMode: CrmMode | null = null;

/**
 * Modus der Close-Übergabe (`GET /api/crm/status`): `mock`/`live` = das Backend legt den Lead in Close an,
 * `off` = kein Schlüssel, die Übergabe wird nur eingetragen. null, solange unbekannt. Wird bei jedem Einsatz neu
 * geholt (ein neuer Schlüssel unter Einstellungen gilt sofort).
 */
export function useCrmMode(): CrmMode | null {
  const [mode, setMode] = useState<CrmMode | null>(lastMode);
  useEffect(() => {
    let alive = true;
    crmApi
      .status()
      .then((status) => {
        lastMode = status.mode;
        if (alive) setMode(status.mode);
      })
      // Älteres Backend ohne Close: wie bisher nur eintragen.
      .catch((error: { status?: number }) => {
        if (error.status === 404) {
          lastMode = 'off';
          if (alive) setMode('off');
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  return mode;
}
