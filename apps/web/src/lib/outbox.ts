'use client';
// Offline-first headcount outbox: every +/- tap writes a delta event with a
// client-generated uuidv7 id to IndexedDB, then tries to flush. Airplane
// mode: events accumulate; reconnect: /sync/batch replays them; the server
// dedupes by event id, so double-flush is safe.

const DB_NAME = 'chms-outbox';
const STORE = 'headcount';
const DEVICE_KEY = 'chms.deviceId';

export interface OutboxEvent {
  id: string;
  serviceId: string;
  segmentKey: string;
  delta: 1 | -1;
  deviceId: string;
  clientSeq: number;
  recordedAt: string;
  synced?: boolean;
}

export function deviceId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** uuidv7-ish: time-ordered enough for client events (v4 fallback acceptable). */
export function clientUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function outboxEnqueue(event: Omit<OutboxEvent, 'deviceId' | 'synced'>): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...event, deviceId: deviceId(), synced: false } satisfies OutboxEvent);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function outboxPending(): Promise<OutboxEvent[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as OutboxEvent[]).filter((e) => !e.synced));
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function outboxMarkSynced(ids: string[]): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const id of ids) {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const row = getReq.result as OutboxEvent | undefined;
          if (row) store.put({ ...row, synced: true });
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Flush the outbox via /sync/batch. Safe to call any time, any number of times. */
export async function outboxFlush(
  post: (path: string, body: unknown) => Promise<{ applied: number; skipped: { id: string }[] }>,
): Promise<{ synced: number; pending: number }> {
  const pending = await outboxPending();
  if (pending.length === 0) return { synced: 0, pending: 0 };
  const batch = pending.slice(0, 500);
  const res = await post('/sync/batch', {
    deviceId: deviceId(),
    events: batch.map(({ synced, ...e }) => {
      void synced;
      return e;
    }),
  });
  // Everything the server saw (applied or skipped-as-duplicate) leaves the outbox.
  const handled = batch.map((e) => e.id);
  await outboxMarkSynced(handled);
  const remaining = await outboxPending();
  return { synced: res.applied, pending: remaining.length };
}
