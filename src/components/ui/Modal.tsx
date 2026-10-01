import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  className?: string;
}

export function Modal({ open, ...props }: ModalProps) {
  return createPortal(<AnimatePresence>{open && <ModalContent {...props} />}</AnimatePresence>, document.body);
}

function ModalContent({ onClose, children, labelledBy, className }: Omit<ModalProps, 'open'>) {
  // Während der Ausblend-Animation gilt der Dialog nicht mehr als modal → Tastenkürzel sind sofort wieder aktiv.
  const present = useIsPresent();

  useEffect(() => {
    if (!present) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [present, onClose]);

  return (
    <div className={cn('fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6', !present && 'pointer-events-none')}>
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-[6px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal={present ? 'true' : undefined}
        aria-labelledby={labelledBy}
        className={cn(
          'relative z-10 max-h-[92vh] w-full overflow-hidden rounded-t-[28px] border border-line-strong bg-surface-2 shadow-[0_40px_120px_-20px_rgb(0_0_0/0.9)] sm:max-w-2xl sm:rounded-[28px]',
          className,
        )}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
