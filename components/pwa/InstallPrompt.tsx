'use client';

import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';

// Chromium fires `beforeinstallprompt`; the event isn't in lib.dom yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'siteops:install-dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

// In-app "Install SiteOps" affordance. Captures the deferred install prompt on
// Chromium and shows a dismissible banner; iOS Safari has no event, so we show a
// one-time "Add to Home Screen" hint instead (PWA3).
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY)) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setShowIosHint(false);
      try {
        localStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* storage may be unavailable */
      }
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    if (isIos()) setShowIosHint(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setDeferred(null);
    setShowIosHint(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage may be unavailable */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (!deferred && !showIosHint) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] safe-area-bottom px-4 pb-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-outline bg-surface-container px-4 py-3 shadow-lg flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-on-surface leading-tight">Install SiteOps</p>
          <p className="text-xs text-on-surface-variant leading-tight">
            {showIosHint
              ? 'Tap Share, then “Add to Home Screen”.'
              : 'Add to your home screen for a faster, app-like experience.'}
          </p>
        </div>
        {deferred ? (
          <button
            type="button"
            onClick={install}
            className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-bold uppercase tracking-widest text-on-primary"
          >
            Install
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 rounded-lg p-2 text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
