'use client';

import { AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface ConfirmRequest extends ConfirmOptions {
  id: number;
  resolve: (value: boolean) => void;
}

type Listener = (request: ConfirmRequest | null) => void;

let nextId = 0;
let listener: Listener | null = null;
let pending: ConfirmRequest | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const request: ConfirmRequest = { id: ++nextId, resolve, ...options };
    pending = request;
    listener?.(request);
  });
}

function resolvePending(value: boolean) {
  if (!pending) return;
  const current = pending;
  pending = null;
  listener?.(null);
  current.resolve(value);
}

export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    listener = setRequest;
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    confirmRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') resolvePending(false);
    }
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [request]);

  const tone: ConfirmTone = request?.tone ?? 'default';
  const confirmLabel = request?.confirmLabel ?? 'Confirm';
  const cancelLabel = request?.cancelLabel ?? 'Cancel';

  const confirmClasses =
    tone === 'danger'
      ? 'bg-red-500 text-white hover:bg-red-400 focus:ring-red-500/40 shadow-red-500/20'
      : 'bg-sky-500 text-slate-950 hover:bg-sky-400 focus:ring-sky-500/40 shadow-sky-500/20';

  const iconClasses =
    tone === 'danger'
      ? 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'
      : 'bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30';

  return (
    <AnimatePresence>
      {request ? (
        <motion.div
          key={request.id}
          className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          aria-modal="true"
          role="dialog"
          aria-labelledby={`confirm-title-${request.id}`}
        >
          <button
            type="button"
            aria-label="Close dialog"
            onClick={() => resolvePending(false)}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm cursor-default"
          />

          <motion.div
            className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-slate-950 p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:pb-6 shadow-2xl shadow-black/40"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

            <button
              type="button"
              aria-label="Close"
              onClick={() => resolvePending(false)}
              className="absolute right-4 top-4 hidden sm:flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-colors hover:border-white/20 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconClasses}`}>
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <h2
                  id={`confirm-title-${request.id}`}
                  className="text-lg font-extrabold uppercase tracking-tight text-white"
                >
                  {request.title}
                </h2>
                {request.message ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{request.message}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => resolvePending(false)}
                className="h-12 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-bold uppercase tracking-widest text-slate-200 transition-colors hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 cursor-pointer sm:h-11"
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={() => resolvePending(true)}
                className={`h-12 rounded-2xl px-5 text-sm font-extrabold uppercase tracking-widest shadow-lg transition-colors focus:outline-none focus:ring-2 cursor-pointer sm:h-11 ${confirmClasses}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
