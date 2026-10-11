const DB_NAME = "ranksports-merchandising";
const DB_VERSION = 1;
const STORE_NAME = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB tidak tersedia di browser ini."));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (caught) {
      reject(caught instanceof Error ? caught : new Error("Gagal membuka IndexedDB"));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Gagal membuka IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB diblokir oleh tab lain. Tutup tab lain lalu muat ulang."));
  }).catch((error: unknown) => {
    dbPromise = null;
    throw error instanceof Error ? error : new Error("Gagal membuka IndexedDB");
  });

  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(STORE_NAME, mode);
    } catch (caught) {
      reject(caught instanceof Error ? caught : new Error("Transaksi IndexedDB gagal dimulai"));
      return;
    }

    let result: T;
    let request: IDBRequest;
    try {
      request = action(transaction.objectStore(STORE_NAME));
    } catch (caught) {
      transaction.abort();
      reject(caught instanceof Error ? caught : new Error("Permintaan IndexedDB gagal"));
      return;
    }

    request.onsuccess = () => {
      result = request.result as T;
    };
    request.onerror = () => reject(request.error ?? new Error("Permintaan IndexedDB gagal"));

    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () =>
      reject(transaction.error ?? request.error ?? new Error("Transaksi IndexedDB dibatalkan (kuota penuh?)."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Transaksi IndexedDB gagal"));
  });
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>("readonly", (store) => store.get(key));
}

export function idbSet<T>(key: string, value: T): Promise<void> {
  return run<void>("readwrite", (store) => store.put(value, key)).then(() => undefined);
}

export function idbDelete(key: string): Promise<void> {
  return run<void>("readwrite", (store) => store.delete(key)).then(() => undefined);
}

export function idbClear(): Promise<void> {
  return run<void>("readwrite", (store) => store.clear()).then(() => undefined);
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}
