import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect } from 'react';
import { DashboardView } from './components/dashboard/DashboardView';
import { DemoBadge } from './components/layout/DemoBadge';
import { TopNav } from './components/layout/TopNav';
import { LeadPanel } from './components/lead/LeadPanel';
import { SlackToast } from './components/slack/SlackToast';
import { ActivityProvider } from './components/stack/ActivityToasts';
import { StackView } from './components/stack/StackView';
import { Login } from './pages/Login';
import { useDemo } from './state/demo';

/** Verzögerung des simulierten Slack-Pings. Über ?ping=5 (Sekunden) oder ?ping=off anpassbar. */
const PING_DELAY_MS = (() => {
  const param = new URLSearchParams(window.location.search).get('ping');
  if (param === 'off') return null;
  const seconds = param === null ? NaN : Number(param);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 20_000;
})();

export function App() {
  const { state } = useDemo();
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <motion.div
          key={state.founder ? `app-${state.generation}-${state.founder}` : `login-${state.generation}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {state.founder ? <Shell /> : <Login />}
        </motion.div>
      </AnimatePresence>
      <DemoBadge />
    </MotionConfig>
  );
}

function Shell() {
  const { state, dispatch } = useDemo();
  const founder = state.founder;

  useEffect(() => {
    if (!founder || state.pinged[founder] || PING_DELAY_MS === null) return;
    const timer = window.setTimeout(() => dispatch({ type: 'PING_ARRIVE', founder }), PING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [founder, state.loginAt]);

  // Nach Abmelden/Reset blendet die Hülle noch kurz aus – dann gibt es keinen Gründer mehr.
  if (!founder) return null;

  return (
    <ActivityProvider>
      <div className="min-h-dvh">
        <TopNav />
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={state.view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
          >
            {state.view === 'stack' ? <StackView /> : <DashboardView />}
          </motion.main>
        </AnimatePresence>
      </div>
      <LeadPanel />
      <SlackToast />
    </ActivityProvider>
  );
}
