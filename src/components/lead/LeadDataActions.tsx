import { useState } from 'react';
import type { CockpitLead } from '../../../shared/leads';
import { ApiError, leadsApi, saveBlob } from '../../lib/leadSearchApi';
import { leadName } from '../../lib/leadView';
import { useAccess } from '../../state/auth';
import { useCockpit } from '../../state/cockpit';
import { useDemo } from '../../state/demo';
import { Button } from '../ui/Button';

/** Leiser Textknopf wie in den Einstellungen – keine zweite Haupt-Aktion im Panel. */
const QUIET_LINK = 'font-medium text-ink-3 underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-40';

/**
 * Betroffenenrechte (DSGVO, `shared/leads.ts`): „Daten exportieren“ (Auskunft) und „Lead endgültig löschen“ – unten im
 * Lead-Panel, nur für Gründer und Admins. Löschen erst nach einer Rückfrage im Panel selbst.
 */
export function LeadDataActions({ lead }: { lead: CockpitLead }) {
  const access = useAccess();
  const { dispatch } = useDemo();
  const { reload, forgetLead } = useCockpit();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (access.role === 'assistant') return null;

  const exportData = async () => {
    setBusy('export');
    setError(null);
    try {
      const day = new Date().toISOString().slice(0, 10);
      saveBlob(await leadsApi.exportData(lead.id), `lead-${lead.id}-${day}.json`);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Der Export hat nicht geklappt.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    setError(null);
    try {
      const result = await leadsApi.remove(lead.id);
      forgetLead(lead.id);
      dispatch({ type: 'CLOSE_PANEL' });
      dispatch({ type: 'NOTIFY', title: `${leadName(lead)} gelöscht`, detail: result.message });
      void reload();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Löschen hat nicht geklappt.');
      setBusy(null);
    }
  };

  return (
    <section className="mt-10" data-testid="lead-data-actions">
      {confirming ? (
        <div role="group" aria-labelledby="lead-delete-title" data-testid="lead-delete-confirm">
          <p id="lead-delete-title" className="text-[14px] font-medium text-ink">
            {leadName(lead)} endgültig löschen?
          </p>
          <p className="mt-1 text-[13px] leading-[1.55] text-ink-2">
            Lead, Verlauf und alle Nachrichten sind sofort weg – das lässt sich nicht rückgängig machen. Es bleibt nur ein
            anonymer Fingerabdruck, damit die Lead-Suche diese Person nie wieder vorschlägt.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void remove()} data-testid="lead-delete-confirm-button">
              {busy === 'delete' ? 'Wird gelöscht…' : 'Endgültig löschen'}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px]">
          <button type="button" className={QUIET_LINK} disabled={busy !== null} onClick={() => void exportData()} data-testid="lead-export">
            {busy === 'export' ? 'Wird exportiert…' : 'Daten exportieren'}
          </button>
          <button type="button" className={QUIET_LINK} disabled={busy !== null} onClick={() => setConfirming(true)} data-testid="lead-delete">
            Lead endgültig löschen
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 flex items-baseline gap-2 text-[13px] text-ink">
          <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-bad" aria-hidden />
          {error}
        </p>
      )}
    </section>
  );
}
