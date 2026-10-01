import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { FOUNDERS } from '../../data/founders';
import { LEADS_BY_ID } from '../../data/leads';
import { fullName } from '../../lib/leadInfo';
import { useDemo } from '../../state/demo';

function SlackGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden>
      <path fill="#E01E5A" d="M5.04 15.17a2.53 2.53 0 1 1-2.52-2.52h2.52v2.52Zm1.27 0a2.52 2.52 0 0 1 5.04 0v6.31a2.52 2.52 0 0 1-5.04 0v-6.31Z" />
      <path fill="#36C5F0" d="M8.83 5.04a2.53 2.53 0 1 1 2.52-2.52v2.52H8.83Zm0 1.27a2.52 2.52 0 0 1 0 5.04H2.52a2.52 2.52 0 0 1 0-5.04h6.31Z" />
      <path fill="#2EB67D" d="M18.96 8.83a2.53 2.53 0 1 1 2.52 2.52h-2.52V8.83Zm-1.27 0a2.52 2.52 0 0 1-5.04 0V2.52a2.52 2.52 0 0 1 5.04 0v6.31Z" />
      <path fill="#ECB22E" d="M15.17 18.96a2.53 2.53 0 1 1-2.52 2.52v-2.52h2.52Zm0-1.27a2.52 2.52 0 0 1 0-5.04h6.31a2.52 2.52 0 0 1 0 5.04h-6.31Z" />
    </svg>
  );
}

/** Simulierte Slack-Benachrichtigung über eine neue LinkedIn-Antwort. */
export function SlackToast() {
  const { state, dispatch } = useDemo();
  const toast = state.slackToast;
  const lead = toast ? LEADS_BY_ID[toast.leadId] : null;

  return (
    <div className="pointer-events-none fixed right-4 top-[72px] z-[25] w-[calc(100%-2rem)] max-w-[380px]">
      <AnimatePresence>
        {toast && lead && (
          <motion.div
            key={toast.leadId}
            initial={{ opacity: 0, x: 60, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, transition: { duration: 0.25 } }}
            transition={{ type: 'spring', bounce: 0.22, duration: 0.55 }}
            className="pointer-events-auto"
          >
            <div
              role="button"
              tabIndex={0}
              data-testid="slack-toast"
              onClick={() => dispatch({ type: 'FOCUS_CARD', cardId: lead.id })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') dispatch({ type: 'FOCUS_CARD', cardId: lead.id });
              }}
              className="group relative flex w-full cursor-pointer gap-3 rounded-[18px] border border-white/[0.12] bg-[#1b1d21]/95 p-3.5 pr-10 text-left shadow-[0_24px_60px_-12px_rgb(0_0_0/0.85)] backdrop-blur-xl transition-transform duration-150 hover:bg-[#202328]/95 active:scale-[0.985]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-white shadow-[0_2px_8px_rgb(0_0_0/0.4)]">
                <SlackGlyph />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                  <span className="font-semibold uppercase tracking-[0.04em] text-ink-2">Slack</span>
                  <span>·</span>
                  <span>#linkedin-antworten</span>
                  <span className="ml-auto">jetzt</span>
                </span>
                <span className="mt-1 block text-[14px] font-semibold leading-snug text-ink">
                  💬 Neue Antwort von {fullName(lead)} an {FOUNDERS[lead.owner].name}
                </span>
                <span className="mt-1 line-clamp-2 block text-[13px] leading-snug text-ink-2">„{lead.replies?.[0]?.text}“</span>
                <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent">
                  Zur Antwort springen →
                </span>
              </span>
              <button
                type="button"
                aria-label="Benachrichtigung schließen"
                onClick={(event) => {
                  event.stopPropagation();
                  dispatch({ type: 'DISMISS_SLACK' });
                }}
                className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-ink-3 opacity-60 transition hover:bg-white/10 hover:text-ink group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
