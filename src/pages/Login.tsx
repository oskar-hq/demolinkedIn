import { motion, type Variants } from 'motion/react';
import { ArrowRight, Lock } from 'lucide-react';
import { useState, type PointerEvent } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Logo } from '../components/layout/Logo';
import { FOUNDER_IDS, FOUNDERS } from '../data/founders';
import { cn } from '../lib/cn';
import { pendingCards, useDemo } from '../state/demo';
import type { FounderId } from '../state/types';

/** Kräftiges ease-out für Auftritte (Emil Kowalski). */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Inhalte erscheinen nacheinander: Überschrift → Text → Karten → Hinweis. */
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.35 } },
};

const rise: Variants = {
  hidden: { opacity: 0, transform: 'translateY(14px)' },
  show: { opacity: 1, transform: 'translateY(0px)', transition: { duration: 0.8, ease: EASE_OUT } },
};

const cardRise: Variants = {
  hidden: { opacity: 0, transform: 'translateY(18px) scale(0.97)' },
  show: { opacity: 1, transform: 'translateY(0px) scale(1)', transition: { duration: 0.8, ease: EASE_OUT } },
};

/** Lichtkegel auf der Karte folgt dem Mauszeiger (nur bei echter Maus/Trackpad sichtbar). */
function trackPointer(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
}

export function Login() {
  const { state, dispatch } = useDemo();
  const [loading, setLoading] = useState<FounderId | null>(null);

  const login = (id: FounderId) => {
    if (loading) return;
    setLoading(id);
    window.setTimeout(() => dispatch({ type: 'LOGIN', founder: id }), 300);
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* Horizont: geht beim Öffnen einmal auf wie ein Sonnenaufgang. Nur Verläufe, keine Filter. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0, transform: 'translateY(140px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)' }}
        transition={{ duration: 1.8, ease: EASE_OUT }}
      >
        <div className="absolute left-1/2 top-[78%] h-[1400px] w-[2200px] -translate-x-1/2 rounded-[50%] border-t border-white/25 bg-black shadow-[0_-40px_160px_-20px_rgb(255_255_255/0.22)]" />
        <motion.div
          className="absolute left-1/2 top-[78%] h-[360px] w-[1200px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_255_255/0.14),transparent)]"
          initial={{ opacity: 0, transform: 'scaleX(0.6)' }}
          animate={{ opacity: 1, transform: 'scaleX(1)' }}
          transition={{ duration: 1.6, delay: 0.5, ease: EASE_OUT }}
        />
      </motion.div>

      <motion.header
        className="relative z-10 flex h-16 items-center px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: EASE_OUT }}
      >
        <Logo alwaysShowName />
      </motion.header>

      <motion.main
        className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-32 pt-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.p variants={rise} className="text-center text-[13px] font-medium text-ink-3">
          LinkedIn-Outreach für Kapitalanlage-Vertriebe & Bauträger
        </motion.p>
        <motion.h1 variants={rise} className="display mt-3 text-center text-[44px] font-semibold sm:text-[64px]">
          Willkommen zurück.
        </motion.h1>
        <motion.p variants={rise} className="mx-auto mt-4 max-w-xl text-center text-[17px] leading-relaxed text-ink-2">
          Wähle dein Profil, um deine Aufgaben für heute zu öffnen.
        </motion.p>

        <div className="mt-12 grid w-full max-w-[640px] gap-4 sm:grid-cols-2">
          {FOUNDER_IDS.map((id) => {
            const founder = FOUNDERS[id];
            const count = pendingCards(state, id).length;
            const isLoading = loading === id;
            return (
              <motion.div key={id} variants={cardRise}>
                <button
                  type="button"
                  data-testid={`login-${id}`}
                  onClick={() => login(id)}
                  onPointerMove={trackPointer}
                  className={cn(
                    'group relative flex w-full flex-col items-start overflow-hidden rounded-[24px] border bg-surface-1 p-6 text-left',
                    'transition-[border-color,background-color,opacity,transform] duration-200 ease-out active:scale-[0.98]',
                    isLoading ? 'border-white/40' : 'border-line-strong hover:border-white/30',
                    loading && !isLoading && 'opacity-40',
                  )}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100"
                    style={{
                      background:
                        'radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), rgb(255 255 255 / 0.08), transparent 70%)',
                    }}
                  />
                  <div className="relative flex w-full items-center justify-between">
                    <Avatar name={founder.name} initials={founder.initials} size={52} />
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,transform] duration-200 ease-out',
                        isLoading ? 'bg-ink' : 'bg-white/[0.06] group-hover:translate-x-0.5 group-hover:bg-ink',
                      )}
                    >
                      {isLoading ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                      ) : (
                        <ArrowRight className="h-4 w-4 text-ink-2 transition-colors duration-200 group-hover:text-black" />
                      )}
                    </span>
                  </div>
                  <p className="display relative mt-6 text-[24px] font-semibold">{founder.name}</p>
                  <p className="relative mt-0.5 text-[14px] text-ink-2">{founder.role}</p>
                  <p className="relative mt-5 text-[12.5px] text-ink-3">
                    {isLoading ? 'Anmelden…' : `${count} Aufgaben für heute`}
                  </p>
                </button>
              </motion.div>
            );
          })}
        </div>

        <motion.p variants={rise} className="mt-8 flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <Lock className="h-3.5 w-3.5" />
          Kein Passwort nötig – Demo-Zugang mit Beispieldaten
        </motion.p>
      </motion.main>
    </div>
  );
}
