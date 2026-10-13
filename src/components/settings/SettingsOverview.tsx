import type { SettingKey, SettingState } from '../../../shared/settings';
import { cn } from '../../lib/cn';
import { HEADING } from './look';

/**
 * „Auf einen Blick“, erster Bereich der Einstellungen (Wunsch des Nutzers 07.10.): Was fehlt noch, welche Schlüssel sind da,
 * wie viel wird gesucht und gesendet. Ein Klick springt zum Feld. Farben nur als Punkte: grün = da, gelb = fehlt
 * (optional), rot = fehlt (nötig).
 */

/** Werte, die bestimmen, wie viel gesucht und gesendet wird – in der Übersicht und am Feld markiert. */
export const LIMIT_KEYS: readonly SettingKey[] = [
  'MAX_RESULTS',
  'QUALIFY_MIN_CONFIDENCE',
  'LINKEDIN_ACTIONS',
  'LINKEDIN_INVITES_PER_DAY',
  'LINKEDIN_INVITES_PER_WEEK',
  'LINKEDIN_MESSAGES_PER_DAY',
  'LINKEDIN_WORK_HOURS',
  'LINKEDIN_WORK_DAYS',
  'NEW_LEADS_PER_DAY',
  'FOLLOWUP_AFTER_DAYS',
  'MAX_FOLLOW_UPS',
];

const KEYS: { key: SettingKey; label: string; need: 'required' | 'optional' }[] = [
  { key: 'UNIPILE_API_KEY', label: 'LinkedIn (Unipile)', need: 'required' },
  { key: 'ANTHROPIC_API_KEY', label: 'KI (Anthropic)', need: 'required' },
  { key: 'META_ACCESS_TOKEN', label: 'Meta-Werbebibliothek', need: 'optional' },
  { key: 'TREG_TOKEN', label: 'Firmendaten (Treg)', need: 'optional' },
  { key: 'CLOSE_API_KEY', label: 'Close (CRM)', need: 'optional' },
  { key: 'SLACK_WEBHOOK_URL', label: 'Slack', need: 'optional' },
];

const LIMITS: { label: string; text: (value: (key: SettingKey) => string) => string; key: SettingKey }[] = [
  { key: 'MAX_RESULTS', label: 'Profile pro Suchlauf', text: (v) => v('MAX_RESULTS') },
  { key: 'NEW_LEADS_PER_DAY', label: 'Neue Leads pro Tag', text: (v) => v('NEW_LEADS_PER_DAY') },
  { key: 'LINKEDIN_ACTIONS', label: 'Senden über LinkedIn', text: (v) => (v('LINKEDIN_ACTIONS') === 'on' ? 'An' : 'Aus – von Hand') },
  { key: 'LINKEDIN_INVITES_PER_DAY', label: 'Anfragen pro Tag / Woche', text: (v) => `${v('LINKEDIN_INVITES_PER_DAY')} / ${v('LINKEDIN_INVITES_PER_WEEK')}` },
  { key: 'LINKEDIN_MESSAGES_PER_DAY', label: 'Nachrichten pro Tag', text: (v) => v('LINKEDIN_MESSAGES_PER_DAY') },
  { key: 'LINKEDIN_WORK_HOURS', label: 'Arbeitszeit', text: (v) => `${v('LINKEDIN_WORK_HOURS')} Uhr · Tage ${v('LINKEDIN_WORK_DAYS')}` },
  { key: 'FOLLOWUP_AFTER_DAYS', label: 'Follow-up nach', text: (v) => `${v('FOLLOWUP_AFTER_DAYS')} Tagen · höchstens ${v('MAX_FOLLOW_UPS')}` },
];

export function jumpToSetting(key: SettingKey) {
  const element = document.querySelector<HTMLElement>(`[data-testid="setting-${key}"]`);
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  element?.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true });
}

function isSet(state: SettingState | undefined): boolean {
  if (!state) return false;
  if (state.secret) return state.secret.set;
  return state.value !== null && state.value !== undefined && state.value !== '';
}

export function SettingsOverview({
  states,
  onJump = jumpToSetting,
}: {
  states: Map<SettingKey, SettingState>;
  /** Zum Feld springen – die Seite wechselt vorher in den Bereich. */
  onJump?: (key: SettingKey) => void;
}) {
  const value = (key: SettingKey) => {
    const raw = states.get(key)?.value;
    return raw === null || raw === undefined || raw === '' ? '–' : String(raw);
  };

  const todo: { key: SettingKey; text: string; level: 'bad' | 'warn' }[] = [];
  if (!isSet(states.get('UNIPILE_DSN')) || !isSet(states.get('UNIPILE_API_KEY'))) {
    todo.push({ key: 'UNIPILE_API_KEY', text: 'Unipile-Zugang fehlt – ohne ihn sucht die Lead-Suche nicht.', level: 'bad' });
  }
  if (!isSet(states.get('ANTHROPIC_API_KEY'))) todo.push({ key: 'ANTHROPIC_API_KEY', text: 'KI-Schlüssel fehlt – Leads werden nicht bewertet.', level: 'bad' });
  if (!isSet(states.get('UNIPILE_ACCOUNT_NICK')) && !isSet(states.get('UNIPILE_ACCOUNT_JOHANNES'))) {
    todo.push({ key: 'UNIPILE_ACCOUNT_NICK', text: 'Noch kein LinkedIn-Account zugeordnet – nötig für Senden und Tests.', level: 'warn' });
  }
  if (!isSet(states.get('META_ACCESS_TOKEN'))) todo.push({ key: 'META_ACCESS_TOKEN', text: 'Meta-Token fehlt – aktive Meta-Ads werden nicht erkannt.', level: 'warn' });

  return (
    <section className="space-y-12" aria-label="Auf einen Blick" data-testid="settings-overview">
      <div data-testid="settings-todo">
        <h3 className={HEADING}>Zu erledigen</h3>
        {todo.length === 0 ? (
          <p className="mt-5 flex items-baseline gap-2 text-[13px] text-ink-2">
            <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-good" aria-hidden /> Alles Wichtige ist eingerichtet.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {todo.map((item) => (
              <li key={item.key}>
                <button type="button" onClick={() => onJump(item.key)} className="flex items-baseline gap-2.5 text-left text-[13px] text-ink transition-colors hover:text-ink-2">
                  <span className={cn('h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full', item.level === 'bad' ? 'bg-bad' : 'bg-warn')} aria-hidden />
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div data-testid="settings-keys">
        <h3 className={HEADING}>Schlüssel</h3>
        <ul className="mt-5 space-y-4">
          {KEYS.map((entry) => {
            const set = isSet(states.get(entry.key));
            return (
              <li key={entry.key}>
                <button type="button" onClick={() => onJump(entry.key)} className="group flex w-full items-baseline justify-between gap-4 text-left text-[13px]">
                  <span className="text-ink-2 transition-colors group-hover:text-ink">{entry.label}</span>
                  <span className={cn('flex shrink-0 items-baseline gap-1.5 font-semibold', set ? 'text-ink' : 'text-ink-3')}>
                    {!set && (
                      <span className={cn('h-1.5 w-1.5 -translate-y-px rounded-full', entry.need === 'required' ? 'bg-bad' : 'bg-warn')} aria-hidden />
                    )}
                    {set ? 'gesetzt' : 'fehlt'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div data-testid="settings-limits">
        <h3 className={HEADING}>Suche und Limits</h3>
        <ul className="mt-5 space-y-4">
          {LIMITS.map((entry) => (
            <li key={entry.key}>
              <button type="button" onClick={() => onJump(entry.key)} className="group flex w-full items-baseline justify-between gap-4 text-left text-[13px]">
                <span className="text-ink-2 transition-colors group-hover:text-ink">{entry.label}</span>
                <span className="shrink-0 text-right font-semibold tabular-nums text-ink">{entry.text(value)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
