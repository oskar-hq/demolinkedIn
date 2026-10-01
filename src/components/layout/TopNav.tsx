import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, Layers, LogOut, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FOUNDERS } from '../../data/founders';
import { cn } from '../../lib/cn';
import { pendingCards, useDemo } from '../../state/demo';
import type { FounderId, View } from '../../state/types';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Logo } from './Logo';

export function TopNav() {
  const { state, dispatch } = useDemo();
  const founder = FOUNDERS[state.founder as FounderId];
  const open = pendingCards(state, founder.id).length;

  const items: { view: View; label: string; icon: ReactNode; badge?: number }[] = [
    { view: 'home', label: 'Aufgaben', icon: <Layers className="h-4 w-4" />, badge: open },
    { view: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="h-4 w-4" /> },
  ];

  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 sm:px-6">
        <Logo />

        <nav className="ml-2 flex items-center gap-1 sm:ml-6" aria-label="Hauptnavigation">
          {items.map((item) => {
            const active = state.view === item.view;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => dispatch({ type: 'SET_VIEW', view: item.view })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-8 items-center gap-2 rounded-full px-3 text-[13.5px] font-medium transition-colors',
                  active ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-full bg-white/[0.09]"
                    transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  {item.icon}
                  <span className="hidden sm:inline">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="min-w-[18px] rounded-full bg-white/[0.1] px-1.5 text-center text-[11px] tabular-nums text-ink-2">
                      {item.badge}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ResetButton />
          <UserMenu founderId={founder.id} />
        </div>
      </div>
    </header>
  );
}

function ResetButton() {
  const { dispatch } = useDemo();
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirming) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setConfirming(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setConfirming(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [confirming]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        icon={<RotateCcw className="h-3.5 w-3.5" />}
        onClick={() => setConfirming((value) => !value)}
        data-testid="reset-button"
      >
        <span className="hidden md:inline">Demo zurücksetzen</span>
      </Button>
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 top-10 z-40 w-[280px] rounded-2xl border border-line-strong bg-surface-3 p-4 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.85)]"
          >
            <p className="text-[14px] font-semibold">Demo zurücksetzen?</p>
            <p className="mt-1 text-[13px] leading-snug text-ink-2">
              Alle Entscheidungen werden verworfen und die Demo startet wieder bei der Anmeldung.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Abbrechen
              </Button>
              <Button variant="primary" size="sm" onClick={() => dispatch({ type: 'RESET' })} data-testid="reset-confirm">
                Zurücksetzen
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu({ founderId }: { founderId: FounderId }) {
  const { dispatch } = useDemo();
  const founder = FOUNDERS[founderId];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Konto: ${founder.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-white/[0.06]"
      >
        <Avatar name={founder.name} initials={founder.initials} size={28} />
        <span className="hidden text-[13.5px] font-medium sm:inline">{founder.name}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 top-11 z-40 w-[240px] overflow-hidden rounded-2xl border border-line-strong bg-surface-3 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.85)]"
          >
            <div className="border-b border-line px-4 py-3">
              <p className="text-[14px] font-semibold">{founder.name}</p>
              <p className="text-[12.5px] text-ink-3">{founder.linkedinAccount} verbunden</p>
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: 'LOGOUT' })}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13.5px] text-ink-2 transition-colors hover:bg-white/[0.05] hover:text-ink"
            >
              <LogOut className="h-4 w-4" />
              Abmelden / Gründer wechseln
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
