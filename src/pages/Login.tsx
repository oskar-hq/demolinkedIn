import { motion } from 'motion/react';
import { ArrowRight, Lock } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Logo } from '../components/layout/Logo';
import { FOUNDER_IDS, FOUNDERS } from '../data/founders';
import { cn } from '../lib/cn';
import { pendingCards, useDemo } from '../state/demo';
import type { FounderId } from '../state/types';

export function Login() {
  const { state, dispatch } = useDemo();
  const [loading, setLoading] = useState<FounderId | null>(null);

  const login = (id: FounderId) => {
    if (loading) return;
    setLoading(id);
    window.setTimeout(() => dispatch({ type: 'LOGIN', founder: id }), 650);
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[78%] h-[1400px] w-[2200px] -translate-x-1/2 rounded-[50%] border-t border-white/25 bg-black shadow-[0_-40px_160px_-20px_rgb(255_255_255/0.22)]" />
        <div className="absolute left-1/2 top-[72%] h-[340px] w-[1100px] -translate-x-1/2 rounded-[50%] bg-white/[0.07] blur-[90px]" />
      </div>

      <header className="relative z-10 flex h-16 items-center px-6">
        <Logo alwaysShowName />
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-32 pt-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.7 }}
          className="text-center"
        >
          <p className="text-[13px] font-medium text-ink-3">LinkedIn-Outreach für Kapitalanlage-Vertriebe & Bauträger</p>
          <h1 className="display mt-3 text-[44px] font-semibold sm:text-[64px]">Willkommen zurück.</h1>
          <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-ink-2">
            Wähle dein Profil, um deinen Tages-Stapel zu öffnen.
          </p>
        </motion.div>

        <div className="mt-12 grid w-full max-w-[640px] gap-4 sm:grid-cols-2">
          {FOUNDER_IDS.map((id, index) => {
            const founder = FOUNDERS[id];
            const count = pendingCards(state, id).length;
            const isLoading = loading === id;
            return (
              <motion.button
                key={id}
                type="button"
                data-testid={`login-${id}`}
                onClick={() => login(id)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: loading && !isLoading ? 0.4 : 1, y: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.7, delay: 0.1 + index * 0.06 }}
                className={cn(
                  'group relative flex flex-col items-start rounded-[24px] border bg-surface-1/80 p-6 text-left backdrop-blur-sm',
                  'transition-[border-color,background-color,transform] duration-200 active:scale-[0.98]',
                  isLoading ? 'border-white/40' : 'border-line-strong hover:border-white/30 hover:bg-surface-2/80',
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <Avatar name={founder.name} initials={founder.initials} size={52} />
                  <span
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200',
                      isLoading ? 'bg-ink' : 'bg-white/[0.06] group-hover:bg-ink',
                    )}
                  >
                    {isLoading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-ink-2 transition-colors group-hover:text-black" />
                    )}
                  </span>
                </div>
                <p className="display mt-6 text-[24px] font-semibold">{founder.name}</p>
                <p className="mt-0.5 text-[14px] text-ink-2">{founder.role}</p>
                <p className="mt-5 text-[12.5px] text-ink-3">
                  {isLoading ? 'Anmelden…' : `${count} Karten im heutigen Stapel`}
                </p>
              </motion.button>
            );
          })}
        </div>

        <p className="mt-8 flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <Lock className="h-3.5 w-3.5" />
          Kein Passwort nötig – Demo-Zugang mit Beispieldaten
        </p>
      </main>
    </div>
  );
}
