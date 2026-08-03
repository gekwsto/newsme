'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, BellOff, BellRing, X, Smartphone } from 'lucide-react';

const DISMISS_KEY = 'newsme_push_dismiss';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type State =
  | 'unsupported'
  | 'ios-not-standalone'
  | 'checking'
  | 'dismissed'
  | 'prompt'
  | 'subscribed'
  | 'denied'
  | 'loading'
  | 'error';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (window.navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function syncSubscriptionWithServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
}

export default function PushNotificationControl() {
  const pathname = usePathname();
  const [state, setState] = useState<State>('checking');
  const [errorMsg, setErrorMsg] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Only render on public pages
  const isAdminPage = pathname?.startsWith('/admin');

  const checkState = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) {
      setState('unsupported');
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      if (isIos() && !isStandalone()) {
        setState('ios-not-standalone');
      } else {
        setState('unsupported');
      }
      return;
    }

    if (isIos() && !isStandalone()) {
      setState('ios-not-standalone');
      return;
    }

    const dismissed = sessionStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      setState('dismissed');
      return;
    }

    const permission = Notification.permission;
    if (permission === 'denied') {
      setState('denied');
      return;
    }

    const reg = await getRegistration();
    if (!reg) {
      setState('prompt');
      return;
    }

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await syncSubscriptionWithServer(existing).catch(() => {});
      setState('subscribed');
    } else if (permission === 'granted') {
      setState('prompt');
    } else {
      setState('prompt');
    }
  }, []);

  useEffect(() => {
    if (isAdminPage) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkState();
  }, [isAdminPage, checkState]);

  const handleSubscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) return;
    setState('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'prompt');
        return;
      }

      const reg = await getRegistration();
      if (!reg) throw new Error('Service Worker not ready');

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
        });
      }

      await syncSubscriptionWithServer(sub);
      setState('subscribed');
      setExpanded(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Σφάλμα εγγραφής');
      setState('error');
    }
  }, []);

  const handleUnsubscribe = useCallback(async () => {
    setState('loading');
    try {
      const reg = await getRegistration();
      const sub = await reg?.pushManager.getSubscription();

      if (sub) {
        const endpoint = sub.endpoint;
        await Promise.allSettled([
          fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
          }),
          sub.unsubscribe(),
        ]);
      }

      setState('prompt');
      setExpanded(false);
    } catch {
      setState('prompt');
      setExpanded(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setState('dismissed');
    setExpanded(false);
  }, []);

  // Don't render on admin pages or while server-rendering
  if (isAdminPage) return null;

  // States that render nothing
  if (
    state === 'checking' ||
    state === 'unsupported' ||
    state === 'dismissed'
  ) {
    return null;
  }

  // iPhone not in standalone mode — show install guidance
  if (state === 'ios-not-standalone') {
    if (!expanded) return null;
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-xs w-full">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className="text-blue-500 shrink-0 mt-0.5" />
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Ειδοποιήσεις σε iPhone
              </span>
            </div>
            <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-600 shrink-0">
              <X size={14} />
            </button>
          </div>
          <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-decimal list-inside">
            <li>Άνοιξε τη σελίδα στο Safari</li>
            <li>Πάτα <strong>Share</strong> (το τετράγωνο με βέλος)</li>
            <li>Επίλεξε <strong>Add to Home Screen</strong></li>
            <li>Άνοιξε το Newsme.gr από την αρχική οθόνη</li>
            <li>Επέστρεψε εδώ και ενεργοποίησε τις ειδοποιήσεις</li>
          </ol>
        </div>
      </div>
    );
  }

  // Subscribed state — compact badge
  if (state === 'subscribed') {
    if (!expanded) {
      return (
        <button
          onClick={() => setExpanded(true)}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-full shadow-lg transition-colors"
          title="Ειδοποιήσεις ενεργές"
        >
          <BellRing size={13} />
          Ειδοποιήσεις
        </button>
      );
    }
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-xs w-full">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BellRing size={14} className="text-emerald-500" />
              Ειδοποιήσεις ενεργές
            </span>
            <button onClick={() => setExpanded(false)} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Λαμβάνεις ειδοποιήσεις για νέα άρθρα.
          </p>
          <button
            onClick={handleUnsubscribe}
            className="w-full text-xs font-medium text-slate-500 hover:text-red-500 border border-slate-200 dark:border-slate-600 rounded-lg py-1.5 transition-colors"
          >
            Απενεργοποίηση ειδοποιήσεων
          </button>
        </div>
      </div>
    );
  }

  // Denied state
  if (state === 'denied') {
    return (
      <button
        onClick={() => setExpanded((p) => !p)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold px-3 py-2 rounded-full shadow transition-colors"
        title="Οι ειδοποιήσεις έχουν αποκλειστεί"
      >
        <BellOff size={13} />
        {expanded && (
          <span className="text-xs">Απαιτείται αλλαγή από τις ρυθμίσεις του browser</span>
        )}
      </button>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-xs w-full">
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl shadow border border-red-200 dark:border-red-700 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-red-700 dark:text-red-400">{errorMsg || 'Σφάλμα ειδοποιήσεων'}</span>
            <button onClick={handleDismiss} className="text-red-400 hover:text-red-600 ml-2 shrink-0">
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
          <span className="text-xs text-slate-500">Παρακαλώ περίμενε...</span>
        </div>
      </div>
    );
  }

  // Default: prompt state — show subscribe button (collapsed/expanded)
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-2 rounded-full shadow-lg transition-colors"
        title="Ενεργοποίηση ειδοποιήσεων"
      >
        <Bell size={13} />
        Ειδοποιήσεις
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs w-full">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-red-500 shrink-0 mt-0.5" />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Ειδοποιήσεις
            </span>
          </div>
          <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Λάμβανε άμεσες ειδοποιήσεις για σημαντικά νέα από το Newsme.gr.
        </p>
        <button
          onClick={handleSubscribe}
          className="w-full bg-red-600 hover:bg-red-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
        >
          Ενεργοποίηση ειδοποιήσεων
        </button>
        <button
          onClick={handleDismiss}
          className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 py-1 transition-colors"
        >
          Όχι ευχαριστώ
        </button>
      </div>
    </div>
  );
}
