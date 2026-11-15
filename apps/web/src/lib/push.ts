'use client';
// Phone notifications (web push) from the browser side. The service worker is
// already registered for the PWA; here we ask permission, subscribe this device
// with the VAPID public key, and hand the token back so the caller can save it
// with whatever auth it has (staff app vs member portal). If the public key is
// not built in, the server cannot sign pushes, so nothing is offered.
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export const pushKeyConfigured = (): boolean => !!PUBLIC_KEY;

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'subscribed' | 'available';

/** What this device can do right now, without prompting the person. */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!pushKeyConfigured()) return 'unconfigured';
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) return 'subscribed';
  } catch {
    /* treat as not subscribed */
  }
  return 'available';
}

export interface DeviceSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Ask permission and subscribe this device. Throws a plain-English message. */
export async function subscribeThisDevice(): Promise<DeviceSubscription> {
  if (!pushSupported()) throw new Error('This browser cannot show phone notifications.');
  if (!pushKeyConfigured()) throw new Error('Phone notifications are not switched on for this app yet.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. Allow them in your browser settings, then try again.');
  }
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) as BufferSource,
    }));
  const json = sub.toJSON();
  const keys = json.keys;
  if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('The browser did not return a usable subscription.');
  }
  return { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

/** Unsubscribe this device; returns the endpoint removed (for the API), if any. */
export async function unsubscribeThisDevice(): Promise<string | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  return endpoint;
}
