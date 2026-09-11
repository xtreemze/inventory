const DB_NAME = "xtreemze-inventory";
const DB_VERSION = 1;
const STORE_NAME = "state";
const STATE_KEY = "current";
const FALLBACK_KEY = "xtreemze.inventory.state.v2";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
  });
}

async function readIndexedDb() {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read inventory data."));
    });
  } finally {
    database.close();
  }
}

async function writeIndexedDb(state) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save inventory data."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Inventory save was aborted."));
    });
  } finally {
    database.close();
  }
}

function localStorageAvailable() {
  try {
    const key = "__inventory_storage_test__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export async function loadState() {
  if ("indexedDB" in globalThis) {
    try {
      return await readIndexedDb();
    } catch (error) {
      console.warn("IndexedDB unavailable; using localStorage fallback.", error);
    }
  }
  if (!localStorageAvailable()) return null;
  const stored = localStorage.getItem(FALLBACK_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export async function saveState(state) {
  if ("indexedDB" in globalThis) {
    try {
      await writeIndexedDb(state);
      return;
    } catch (error) {
      console.warn("IndexedDB save failed; using localStorage fallback.", error);
    }
  }
  if (!localStorageAvailable()) throw new Error("This browser does not provide writable local storage.");
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
}
