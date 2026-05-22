"use client";

import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import type { ReactNode } from "react";

const EASE: Transition["ease"] = [0.22, 1, 0.36, 1];

export const transitions = {
  fast: { duration: 0.15, ease: EASE } satisfies Transition,
  base: { duration: 0.2, ease: EASE } satisfies Transition,
  slow: { duration: 0.28, ease: EASE } satisfies Transition,
};

export const fadeSlideUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
  transition: transitions.base,
};

export const fadeScale = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: transitions.fast,
};

export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: transitions.fast,
};

const listContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
  exit: {},
};

const listItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: transitions.fast },
  exit: { opacity: 0, transition: transitions.fast },
};

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={transitions.base}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedList({
  children,
  className,
  ...rest
}: HTMLMotionProps<"ul"> & { children: ReactNode }) {
  return (
    <motion.ul
      variants={listContainer}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
      {...rest}
    >
      {children}
    </motion.ul>
  );
}

export function AnimatedListItem({
  children,
  className,
  ...rest
}: HTMLMotionProps<"li"> & { children: ReactNode }) {
  return (
    <motion.li variants={listItem} className={className} {...rest}>
      {children}
    </motion.li>
  );
}

export function Popover({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          {...fadeSlideUp}
          transition={transitions.fast}
          className={className}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function ModalShell({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-scrim/40 p-4 sm:items-center sm:p-0"
          {...overlayFade}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose?.();
            }
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={transitions.base}
            className={className}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export { AnimatePresence, motion };
