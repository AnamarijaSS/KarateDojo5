// Majhna shramba ključ → vrednost v IndexedDB. Vse v try/catch: ob napaki
// (zasebni način, polna shramba) aplikacija dela naprej s pomnilnikom.
const DB = "adamov-dojo";
const STORE = "kv";
const mem = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    if (!db) return mem.get(key) as T | undefined;
    return await new Promise<T | undefined>((resolve) => {
      try {
        const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result as T | undefined);
        r.onerror = () => resolve(mem.get(key) as T | undefined);
      } catch {
        resolve(mem.get(key) as T | undefined);
      }
    });
  } catch {
    return mem.get(key) as T | undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  mem.set(key, value);
  try {
    const db = await open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    /* ignoriraj */
  }
}

export async function idbClear(): Promise<void> {
  mem.clear();
  try {
    const db = await open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    /* ignoriraj */
  }
}

/** localStorage z varovalom */
export const ls = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, v: string) {
    try { localStorage.setItem(key, v); } catch { /* ignoriraj */ }
  },
  del(key: string) {
    try { localStorage.removeItem(key); } catch { /* ignoriraj */ }
  },
};
