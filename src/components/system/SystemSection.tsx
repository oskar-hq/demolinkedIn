import { ArrowDownToLine, Copy, KeyRound, RefreshCw, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SettingGroup } from '../../../shared/settings';
import type { BackupInfo, BackupListResponse, SettingsKeyResponse, UpdateStatusResponse, VersionInfo } from '../../../shared/system';
import { cn } from '../../lib/cn';
import { ApiError, saveBlob, systemApi } from '../../lib/leadSearchApi';
import { formatDateTime, formatRelative } from '../../lib/time';
import { Button } from '../ui/Button';
import { PasswordDialog } from '../ui/PasswordDialog';
import { Dot } from '../ui/Status';
import { HEADING } from '../settings/look';

/** Solange ein Update läuft oder das Cockpit neu startet: so oft nachfragen. */
const POLL_MS = 3_000;
/** Nach so langer Zeit ohne Antwort gilt das Update als hängend (Hinweis, nicht abbrechen). */
const SLOW_UPDATE_MS = 8 * 60_000;

type Tone = 'good' | 'bad' | 'neutral';
type Notice = { tone: Tone; text: string } | null;

/** So viele Sicherungen stehen sofort da, der Rest hinter „Alle … anzeigen“. */
const BACKUPS_SHOWN = 3;

/** Leiser Textknopf in eine Einstellung („Ändern ›“, „Einschalten ›“) – nie der Weg über die .env. */
const SETTING_LINK = 'font-medium text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline';

const BACKUP_KIND: Record<BackupInfo['kind'], string> = {
  scheduled: 'geplant',
  manual: 'von Hand',
  before_restore: 'vor dem Wiederherstellen',
  before_update: 'vor einem Update',
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`;
  return `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}

function versionLine(version: VersionInfo): string {
  return `${version.title} · ${formatDateTime(version.date)}`;
}

/** Wartet, bis das Backend wieder antwortet (nach Update oder Wiederherstellen), dann neu laden. */
function reloadWhenBack(onTick?: () => void) {
  const timer = window.setInterval(() => {
    onTick?.();
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => {
        if (response.status < 500) {
          window.clearInterval(timer);
          window.location.reload();
        }
      })
      .catch(() => undefined);
  }, POLL_MS);
  return () => window.clearInterval(timer);
}

/** Einstellungen → Sicherungen und Updates: Software-Updates und Sicherungen – alles, wofür man früher auf den Server musste. */
export function SystemSection({ active, onOpenSetting }: { active: boolean; onOpenSetting: (group: SettingGroup, page?: string) => void }) {
  return (
    <div className="pt-10" data-testid="system-section">
      <UpdateCard active={active} onOpenSetting={onOpenSetting} />
      <BackupCard active={active} onOpenSetting={onOpenSetting} />
      <SecretKeyCard />
    </div>
  );
}

function StatusLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p role={notice.tone === 'bad' ? 'alert' : 'status'} className="mt-4 flex items-baseline gap-2 text-[14px] text-ink" data-testid="system-notice">
      <span
        className={cn('h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full', notice.tone === 'good' ? 'bg-good' : notice.tone === 'bad' ? 'bg-bad' : 'bg-ink-3')}
        aria-hidden
      />
      {notice.text}
    </p>
  );
}

// ───────────────────────────── Updates ─────────────────────────────

function UpdateCard({ active, onOpenSetting }: { active: boolean; onOpenSetting: (group: SettingGroup, page?: string) => void }) {
  const [status, setStatus] = useState<UpdateStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [dialog, setDialog] = useState<{ error: { text: string; id: number } | null } | null>(null);
  const [starting, setStarting] = useState(false);
  /** In diesem Tab gestartet: Nach dem Neustart lädt die Seite selbst neu. */
  const startedAt = useRef<number | null>(null);
  const [restarting, setRestarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await systemApi.update();
      setStatus(next);
      setLoadError(null);
      return next;
    } catch (error) {
      setLoadError(errorText(error, 'Update-Stand ließ sich nicht laden.'));
      return null;
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // Solange es läuft: nachfragen. Antwortet das Backend nicht mehr, startet es gerade neu.
  const running = status?.state === 'running' || startedAt.current !== null;
  useEffect(() => {
    if (!active || !running || restarting) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await systemApi.update();
        setStatus(next);
        if (startedAt.current === null) return;
        // Fertig nur, wenn das Backend einen abgeschlossenen Lauf meldet, der nach unserem Start begann – ein kurz
        // nicht erreichbarer Update-Dienst (unter Last) ist kein „fertig“.
        const finished = next.lastRun && next.lastRun.finishedAt !== null && next.lastRun.startedAt >= startedAt.current - 60_000;
        if (next.state === 'done' && finished && next.lastRun?.ok !== false) {
          startedAt.current = null;
          setNotice({ tone: 'good', text: next.lastRun?.message ?? 'Update eingespielt – die Seite lädt neu.' });
          // Neue Oberfläche laden (das Frontend wurde mit neu gebaut).
          window.setTimeout(() => window.location.reload(), 1500);
        } else if (next.state === 'failed' || (finished && next.lastRun?.ok === false)) {
          startedAt.current = null;
          setNotice({ tone: 'bad', text: next.lastRun?.message ?? 'Das Update hat nicht geklappt.' });
        } else if (Date.now() - startedAt.current > SLOW_UPDATE_MS) {
          setNotice({ tone: 'neutral', text: 'Das Update dauert ungewöhnlich lange. Lade die Seite in ein paar Minuten neu.' });
        }
      } catch {
        // Backend weg = wird gerade neu gestartet. Warten, bis es wieder da ist, dann neu laden.
        if (startedAt.current !== null) {
          setRestarting(true);
          setNotice({ tone: 'neutral', text: 'Das Cockpit startet neu – die Seite lädt gleich von selbst.' });
        }
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, running, restarting]);

  useEffect(() => {
    if (!restarting) return;
    return reloadWhenBack();
  }, [restarting]);

  const check = async () => {
    setChecking(true);
    setNotice(null);
    try {
      const next = await systemApi.checkUpdate();
      setStatus(next);
      // Ohne Update sagt es die Zeile „Du hast die neueste Version.“ schon.
      setNotice(null);
    } catch (error) {
      setNotice({ tone: 'bad', text: errorText(error, 'Nachsehen hat nicht geklappt.') });
    } finally {
      setChecking(false);
    }
  };

  const checked =
    status && status.checkedAt !== null ? <span className="font-normal text-ink-3"> · geprüft {formatRelative(status.checkedAt)}</span> : null;

  const start = async (password: string) => {
    setStarting(true);
    try {
      const next = await systemApi.startUpdate(password);
      startedAt.current = Date.now();
      setStatus(next);
      setDialog(null);
      setNotice({ tone: 'neutral', text: 'Update läuft – das Cockpit ist gleich ein paar Minuten nicht erreichbar.' });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'reauth_failed') {
        setDialog({ error: { text: error.message, id: Date.now() } });
      } else {
        setDialog(null);
        setNotice({ tone: 'bad', text: errorText(error, 'Das Update ließ sich nicht starten.') });
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="mt-0" aria-labelledby="system-update-title" data-testid="system-update">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="system-update-title" className={HEADING}>
          Updates
        </h2>
        {status?.available && (
          <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} disabled={checking || running} onClick={() => void check()} data-testid="update-check">
            {checking ? 'Wird geprüft…' : 'Jetzt nachsehen'}
          </Button>
        )}
      </div>

      {loadError && !status ? (
        <p className="mt-4 text-[14px] text-ink-2">{loadError}</p>
      ) : !status ? (
        <p className="mt-4 text-[14px] text-ink-3">Wird geladen …</p>
      ) : (
        <div className="mt-5">
          {status.simulated && <p className="mb-3 text-[11px] font-semibold text-ink-3">Simulation – es wird nichts eingespielt.</p>}

          {/* Erst Stand und Aktion, dann die Fakten. */}
          {!status.available ? (
            <p className="text-[14px] leading-relaxed text-ink-2" data-testid="update-unavailable">
              {status.reason ?? 'Der Update-Dienst ist nicht erreichbar.'}
            </p>
          ) : status.behind > 0 || status.pendingBuild ? (
            <div data-testid="update-available">
              <p className="text-[14px] font-semibold text-ink">
                {status.behind === 0
                  ? 'Das letzte Update ist nicht fertig geworden – noch einmal einspielen.'
                  : status.behind === 1
                    ? 'Eine neue Änderung'
                    : `${status.behind} neue Änderungen`}
                {status.behind > 0 && checked}
              </p>
              <ul className="mt-2 space-y-1.5 text-[13px] text-ink-2">
                {status.changes.map((change) => (
                  <li key={change.commit} className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                    <span className="min-w-0">{change.title}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <Button variant="primary" disabled={running} onClick={() => setDialog({ error: null })} data-testid="update-start">
                  {running ? 'Update läuft …' : 'Update einspielen'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[14px] text-ink">
              <span data-testid="update-current-state">{running ? 'Update läuft …' : 'Du hast die neueste Version.'}</span>
              {checked}
            </p>
          )}

          <dl className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-4 text-[13px]">
            <dt className="text-ink-2">Installiert</dt>
            <dd className="min-w-0 break-words text-right font-semibold text-ink" data-testid="update-current">
              {status.current ? versionLine(status.current) : 'unbekannt'}
            </dd>
            <dt className="text-ink-2">Automatisch</dt>
            <dd className="min-w-0 text-right font-semibold text-ink" data-testid="update-auto">
              {status.auto.enabled ? `nachts um ${status.auto.hour} Uhr` : 'aus'} ·{' '}
              <button type="button" onClick={() => onOpenSetting('backup', 'backup.updates')} className={SETTING_LINK} data-testid="update-auto-edit">
                {status.auto.enabled ? 'Ändern' : 'Einschalten'} ›
              </button>
            </dd>
          </dl>

          {status.lastRun && !running && (
            <p className="mt-4 text-[13px] text-ink-3" data-testid="update-last-run">
              Letztes Update {formatDateTime(status.lastRun.startedAt)} ({status.lastRun.by}):{' '}
              {status.lastRun.ok === false ? 'fehlgeschlagen – ' : ''}
              {status.lastRun.message}
            </p>
          )}
        </div>
      )}
      <StatusLine notice={notice} />

      <PasswordDialog
        open={!!dialog}
        title="Update einspielen"
        confirmLabel="Jetzt einspielen"
        busyLabel="Wird gestartet…"
        busy={starting}
        error={dialog?.error ?? null}
        onCancel={() => setDialog(null)}
        onConfirm={(password) => void start(password)}
      >
        <p>Das Cockpit startet neu und ist ein paar Minuten nicht erreichbar. Was gerade gespeichert wird, trägt es danach nach.</p>
      </PasswordDialog>
    </section>
  );
}

// ───────────────────────────── Sicherungen ─────────────────────────────

type BackupDialog = { kind: 'download' | 'restore'; backup: BackupInfo; error: { text: string; id: number } | null };

function BackupCard({ active, onOpenSetting }: { active: boolean; onOpenSetting: (group: SettingGroup, page?: string) => void }) {
  const [list, setList] = useState<BackupListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<BackupDialog | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [restarting, setRestarting] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await systemApi.backups());
      setLoadError(null);
    } catch (error) {
      setLoadError(errorText(error, 'Sicherungen ließen sich nicht laden.'));
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  useEffect(() => {
    if (!restarting) return;
    return reloadWhenBack();
  }, [restarting]);

  const createNow = async () => {
    setCreating(true);
    setNotice(null);
    try {
      const backup = await systemApi.backupNow();
      setNotice({ tone: 'good', text: `Gesichert: ${formatDateTime(backup.createdAt)} (${formatSize(backup.size)}).` });
      await load();
    } catch (error) {
      setNotice({ tone: 'bad', text: errorText(error, 'Sichern hat nicht geklappt.') });
    } finally {
      setCreating(false);
    }
  };

  const confirm = async (password: string) => {
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog.kind === 'download') {
        saveBlob(await systemApi.downloadBackup(dialog.backup.name, password), dialog.backup.name);
        setNotice({ tone: 'good', text: `${dialog.backup.name} wird heruntergeladen.` });
      } else {
        const result = await systemApi.restoreBackup(dialog.backup.name, password);
        setNotice({ tone: 'neutral', text: result.message });
        // Simulation: nichts ersetzt, kein Neustart. Sonst warten, bis das Backend wieder da ist.
        if (result.safetyBackup !== null) setRestarting(true);
        else void load();
      }
      setDialog(null);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'reauth_failed') {
        setDialog({ ...dialog, error: { text: error.message, id: Date.now() } });
      } else {
        setDialog(null);
        setNotice({ tone: 'bad', text: errorText(error, 'Das hat nicht geklappt.') });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-12" aria-labelledby="system-backups-title" data-testid="system-backups">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="system-backups-title" className={HEADING}>
          Sicherungen
        </h2>
        <Button size="sm" variant="secondary" disabled={creating || restarting} onClick={() => void createNow()} data-testid="backup-now">
          {creating ? 'Wird gesichert…' : 'Jetzt sichern'}
        </Button>
      </div>

      {loadError && !list ? (
        <p className="mt-4 text-[14px] text-ink-2">{loadError}</p>
      ) : !list ? (
        <p className="mt-4 text-[14px] text-ink-3">Wird geladen …</p>
      ) : (
        <>
          <p className="mt-5 text-[13px] text-ink-2" data-testid="backup-plan">
            {list.nextAt ? (
              `Nächste Sicherung ${formatDateTime(list.nextAt)}`
            ) : (
              <>
                <Dot tone="warn" className="mr-2 -translate-y-px" />
                Automatische Sicherung aus
              </>
            )}{' '}
            · {list.maxAgeDays ? `gelöscht nach ${list.maxAgeDays} Tagen` : `aufbewahrt werden die letzten ${list.keep}`} ·{' '}
            <button type="button" onClick={() => onOpenSetting('backup', 'backup.plan')} className={SETTING_LINK} data-testid="backup-plan-edit">
              {list.nextAt ? 'Ändern' : 'Einschalten'} ›
            </button>
          </p>
          {list.disk && (
            <p className="mt-1.5 text-[13px] text-ink-2" data-testid="backup-disk">
              {list.disk.low && <Dot tone="warn" className="mr-2 -translate-y-px" />}
              Frei auf dem Server: {formatSize(list.disk.freeBytes)} von {formatSize(list.disk.totalBytes)}
              {list.disk.low && ' – knapp. Sicherungen und Updates können daran scheitern.'}
            </p>
          )}
          {list.lastError && (
            <p role="alert" className="mt-3 flex items-baseline gap-2 text-[14px] text-ink">
              <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-bad" aria-hidden />
              {list.lastError}
            </p>
          )}
          {list.backups.length === 0 ? (
            <p className="mt-5 text-[14px] text-ink-2">Noch keine Sicherung vorhanden.</p>
          ) : (
            <>
              <ul id="backup-list" className="mt-4" data-testid="backup-list">
                {(showAll ? list.backups : list.backups.slice(0, BACKUPS_SHOWN)).map((backup) => (
                  <li key={backup.name} className="flex items-center justify-between gap-4 py-2.5" data-testid="backup-row">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink">{formatDateTime(backup.createdAt)}</p>
                      <p className="text-[11px] font-semibold text-ink-3">
                        {BACKUP_KIND[backup.kind]} · {formatSize(backup.size)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {/* Mobil nur das Symbol; der Name (aria-label) nennt die Aktion. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-8 px-0 sm:w-auto sm:px-3"
                        icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
                        aria-label={`Sicherung vom ${formatDateTime(backup.createdAt)} herunterladen`}
                        disabled={restarting}
                        onClick={() => setDialog({ kind: 'download', backup, error: null })}
                      >
                        <span className="hidden sm:inline">Herunterladen</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-8 px-0 sm:w-auto sm:px-3"
                        icon={<RotateCcw className="h-3.5 w-3.5" />}
                        aria-label={`Sicherung vom ${formatDateTime(backup.createdAt)} wiederherstellen`}
                        disabled={restarting}
                        onClick={() => setDialog({ kind: 'restore', backup, error: null })}
                      >
                        <span className="hidden sm:inline">Wiederherstellen</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              {list.backups.length > BACKUPS_SHOWN && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="-ml-3 mt-1"
                  aria-expanded={showAll}
                  aria-controls="backup-list"
                  onClick={() => setShowAll((value) => !value)}
                  data-testid="backup-show-all"
                >
                  {showAll ? 'Weniger anzeigen' : `Alle ${list.backups.length} anzeigen`}
                </Button>
              )}
            </>
          )}
        </>
      )}
      <StatusLine notice={notice} />

      <PasswordDialog
        open={!!dialog}
        title={dialog?.kind === 'restore' ? 'Sicherung wiederherstellen' : 'Sicherung herunterladen'}
        confirmLabel={dialog?.kind === 'restore' ? 'Wiederherstellen' : 'Herunterladen'}
        busyLabel={dialog?.kind === 'restore' ? 'Wird eingespielt…' : 'Wird geladen…'}
        busy={busy}
        error={dialog?.error ?? null}
        onCancel={() => setDialog(null)}
        onConfirm={(password) => void confirm(password)}
      >
        {dialog?.kind === 'restore' ? (
          <>
            <p>
              Das Cockpit springt auf den Stand vom <strong className="font-medium text-ink">{formatDateTime(dialog.backup.createdAt)}</strong> zurück.
              Alles, was danach eingetragen wurde, ist dann weg.
            </p>
            <p>Der jetzige Stand wird vorher gesichert – du kannst also zurück. Das Cockpit startet dabei kurz neu.</p>
          </>
        ) : (
          <p>Die Datei enthält alle Leads und Konten (Passwörter nur verschlüsselt). Speichere sie nur an einem sicheren Ort.</p>
        )}
      </PasswordDialog>
    </section>
  );
}

// ───────────────────────────── Schlüssel für Geheimnisse ─────────────────────────────

/**
 * Die Geheimnisse der Einstellungen (API-Schlüssel) liegen verschlüsselt in der Datenbank – und damit in jeder
 * Sicherung. Den Schlüssel dazu enthält keine Sicherung: Er gehört getrennt in den Passwort-Manager.
 */
function SecretKeyCard() {
  const [dialog, setDialog] = useState<{ error: { text: string; id: number } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SettingsKeyResponse | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const show = async (password: string) => {
    setBusy(true);
    try {
      setResult(await systemApi.settingsKey(password));
      setNotice(null);
      setDialog(null);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'reauth_failed') {
        setDialog({ error: { text: error.message, id: Date.now() } });
      } else {
        setDialog(null);
        setNotice({ tone: 'bad', text: errorText(error, 'Der Schlüssel ließ sich nicht anzeigen.') });
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result?.key) return;
    try {
      await navigator.clipboard.writeText(result.key);
      setNotice({ tone: 'good', text: 'Schlüssel kopiert – jetzt im Passwort-Manager ablegen.' });
    } catch {
      setNotice({ tone: 'neutral', text: 'Kopieren ging nicht – markier den Schlüssel und kopier ihn von Hand.' });
    }
  };

  return (
    <section className="mt-12 pb-10" aria-labelledby="system-key-title" data-testid="system-key">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="system-key-title" className={HEADING}>
          Schlüssel für Geheimnisse
        </h2>
        {result ? (
          <Button size="sm" variant="ghost" onClick={() => setResult(null)} data-testid="settings-key-hide">
            Ausblenden
          </Button>
        ) : (
          <Button size="sm" variant="secondary" icon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => setDialog({ error: null })} data-testid="settings-key-show">
            Anzeigen
          </Button>
        )}
      </div>
      <p className="mt-3 text-[13px] text-ink-3">Steckt in keiner Sicherung – einmal im Passwort-Manager ablegen.</p>
      {result && (
        <div className="mt-4" data-testid="settings-key-result">
          <p className="text-[14px] text-ink">{result.message}</p>
          {result.key && (
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 select-all break-all rounded-xl border border-transparent bg-surface-3 px-3 py-2.5 font-mono text-[13px] text-ink" data-testid="settings-key-value">
                {result.key}
              </code>
              <Button size="sm" variant="ghost" className="w-8 shrink-0 px-0" icon={<Copy className="h-3.5 w-3.5" />} aria-label="Schlüssel kopieren" onClick={() => void copy()} />
            </div>
          )}
        </div>
      )}
      <StatusLine notice={notice} />

      <PasswordDialog
        open={!!dialog}
        title="Schlüssel für Geheimnisse anzeigen"
        confirmLabel="Anzeigen"
        busyLabel="Wird geladen…"
        busy={busy}
        error={dialog?.error ?? null}
        onCancel={() => setDialog(null)}
        onConfirm={(password) => void show(password)}
      >
        <p>Mit diesem Schlüssel lassen sich alle gespeicherten API-Schlüssel entschlüsseln. Zeig ihn nur an, wenn niemand mitliest.</p>
      </PasswordDialog>
    </section>
  );
}
