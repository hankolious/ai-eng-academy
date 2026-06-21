import type { StoredCard } from "../fsrs/scheduler";

// Offline-durable card persistence backed by IndexedDB. Works in the browser
// (window.indexedDB) and in tests (fake-indexeddb sets globalThis.indexedDB).
// No network, no backend — this IS the source of truth for due-items, intervals
// and lapses across reloads.
const STORE = "cards";
const DUE_INDEX = "due";

export interface CardStore {
  put(card: StoredCard): Promise<void>;
  get(id: string): Promise<StoredCard | undefined>;
  getAll(): Promise<StoredCard[]>;
  /** Cards due at or before `nowMs`, sorted by due ascending. */
  getDue(nowMs: number): Promise<StoredCard[]>;
  close(): void;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openCardStore(dbName = "deltaforge", version = 1): Promise<CardStore> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, version);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex(DUE_INDEX, "due", { unique: false });
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(wrap(open.result));
  });
}

function wrap(db: IDBDatabase): CardStore {
  return {
    async put(card) {
      const tx = db.transaction(STORE, "readwrite");
      await reqToPromise(tx.objectStore(STORE).put(card));
    },
    get(id) {
      const tx = db.transaction(STORE, "readonly");
      return reqToPromise<StoredCard | undefined>(tx.objectStore(STORE).get(id));
    },
    getAll() {
      const tx = db.transaction(STORE, "readonly");
      return reqToPromise<StoredCard[]>(tx.objectStore(STORE).getAll());
    },
    getDue(nowMs) {
      const tx = db.transaction(STORE, "readonly");
      const index = tx.objectStore(STORE).index(DUE_INDEX);
      // Index walks 'due' ascending → results already ordered by soonest-due.
      const range = IDBKeyRange.upperBound(nowMs);
      return reqToPromise<StoredCard[]>(index.getAll(range));
    },
    close() {
      db.close();
    },
  };
}
