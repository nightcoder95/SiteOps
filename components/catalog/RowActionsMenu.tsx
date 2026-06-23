"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { fadeScale } from "@/components/ui/motion";

export type RowAction = {
  label: string;
  onSelect: () => void;
  /** Tailwind text color class for the label, e.g. "text-sky-400". */
  tone?: string;
  disabled?: boolean;
};

/**
 * Compact "⋯" overflow menu used on mobile catalog cards where the row's
 * actions don't fit inline. Closes on outside click and Escape.
 */
export function RowActionsMenu({ actions, label = "Row actions" }: { actions: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg px-2 py-1 text-lg leading-none text-on-surface-variant hover:bg-surface-container-low"
      >
        ⋯
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            {...fadeScale}
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 min-w-44 origin-top-right overflow-hidden rounded-xl border border-outline-variant bg-surface-container shadow-lg"
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
                className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-container-low disabled:opacity-30 ${action.tone ?? "text-on-surface"}`}
              >
                {action.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
