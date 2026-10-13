import { ArrowRight, BellRing } from 'lucide-react';
import { FOUNDERS } from '../../data/founders';
import { formatTime, greetingForTime } from '../../lib/time';
import { useHotkeys } from '../../lib/useHotkeys';
import { useAccess } from '../../state/auth';
import { useCockpit } from '../../state/cockpit';
import { founderCards, useDemo } from '../../state/demo';
import type { FounderId } from '../../state/types';
import { AutoSearchHint } from '../autoSearch/AutoSearchHint';
import { Button } from '../ui/Button';
import { DelayedStatus } from './FocusView';
import { HomeLists } from './HomeLists';
import { LinkedInStatus } from './LinkedInStatus';
import { SuccessScreen } from './SuccessScreen';
import { TYPE_ORDER, typeLabel } from './summary';

/** Ruhige Startseite: wie viel heute ansteht – und ein einziger Button zum Loslegen. */
export function HomeView() {
  const { state, dispatch } = useDemo();
  const { reload, retryWaiting } = useCockpit();
  const access = useAccess();
  const founder = state.founder as FounderId;
  const stack = state.stack;
  const all = founderCards(state, founder);
  const pending = all.filter((card) => card.status === 'pending');
  const doneCount = all.length - pending.length;
  const waiting = Object.values(stack.outcomes).filter((outcome) => outcome.commit === 'waiting').length;
  // „Neu“-Marker für Leads, die heute (in dieser Sitzung) aus der Lead-Suche kamen.
  const freshLeads = pending.some((card) => card.type === 'lead' && stack.handoffFirst.includes(card.leadId));
  // Fällige Follow-ups (seit FOLLOWUP_AFTER_DAYS ohne Antwort) bekommen einen eigenen Hinweis mit Namen.
  const followups = pending.filter((card) => card.type === 'followup');
  const followupNames = followups.slice(0, 3).map((card) => {
    const person = stack.tasks[card.id]?.lead.person;
    return person ? `${person.firstName} ${person.lastName}` : null;
  }).filter(Boolean);
  const ready = stack.status === 'ready';
  const start = () => dispatch({ type: 'START_FOCUS', filter: 'all' });
  const search = () => dispatch({ type: 'SET_VIEW', view: 'search' });

  const phase = !ready ? (stack.status === 'error' ? 'error' : 'loading') : pending.length > 0 ? 'open' : doneCount > 0 ? 'done' : 'empty';

  useHotkeys(
    { enter: phase === 'open' ? start : phase === 'empty' ? search : phase === 'error' ? () => void reload() : () => {} },
    (phase === 'open' || phase === 'empty' || phase === 'error') && !state.panelLeadId,
  );

  return (
    <div className="flex min-h-[var(--app-h)] flex-col items-center justify-center px-5 pb-28 pt-12 text-center" data-testid="home">
      {/* Keine eigene Einblendung: Die Ansicht als Ganzes blendet schon ein (App.tsx) – zwei übereinander wirken träge. */}
      <div className="flex flex-col items-center">
        <h1 className="display text-[34px] font-semibold text-ink-2 sm:text-[40px]">
          {greetingForTime()}, <span className="text-ink">{access.user?.name ?? FOUNDERS[founder].name}.</span>
        </h1>
        {/* Admin und Mitarbeiter arbeiten die Aufgaben eines Gründers ab – das soll immer sichtbar sein. */}
        {access.role !== 'founder' && (
          <p className="mt-2 text-[15px] text-ink-2" data-testid="working-for">
            Aufgaben von <span className="font-medium text-ink">{FOUNDERS[founder].name}</span>
          </p>
        )}

        {phase === 'loading' && (
          // Platz der großen Zahl freihalten, damit nichts springt, wenn die Aufgaben da sind.
          <div className="mt-14 flex h-[200px] items-center">
            <DelayedStatus>Aufgaben werden geladen …</DelayedStatus>
          </div>
        )}

        {phase === 'error' && (
          <div role="alert" className="mt-14 flex flex-col items-center">
            <p className="display text-[26px] font-semibold">Deine Aufgaben konnten nicht geladen werden.</p>
            <p className="mt-2 text-[16px] text-ink-2">{stack.error}</p>
            <Button variant="primary" size="xl" shortcut="↵" className="mt-10" onClick={() => void reload()}>
              Erneut versuchen
            </Button>
          </div>
        )}

        {phase === 'empty' && (
          <div className="mt-14 flex flex-col items-center">
            <p className="display text-[32px] font-semibold">Heute steht nichts an.</p>
            <Button variant="primary" size="xl" shortcut="↵" className="mt-8" onClick={search} data-testid="home-search">
              Neue Leads suchen
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {phase === 'open' && (
          <>
            <p className="display mt-14 text-[96px] font-semibold leading-none tracking-[-0.04em] sm:text-[120px]" data-testid="open-count">
              {pending.length}
            </p>
            <p className="mt-3 text-[19px] text-ink-2">
              {doneCount === 0 ? 'Aufgaben für heute' : `${pending.length === 1 ? 'Aufgabe' : 'Aufgaben'} offen · ${doneCount} erledigt`}
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-x-1 gap-y-1">
              {TYPE_ORDER.map((type) => {
                const count = pending.filter((card) => card.type === type).length;
                if (count === 0) return null;
                return (
                  <button
                    key={type}
                    type="button"
                    data-testid={`start-${type}`}
                    onClick={() => dispatch({ type: 'START_FOCUS', filter: type })}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[14px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                  >
                    {type === 'lead' && freshLeads && (
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    )}
                    <span className="tabular-nums text-ink-2">{count}</span> {typeLabel(type, count)}
                  </button>
                );
              })}
            </div>

            {followups.length > 0 && (
              <button
                type="button"
                data-testid="followup-notice"
                onClick={() => dispatch({ type: 'START_FOCUS', filter: 'followup' })}
                className="mt-8 flex max-w-[480px] items-start gap-3 rounded-2xl border border-transparent bg-surface-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.07]"
              >
                <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="block text-[14px] font-medium text-ink">
                    {followups.length === 1 ? 'Follow-up nötig' : `${followups.length} Follow-ups nötig`}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">
                    {followupNames.join(', ')}
                    {followups.length > followupNames.length ? ` und ${followups.length - followupNames.length} weitere` : ''} – seit{' '}
                    {stack.rules?.followUpAfterDays ?? 2} Tagen keine Antwort. Jetzt schreiben →
                  </span>
                </span>
              </button>
            )}

            <Button
              variant="primary"
              size="xl"
              onClick={start}
              shortcut="↵"
              data-testid="start-focus"
              className={followups.length > 0 ? "mt-8 h-16 px-8 text-[17px]" : "mt-12 h-16 px-8 text-[17px]"}
            >
              {doneCount === 0 ? 'Starten' : 'Weitermachen'}
              <ArrowRight className="h-5 w-5" />
            </Button>
          </>
        )}

        {phase === 'done' && <AllDone />}

        {/* Einen Klick entfernt: „Braucht Aufmerksamkeit“ und offene Vernetzungsanfragen (angenommen eintragen). */}
        {ready && <HomeLists founder={founder} />}

        {/* Unter dem Hero: zuerst Probleme (offline, Aktualisieren fehlgeschlagen), dann eine ruhige Zeile zum Senden. */}
        <div className="mt-10 flex flex-col items-center gap-2">
          {waiting > 0 && (
            <p role="status" className="flex items-center gap-2 text-[13.5px] text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
              Offline – {waiting} {waiting === 1 ? 'Entscheidung wartet' : 'Entscheidungen warten'} aufs Speichern
              <button type="button" onClick={retryWaiting} className="font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                Erneut versuchen
              </button>
            </p>
          )}
          {ready && stack.refreshError && stack.fetchedAt && (
            <p className="text-[12.5px] text-ink-3">Stand {formatTime(stack.fetchedAt)} Uhr – Aktualisieren hat nicht geklappt.</p>
          )}
          {/* Mitarbeiter dürfen den Zeitplan nicht lesen (`shared/autoSearch.ts`) – nur dann gibt es den Hinweis. */}
          {ready && <LinkedInStatus details={access.canEditSettings ? <AutoSearchHint founder={founder} /> : undefined} />}
        </div>
      </div>
    </div>
  );
}

function AllDone() {
  const { state, dispatch } = useDemo();
  const founder = state.founder as FounderId;
  return (
    <div className="mt-14 w-full">
      <SuccessScreen cards={founderCards(state, founder)} founder={founder} celebrate={false} onNext={() => dispatch({ type: 'SET_VIEW', view: 'dashboard' })} />
    </div>
  );
}
