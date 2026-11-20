import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SyncEvent } from './types';

interface TrackerDB extends DBSchema {
  queue: {
    key: string;
    value: SyncEvent;
    indexes: { 'by-type': string };
  };
  meta: {
    key: string;
    value: { key: string; value: string };
  };
}

const DB_NAME = 'adhd-eye-tracker';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TrackerDB>> | null = null;

function getDB(): Promise<IDBPDatabase<TrackerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TrackerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('queue')) {
          const store = db.createObjectStore('queue', { keyPath: 'idempotency_key' });
          store.createIndex('by-type', 'type');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

/** Add an event to the offline queue. Duplicate idempotency keys are ignored. */
export async function enqueueEvent(event: SyncEvent): Promise<void> {
  const db = await getDB();
  await db.put('queue', event);
}

/** Return all queued events, oldest insertion first (object-store key order). */
export async function getAllEvents(): Promise<SyncEvent[]> {
  const db = await getDB();
  return db.getAll('queue');
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count('queue');
}

export async function removeEvent(idempotencyKey: string): Promise<void> {
  const db = await getDB();
  await db.delete('queue', idempotencyKey);
}

export async function removeEvents(keys: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('queue', 'readwrite');
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;
}

export async function clearQueue(): Promise<void> {
  const db = await getDB();
  await db.clear('queue');
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put('meta', { key, value });
}

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getDB();
  return (await db.get('meta', key))?.value;
}

/** Generate a stable, unique idempotency key (crypto.randomUUID with fallback). */
export function newIdempotencyKey(prefix = 'evt'): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid}`;
}
