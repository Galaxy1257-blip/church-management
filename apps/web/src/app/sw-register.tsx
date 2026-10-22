'use client';
import { useEffect } from 'react';

/** Registers the PWA service worker (must be a client component). */
export function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
