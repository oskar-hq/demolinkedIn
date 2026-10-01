import { AnimatePresence, motion } from 'motion/react';
import { Check, Undo2 } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useDemo } from '../../state/demo';
import { Kbd } from '../ui/Kbd';

interface ActivityToast {
  id: number;
  pendingText: string;
  doneText: string;
  status: 'pending' | 'done';
  undoable: boolean;
}

interface PushOptions {
  pending: string;
  done: string;
  undoable?: boolean;
  /** Dauer der simulierten Hintergrundaktion in ms. */
  duration?: number;
}

interface ActivityContextValue {
  push: (options: PushOptions) => void;
  undoLatest: () => boolean;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function useActivity() {
  const context = useContext(ActivityContext);
  if (!context) throw new Error('useActivity muss innerhalb von ActivityProvider verwendet werden');
  return context;
}

export function ActivityProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useDemo();
  const [toasts, setToasts] = useState<ActivityToast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const remove = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);

  const push = useCallback(
    ({ pending, done, undoable = true, duration }: PushOptions) => {
      const id = nextId.current++;
      const workTime = duration ?? 850 + Math.round(Math.random() * 450);
      setToasts((list) => [
        ...list.map((toast) => ({ ...toast, undoable: false })).slice(-2),
        { id, pendingText: pending, doneText: done, status: 'pending', undoable },
      ]);
      timers.current.push(
        window.setTimeout(() => {
          setToasts((list) => list.map((toast) => (toast.id === id ? { ...toast, status: 'done' } : toast)));
        }, workTime),
        window.setTimeout(() => remove(id), workTime + (undoable ? 3600 : 2200)),
      );
    },
    [remove],
  );

  const undoLatest = useCallback(() => {
    if (state.undoStack.length === 0) return false;
    dispatch({ type: 'UNDO' });
    setToasts((list) => {
      const latest = [...list].reverse().find((toast) => toast.undoable);
      return latest ? list.filter((toast) => toast.id !== latest.id) : list;
    });
    const id = nextId.current++;
    setToasts((list) => [
      ...list.slice(-2),
      { id, pendingText: '', doneText: 'Rückgängig gemacht', status: 'done', undoable: false },
    ]);
    timers.current.push(window.setTimeout(() => remove(id), 1800));
    return true;
  }, [dispatch, remove, state.undoStack.length]);

  return (
    <ActivityContext.Provider value={{ push, undoLatest }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="glass pointer-events-auto flex h-11 items-center gap-2.5 rounded-full border border-line-strong pl-3.5 pr-2 text-[13.5px] shadow-[0_16px_40px_-12px_rgb(0_0_0/0.8)]"
            >
              <AnimatePresence mode="wait" initial={false}>
                {toast.status === 'pending' ? (
                  <motion.span
                    key="spin"
                    exit={{ opacity: 0, scale: 0.6 }}
                    className="h-4 w-4 animate-spin rounded-full border-[1.75px] border-white/20 border-t-ink"
                  />
                ) : (
                  <motion.span
                    key="check"
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', bounce: 0.35, duration: 0.4 }}
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-good text-black"
                  >
                    <Check className="h-3 w-3" strokeWidth={3.2} />
                  </motion.span>
                )}
              </AnimatePresence>
              <span className="whitespace-nowrap pr-1.5 font-medium text-ink">
                {toast.status === 'pending' ? toast.pendingText : toast.doneText}
              </span>
              {toast.undoable && (
                <button
                  type="button"
                  onClick={undoLatest}
                  className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-white/10 hover:text-ink"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Rückgängig
                  <Kbd>Z</Kbd>
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ActivityContext.Provider>
  );
}
