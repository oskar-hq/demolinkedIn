import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import { ApiError, demoApi } from '../../lib/leadSearchApi';
import { useAuth } from '../../state/auth';
import { useDemo } from '../../state/demo';

/**
 * Hinweis „Demo mit Beispieldaten“ unten links. Gründer und Admins können die Demo zurücksetzen: Das Backend legt die
 * Beispiel-Leads, Meldungen und Kosten neu an, danach lädt die Seite neu (die Sitzung bleibt).
 */
export function DemoBadge() {
  const { state } = useDemo();
  const { auth } = useAuth();
  const canReset = auth.status === 'authenticated' && auth.user.role !== 'assistant';
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Rückfrage nach ein paar Sekunden wieder schließen.
  useEffect(() => {
    if (step !== 'confirm') return;
    const timer = window.setTimeout(() => setStep('idle'), 4000);
    return () => window.clearTimeout(timer);
  }, [step]);

  const reset = async () => {
    if (step === 'idle') {
      setError(null);
      setStep('confirm');
      return;
    }
    if (step !== 'confirm') return;
    setStep('busy');
    try {
      await demoApi.reset();
      window.location.assign('/');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Zurücksetzen hat nicht geklappt.');
      setStep('idle');
    }
  };

  return (
    <div
      data-testid="demo-badge"
      className={cn(
        'fixed bottom-[calc(var(--nav-bottom)+1rem)] left-4 z-30 items-center gap-2 rounded-full border border-line bg-black/60 py-1 pl-2.5 pr-1 text-[11px] font-medium text-ink-3 backdrop-blur-md',
        // Im Fokus-Modus liegt unten die Entscheidungsleiste – auf kleinen Bildschirmen ausblenden.
        state.view === 'focus' ? 'hidden lg:flex' : 'flex',
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ink-3" aria-hidden />
      {/* Auf dem Handy nur „Demo“ – der Hinweis liegt dort über dem Inhalt. */}
      <span className="sm:hidden">Demo</span>
      <span className="hidden sm:inline">Demo mit Beispieldaten</span>
      {canReset ? (
        <button
          type="button"
          onClick={reset}
          disabled={step === 'busy'}
          data-testid="demo-reset"
          aria-label={step === 'idle' ? 'Demo zurücksetzen' : undefined}
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors',
            step === 'confirm' ? 'bg-ink text-black' : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
          )}
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          {step === 'confirm' ? 'Wirklich zurücksetzen?' : step === 'busy' ? 'Setze zurück …' : <span className="hidden sm:inline">Zurücksetzen</span>}
        </button>
      ) : (
        <span className="pr-1.5" />
      )}
      {error && (
        <span role="alert" className="pr-2 text-ink">
          {error}
        </span>
      )}
    </div>
  );
}
