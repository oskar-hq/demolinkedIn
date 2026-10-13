import { Check, Send, UserCheck, UserPlus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { FOUNDER_IDS, FOUNDERS } from '../../data/founders';
import type { AuthFounderId } from '../../../shared/auth';
import { MESSAGE_MAX_LENGTH, type LinkedInTestProfile, type LinkedInUnipileAccount } from '../../../shared/linkedin';
import type { SettingKey } from '../../../shared/settings';
import { cn } from '../../lib/cn';
import { AREA, FIELD, HEADING } from './look';
import { ApiError, linkedinApi } from '../../lib/leadSearchApi';
import { Button } from '../ui/Button';
import { StatusLine } from '../ui/Status';
import { safeHref } from '../../lib/safeHref';

const ACCOUNT_KEY: Record<AuthFounderId, SettingKey> = { nick: 'UNIPILE_ACCOUNT_NICK', johannes: 'UNIPILE_ACCOUNT_JOHANNES' };

const INPUT = `${FIELD} w-full`;

interface LinkedInSetupProps {
  /** Ungespeicherte Zuordnung je Gründer. */
  drafts: Partial<Record<AuthFounderId, string>>;
  /** Gespeicherte Zuordnung je Gründer aus den Einstellungen (leer: es gilt `assignedTo` vom Backend). */
  saved: Partial<Record<AuthFounderId, string>>;
  /** Test-Nachricht nur über den eigenen Account – null (Admin): kein Test. */
  ownFounder: AuthFounderId | null;
  /** Account-ID für einen Gründer in den Entwurf übernehmen (gespeichert wird unten mit „Speichern“). */
  onPick: (key: SettingKey, accountId: string) => void;
  /** Ungespeicherte Änderungen in dieser Gruppe – der Test nutzt die gespeicherten Werte. */
  unsaved: boolean;
  /** Die beiden Account-Felder zum Eintragen von Hand (unter „IDs von Hand eintragen“). */
  manual: ReactNode;
  /** Von außen geöffnet, z. B. weil ein Account-Feld einen Fehler hat. */
  manualOpen: boolean;
  onManualToggle: () => void;
}

/**
 * Einrichten ohne Server-Befehle: verbundene Accounts aus Unipile laden und per Klick zuordnen (statt
 * `linkedinCli konten`), dann eine Test-Nachricht an den Test-LinkedIn-Account.
 */
export function LinkedInSetup({ drafts, saved, ownFounder, onPick, unsaved, manual, manualOpen, onManualToggle }: LinkedInSetupProps) {
  return (
    <div className="space-y-12 py-12">
      <AccountPicker drafts={drafts} saved={saved} onPick={onPick} manual={manual} manualOpen={manualOpen} onManualToggle={onManualToggle} />
      {ownFounder ? (
        <TestMessage founder={ownFounder} unsaved={unsaved} />
      ) : (
        <p className="text-[13px] text-ink-3">Die Test-Nachricht schickt ein Gründer über seinen eigenen Account.</p>
      )}
    </div>
  );
}

function AccountPicker({
  drafts,
  saved,
  onPick,
  manual,
  manualOpen,
  onManualToggle,
}: Pick<LinkedInSetupProps, 'drafts' | 'saved' | 'onPick' | 'manual' | 'manualOpen' | 'onManualToggle'>) {
  const [state, setState] = useState<
    { status: 'idle' | 'loading' } | { status: 'ready'; accounts: LinkedInUnipileAccount[] } | { status: 'error'; message: string }
  >({ status: 'idle' });

  /** Wirksame Zuordnung: ungespeicherter Entwurf → gespeicherter Wert → was das Backend meldet. */
  const assignment = (founder: AuthFounderId): string | null =>
    drafts[founder] ??
    saved[founder] ??
    (state.status === 'ready' ? (state.accounts.find((account) => account.assignedTo === founder)?.id ?? null) : null);

  const showManual = manualOpen || state.status === 'error' || (state.status === 'ready' && state.accounts.length === 0);

  const load = async () => {
    setState({ status: 'loading' });
    try {
      const { accounts } = await linkedinApi.accounts();
      setState({ status: 'ready', accounts });
    } catch (error) {
      setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Accounts ließen sich nicht laden.' });
    }
  };

  return (
    <section aria-labelledby="linkedin-accounts-title" data-testid="linkedin-accounts">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="linkedin-accounts-title" className={HEADING}>
          Accounts
        </h3>
        <Button size="sm" variant="secondary" disabled={state.status === 'loading'} onClick={() => void load()} data-testid="linkedin-accounts-load">
          {state.status === 'loading' ? 'Wird geladen…' : state.status === 'ready' ? 'Neu laden' : 'Accounts laden'}
        </Button>
      </div>
      {state.status === 'error' && (
        <StatusLine tone="bad" role="alert" className="mt-3 text-[13.5px]">
          {state.message}
        </StatusLine>
      )}
      {state.status === 'ready' &&
        (state.accounts.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-ink-2">Bei Unipile ist noch kein LinkedIn-Account verbunden. Verbinde ihn im Unipile-Dashboard.</p>
        ) : (
          <ul className="mt-4 space-y-1" data-testid="linkedin-account-list">
            {state.accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink">{account.name}</p>
                  <p className="truncate text-[11px] text-ink-3">ID {account.id}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FOUNDER_IDS.map((founder) => {
                    const active = assignment(founder) === account.id;
                    // Ein Account gehört nur einem Gründer – sonst gälten seine LinkedIn-Grenzen doppelt.
                    const otherFounder = FOUNDER_IDS.find((other) => other !== founder && assignment(other) === account.id);
                    return (
                      <button
                        key={founder}
                        type="button"
                        aria-pressed={active}
                        title={!active && otherFounder ? `Gehört bisher zu ${FOUNDERS[otherFounder].name} – wechselt zu ${FOUNDERS[founder].name}` : undefined}
                        onClick={() => {
                          onPick(ACCOUNT_KEY[founder], account.id);
                          // Wechselt der Account den Gründer, verliert ihn der andere (dann für ihn neu wählen).
                          if (otherFounder) onPick(ACCOUNT_KEY[otherFounder], '');
                        }}
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors',
                          active ? 'border-ink/60 bg-surface-3 text-ink' : 'border-line-strong text-ink-2 hover:border-white/25 hover:text-ink',
                        )}
                        data-testid={`linkedin-assign-${founder}`}
                      >
                        {active ? <Check className="h-3.5 w-3.5" aria-hidden /> : <UserCheck className="h-3.5 w-3.5" aria-hidden />}
                        {active ? FOUNDERS[founder].name : `Für ${FOUNDERS[founder].name}`}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        ))}
      {/* Fallback ohne Liste: die IDs selbst eintragen (auch, wenn das Laden scheitert oder keiner verbunden ist). */}
      <button
        type="button"
        aria-expanded={showManual}
        aria-controls="linkedin-manual-accounts"
        onClick={onManualToggle}
        className="mt-3 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
        data-testid="linkedin-manual-toggle"
      >
        IDs von Hand eintragen
      </button>
      <div id="linkedin-manual-accounts" hidden={!showManual} className="mt-2">
        {manual}
      </div>
    </section>
  );
}

const DEFAULT_TEST_TEXT = 'Test aus dem Outreach Cockpit – bitte ignorieren.';

/**
 * Test-LinkedIn-Account (Wunsch des Nutzers 07.10.): ein Profil eintragen, prüfen (Name, Überschrift, Link – ist es
 * wirklich das richtige?), gespeichert für alle. Danach genau eine Test-Nachricht dorthin – z. B. nach einem Update.
 */
function TestMessage({ founder, unsaved }: { founder: AuthFounderId; unsaved: boolean }) {
  const [profile, setProfile] = useState<LinkedInTestProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [text, setText] = useState(DEFAULT_TEST_TEXT);
  const [busy, setBusy] = useState<'check' | 'send' | 'connect' | 'remove' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const tooLong = text.length > MESSAGE_MAX_LENGTH;

  useEffect(() => {
    let cancelled = false;
    linkedinApi
      .testProfile()
      .then((response) => {
        if (!cancelled) setProfile(response.profile);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (kind: 'check' | 'send' | 'connect' | 'remove', work: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(kind);
    setResult(null);
    try {
      const message = await work();
      if (message) setResult({ ok: true, text: message });
    } catch (error) {
      setResult({ ok: false, text: error instanceof ApiError ? error.message : 'Das hat nicht geklappt.' });
    } finally {
      setBusy(null);
    }
  };

  const check = () =>
    input.trim() && !unsaved
      ? void run('check', async () => {
          const response = await linkedinApi.saveTestProfile({ founder, profile: input.trim() });
          setProfile(response.profile);
          setInput('');
          return null;
        })
      : undefined;
  const send = () =>
    profile && text.trim() && !tooLong && !unsaved
      ? void run('send', async () => (await linkedinApi.testMessage({ founder, text: text.trim() })).message)
      : undefined;
  const connect = () =>
    profile && !unsaved
      ? void run('connect', async () => {
          const response = await linkedinApi.testConnect({ founder });
          // Der Stand „Kontakt ja/nein“ kann sich beim Senden geändert haben – neu laden.
          setProfile((await linkedinApi.testProfile()).profile);
          return response.message;
        })
      : undefined;
  const remove = () =>
    void run('remove', async () => {
      await linkedinApi.removeTestProfile();
      setProfile(null);
      return null;
    });

  return (
    <section aria-labelledby="linkedin-test-title" data-testid="linkedin-test-message">
      <h3 id="linkedin-test-title" className={HEADING}>
        Test-Account
      </h3>
      <p className="mt-1 text-[11px] font-semibold text-ink-3">Gesendet über {FOUNDERS[founder].name} · zählt zum Tageslimit</p>

      <div
        className="mt-4 space-y-3"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            event.stopPropagation();
            if (event.target.id === 'linkedin-test-profile') check();
          }
        }}
      >
        {profile ? (
          <div className="rounded-[12px] bg-surface-2 px-4 py-3" data-testid="linkedin-test-account">
            <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
              <UserCheck className="h-4 w-4 text-good" aria-hidden />
              {profile.profileUrl ? (
                <a href={safeHref(profile.profileUrl)} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                  {profile.name}
                </a>
              ) : (
                profile.name
              )}
            </p>
            {profile.headline && <p className="mt-0.5 text-[13px] text-ink-2">{profile.headline}</p>}
            <p className="mt-1 text-[12.5px] text-ink-3">
              {profile.connected
                ? 'Kontakt 1. Grades – Test-Nachricht möglich, eine Anfrage nicht (schon vernetzt).'
                : 'Noch kein Kontakt – Test-Vernetzungsanfrage möglich, Nachrichten erst nach dem Vernetzen.'}
            </p>
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className="mt-2 text-[12.5px] font-medium text-ink-3 hover:text-ink"
              data-testid="linkedin-test-remove"
            >
              Anderen Test-Account wählen
            </button>
          </div>
        ) : (
          loaded && (
            <div>
              <label htmlFor="linkedin-test-profile" className="mb-2 block text-[13px] text-ink-2">
                LinkedIn-Profil des Test-Accounts
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="linkedin-test-profile"
                  className={cn(INPUT, 'min-w-0 flex-1')}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="https://www.linkedin.com/in/…"
                  inputMode="url"
                  autoComplete="off"
                  data-testid="linkedin-test-profile"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={check}
                  icon={<Check className="h-3.5 w-3.5" />}
                  disabled={busy !== null || unsaved || !input.trim()}
                  data-testid="linkedin-test-check"
                >
                  {busy === 'check' ? 'Wird geprüft…' : 'Prüfen'}
                </Button>
              </div>
            </div>
          )
        )}

        {profile && (
          <>
            <div>
              <label htmlFor="linkedin-test-text" className="mb-2 block text-[13px] text-ink-2">
                Test-Nachricht
              </label>
              <textarea
                id="linkedin-test-text"
                className={cn(AREA, 'min-h-[72px]')}
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-invalid={tooLong}
                data-testid="linkedin-test-text"
              />
              {tooLong && <p className="mt-1 text-[12px] text-ink">Höchstens {MESSAGE_MAX_LENGTH} Zeichen.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={send}
                icon={<Send className="h-3.5 w-3.5" />}
                disabled={busy !== null || unsaved || !text.trim() || tooLong}
                data-testid="linkedin-test-send"
              >
                {busy === 'send' ? 'Wird gesendet…' : 'Test-Nachricht senden'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={connect}
                icon={<UserPlus className="h-3.5 w-3.5" />}
                disabled={busy !== null || unsaved}
                data-testid="linkedin-test-connect"
              >
                {busy === 'connect' ? 'Wird gesendet…' : 'Test-Vernetzungsanfrage senden'}
              </Button>
            </div>
          </>
        )}
        {unsaved && <p className="text-[12.5px] text-ink-3">Erst speichern – der Test nutzt die gespeicherten Werte.</p>}
        {result && (
          <p role={result.ok ? 'status' : 'alert'} className="flex items-baseline gap-2 text-[13.5px] text-ink" data-testid="linkedin-test-result">
            <span className={cn('h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full', result.ok ? 'bg-good' : 'bg-bad')} aria-hidden />
            {result.text}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Such-Account der Lead-Suche (Wunsch des Nutzers 11.10.): Über welchen verbundenen LinkedIn-Account gesucht und
 * Profile gelesen werden – setzt UNIPILE_ACCOUNT_ID (leer = automatisch der erste verbundene). Gespeichert wird mit
 * „Speichern“ wie alle Einstellungen.
 */
export function SearchAccountPicker({
  draft,
  saved,
  onPick,
}: {
  /** Ungespeicherter Wert (undefined = keiner, '' = automatisch). */
  draft: string | undefined;
  /** Gespeicherter Wert (leer = automatisch). */
  saved: string;
  onPick: (accountId: string) => void;
}) {
  const [state, setState] = useState<
    { status: 'idle' | 'loading' } | { status: 'ready'; accounts: LinkedInUnipileAccount[] } | { status: 'error'; message: string }
  >({ status: 'idle' });
  const chosen = draft ?? saved;

  const load = async () => {
    setState({ status: 'loading' });
    try {
      const { accounts } = await linkedinApi.accounts();
      setState({ status: 'ready', accounts });
    } catch (error) {
      setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Accounts ließen sich nicht laden.' });
    }
  };

  const options = state.status === 'ready' ? [{ id: '', name: 'Automatisch', hint: 'Erster verbundener LinkedIn-Account' }, ...state.accounts.map((account) => ({ id: account.id, name: account.name, hint: `ID ${account.id}` }))] : [];
  // Bei „Automatisch“ zeigt das Backend, welcher Account dann tatsächlich sucht.
  const autoName = state.status === 'ready' ? state.accounts.find((account) => account.searching)?.name : undefined;

  return (
    <section aria-labelledby="search-account-title" data-testid="search-account">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="search-account-title" className={HEADING}>
            Such-Account der Lead-Suche
          </h3>
          <p className="mt-1 text-[13px] text-ink-3">Über diesen LinkedIn-Account sucht das Cockpit und liest Profile.</p>
        </div>
        <Button size="sm" variant="secondary" disabled={state.status === 'loading'} onClick={() => void load()} data-testid="search-account-load">
          {state.status === 'loading' ? 'Wird geladen…' : state.status === 'ready' ? 'Neu laden' : 'Accounts laden'}
        </Button>
      </div>
      {state.status === 'error' && (
        <StatusLine tone="bad" role="alert" className="mt-3 text-[13.5px]">
          {state.message}
        </StatusLine>
      )}
      {state.status === 'ready' &&
        (state.accounts.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-ink-2">Bei Unipile ist noch kein LinkedIn-Account verbunden. Verbinde ihn im Unipile-Dashboard.</p>
        ) : (
          <ul role="radiogroup" aria-labelledby="search-account-title" className="mt-4 space-y-1" data-testid="search-account-list">
            {options.map((option) => {
              const active = chosen === option.id;
              return (
                <li key={option.id || 'auto'}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onPick(option.id)}
                    className="flex w-full items-center justify-between gap-4 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-3"
                    data-testid={`search-account-${option.id || 'auto'}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ink">{option.name}</span>
                      <span className="block truncate text-[11px] text-ink-3">
                        {option.id === '' && autoName && chosen === '' ? `Gerade: ${autoName}` : option.hint}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                        active ? 'border-accent bg-accent text-white' : 'border-line-strong',
                      )}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
