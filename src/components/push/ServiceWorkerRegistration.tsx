'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[SW] Registration failed:', err);
        }
      });
  }, []);

  return null;
}
