import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowUpRight, Search, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConversationSummary } from '../../../shared/leads';
import { cn } from '../../lib/cn';
import { useMediaQuery } from '../../lib/gesture';
import { FOUNDERS } from '../../data/founders';
import { ApiError, conversationsApi, leadsApi, linkedinApi } from '../../lib/leadSearchApi';
import { leadCompany, leadInitials, leadName } from '../../lib/leadView';
import { variablesForCockpitLead } from '../../lib/template';
import { formatRelative } from '../../lib/time';
import { useCockpit, useLeadDetail } from '../../state/cockpit';
import { useDemo } from '../../state/demo';
import type { FounderId } from '../../state/types';
import { ChatThread } from '../stack/ChatThread';
import { MessageEditor } from '../stack/MessageEditor';
import { useActionMode } from '../stack/actionMode';
import { actionAllowed } from '../lead/LeadActions';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { SPRING } from '../../lib/motion';

type Scope = 'mine' | 'all';

/** „Nick“ → „Nicks“, „Johannes“ → „Johannes'“ (Genitiv ohne zweites s). */
function genitive(name: string): string {
  return /[sßxz]$/i.test(name) ? `${name}'` : `${name}s`;
}

/** Über wessen LinkedIn-Account der Chat läuft (Wunsch des Nutzers 09.10.): „über deinen Account“ / „über Nicks Account“. */
export function viaAccount(owner: FounderId, me: FounderId): string {
  return owner === me ? 'über deinen Account' : `über ${genitive(FOUNDERS[owner].name)} Account`;
}

/**
 * Chats (Wunsch des Nutzers 07.10.): alle Gespräche mit Leads auf einen Blick – links die Liste wie in einem
 * Messenger, rechts der Verlauf mit Eingabefeld. Gesendet wird über LinkedIn, wenn das Cockpit sendet; sonst schreibst
 * du auf LinkedIn und trägst hier ein. Antworten, die auf LinkedIn eingegangen sind, lassen sich ebenfalls eintragen.
 */
export function ChatsView() {
  const { state } = useDemo();
  const founder = state.founder as FounderId;
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // „Alle“ zeigt die Gespräche beider Gründer zusammen (Leads werden auf beide verteilt, `LEAD_DISTRIBUTION`).
  const [scope, setScope] = useState<Scope>('mine');
  const [selected, setSelected] = useState<string | null>(null);
  // Handy: Liste und Gespräch liegen übereinander, das Gespräch kommt von rechts und geht nach rechts zurück.
  const stacked = useMediaQuery('(max-width: 767px)');

  // Nur die neueste Abfrage zählt – sonst überschreibt eine langsame „Meine“ die schon gewählte „Alle“.
  const requestRef = useRef(0);
  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const response = await conversationsApi.list(scope === 'all' ? undefined : founder);
      if (request !== requestRef.current) return;
      setList(response.conversations);
      setError(null);
    } catch {
      if (request === requestRef.current) setError('Die Chats konnten nicht geladen werden.');
    }
  }, [founder, scope]);

  useEffect(() => {
    void load();
  }, [load, state.stack.fetchedAt]);

  // Gewählter Chat fehlt nach dem Neuladen (Lead gelöscht): schließen.
  useEffect(() => {
    if (list && selected && !list.some((entry) => entry.lead.id === selected)) setSelected(null);
  }, [list, selected]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!list) return [];
    if (!needle) return list;
    return list.filter((entry) => `${leadName(entry.lead)} ${leadCompany(entry.lead)}`.toLowerCase().includes(needle));
  }, [list, query]);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-6 pt-6 sm:px-10 sm:pt-10" data-testid="chats-view">
      <div className="grid h-[calc(var(--app-h)-48px)] min-h-[480px] grid-cols-1 grid-rows-[minmax(0,1fr)] gap-8 sm:h-[calc(100dvh-72px-80px)] md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className={cn('flex min-h-0 flex-col max-md:[grid-area:1/1]', selected && 'hidden md:flex')} aria-label="Chats">
          <div className="pb-4">
            <div className="mb-5 flex items-center justify-between gap-2">
              <h1 className="display text-[30px] font-bold leading-[1.1] tracking-[-0.025em]">Chats</h1>
              <Segmented
                ariaLabel="Wessen Chats"
                size="sm"
                value={scope}
                onChange={(next) => {
                  setScope(next);
                  setList(null);
                }}
                options={[
                  { value: 'mine', label: 'Meine' },
                  { value: 'all', label: 'Alle' },
                ]}
              />
            </div>
            <label className="relative block">
              <span className="sr-only">Chats durchsuchen</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, Firma …"
                className="h-[38px] w-full rounded-[10px] border border-transparent bg-surface-3 pl-9 pr-3 text-[16px] text-ink outline-none placeholder:text-ink-4 focus:border-accent sm:text-[13px]"
                data-testid="chats-search"
              />
            </label>
          </div>
          <ul className="scroll-thin -mx-2.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto" data-testid="chat-list">
            {error ? (
              <li className="p-4 text-[13.5px] text-ink">{error}</li>
            ) : !list ? (
              <li className="p-4 text-[13.5px] text-ink-3">Wird geladen …</li>
            ) : filtered.length === 0 ? (
              <li className="p-4 text-[13.5px] text-ink-3">{query ? 'Kein Chat zu dieser Suche.' : 'Noch keine Gespräche – sie erscheinen nach der ersten Nachricht.'}</li>
            ) : (
              filtered.map((entry) => (
                <li key={entry.lead.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(entry.lead.id)}
                    aria-current={selected === entry.lead.id ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-[12px] px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2',
                      selected === entry.lead.id && 'bg-surface-3',
                    )}
                    data-testid="chat-item"
                  >
                    <Avatar name={leadName(entry.lead)} initials={leadInitials(entry.lead)} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate text-[14px] text-ink', entry.awaitingReply ? 'font-semibold' : 'font-medium')}>{leadName(entry.lead)}</span>
                        <span className={cn('shrink-0 text-[11.5px]', entry.awaitingReply ? 'text-accent' : 'text-ink-3')}>
                          {formatRelative(entry.lastMessage.at)}
                        </span>
                      </span>
                      {/* Die Firma kürzt sich, der Account bleibt ganz lesbar. */}
                      <span className="flex min-w-0 gap-1 text-[12px] text-ink-3">
                        <span className="truncate">{leadCompany(entry.lead)}</span>
                        {scope === 'all' && (
                          <span className="shrink-0" data-testid="chat-account">
                            · {viaAccount(entry.lead.owner, founder)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={cn('min-w-0 flex-1 truncate text-[13px]', entry.awaitingReply ? 'text-ink' : 'text-ink-2')}>
                          {entry.lastMessage.from === 'founder' ? (entry.lead.owner === founder ? 'Du: ' : `${FOUNDERS[entry.lead.owner].name}: `) : ''}
                          {entry.lastMessage.text}
                        </span>
                        {entry.awaitingReply && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Antwort offen" />}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <section
          // Auf dem Handy bleibt die Fläche stehen, solange das Gespräch hinausgleitet – darunter ist die Liste schon bedienbar.
          className={cn('flex min-h-0 flex-col overflow-hidden md:rounded-[20px] md:bg-surface-1 max-md:[grid-area:1/1]', !selected && 'max-md:pointer-events-none')}
          aria-label="Gespräch"
        >
          {stacked ? (
            <AnimatePresence initial={false}>
              {selected && (
                <motion.div
                  key={selected}
                  className="flex min-h-0 flex-1 flex-col bg-canvas"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={SPRING}
                >
                  <Conversation leadId={selected} onBack={() => setSelected(null)} onChanged={() => void load()} />
                </motion.div>
              )}
            </AnimatePresence>
          ) : selected ? (
            <Conversation key={selected} leadId={selected} onBack={() => setSelected(null)} onChanged={() => void load()} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-[14px] text-ink-3">Wähle links einen Chat.</div>
          )}
        </section>
      </div>
    </div>
  );
}

type Direction = 'mine' | 'theirs';

function Conversation({ leadId, onBack, onChanged }: { leadId: string; onBack: () => void; onChanged: () => void }) {
  const { state, dispatch } = useDemo();
  const { mutateLead } = useCockpit();
  const detail = useLeadDetail(leadId);
  const mode = useActionMode();
  const lead = detail.lead;
  const [chosen, setChosen] = useState<Direction>('mine');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const variables = useMemo(() => (lead ? variablesForCockpitLead(lead) : []), [lead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [detail.messages.length]);

  if (!lead) {
    return <div className="flex flex-1 items-center justify-center text-[14px] text-ink-3">{detail.status === 'error' ? detail.error : 'Wird geladen …'}</div>;
  }

  // Verloren oder übergeben: eigene Nachrichten erst nach „Wieder öffnen“ – eine Antwort eintragen geht immer.
  const canWrite = actionAllowed(lead, 'message_sent');
  const canReopen = actionAllowed(lead, 'reopened');
  const direction: Direction = canWrite ? chosen : 'theirs';
  const reopen = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await mutateLead(() => leadsApi.act(lead.id, { action: 'reopened' }), lead.id);
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  const sendsViaLinkedIn = direction === 'mine' && mode === 'send';
  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await mutateLead(() =>
        sendsViaLinkedIn
          ? linkedinApi.message(lead.id, { text: body })
          : leadsApi.act(lead.id, { action: direction === 'mine' ? 'message_sent' : 'message_received', text: body }),
        lead.id,
        { messageSent: direction === 'mine' },
      );
      setText('');
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="flex items-center gap-3 px-5 pb-3 pt-4">
        <button type="button" onClick={onBack} className="text-ink-3 hover:text-ink md:hidden" aria-label="Zurück zu den Chats">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={leadName(lead)} initials={leadInitials(lead)} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink" data-testid="chat-title">
            {leadName(lead)}
          </p>
          <p className="flex min-w-0 gap-1 text-[12.5px] text-ink-2">
            <span className="truncate">{leadCompany(lead)}</span>
            <span className="shrink-0" data-testid="chat-header-account">
              · {viaAccount(lead.owner, state.founder as FounderId)}
            </span>
          </p>
        </div>
        {/* Handy: nur das Symbol, damit Firma und Account in die Kopfzeile passen. */}
        <Button variant="ghost" size="sm" icon={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={() => dispatch({ type: 'OPEN_PANEL', leadId: lead.id })} aria-label="Lead öffnen" className="max-sm:px-2">
          <span className="max-sm:hidden">Lead öffnen</span>
        </Button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-5" data-testid="chat-thread">
        {detail.messages.length ? <ChatThread lead={lead} messages={detail.messages} highlightLatestReply compact /> : <p className="text-center text-[13.5px] text-ink-3">Noch keine Nachrichten.</p>}
        <div ref={bottomRef} />
      </div>

      <footer className="p-4">
        {!canWrite && (
          <p role="status" className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ink-2" data-testid="chat-closed">
            <span>
              {lead.stage === 'lost' ? 'Als verloren markiert' : 'Übergeben'} – eigene Nachrichten erst nach dem Öffnen.
            </span>
            {canReopen && (
              <button
                type="button"
                onClick={() => void reopen()}
                disabled={busy}
                className="font-medium text-ink underline-offset-4 hover:underline disabled:opacity-40"
                data-testid="chat-reopen"
              >
                Wieder öffnen
              </button>
            )}
          </p>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Was trägst du ein?"
            size="sm"
            value={direction}
            onChange={setChosen}
            options={[
              ...(canWrite ? [{ value: 'mine' as const, label: mode === 'send' ? 'Nachricht senden' : 'Meine Nachricht' }] : []),
              { value: 'theirs' as const, label: `Antwort von ${lead.person.firstName}` },
            ]}
          />
          <span className="text-[12px] text-ink-3">
            {direction === 'theirs'
              ? 'Antwort von LinkedIn hier einfügen und eintragen.'
              : mode === 'send'
                ? 'Geht direkt über LinkedIn raus.'
                : 'Auf LinkedIn senden, hier eintragen.'}
          </span>
        </div>
        <MessageEditor
          value={text}
          onChange={setText}
          variables={variables}
          onSubmit={() => void submit()}
          placeholder={direction === 'mine' ? `Nachricht an ${lead.person.firstName} …` : `Was hat ${lead.person.firstName} geantwortet?`}
          submitVerb={sendsViaLinkedIn ? 'senden' : 'eintragen'}
          copyable={direction === 'mine' && mode === 'protocol'}
          copyDisabled={!text.trim()}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p role={error ? 'alert' : undefined} className="min-w-0 text-[12.5px] text-ink">
            {error}
          </p>
          <Button variant="primary" size="sm" onClick={() => void submit()} disabled={busy || !text.trim()} icon={<Send className="h-3.5 w-3.5" />} data-testid="chat-send">
            {busy ? 'Wird gespeichert…' : sendsViaLinkedIn ? 'Senden' : 'Eintragen'}
          </Button>
        </div>
      </footer>
    </>
  );
}
