import type { ReadingPreferences } from '../core/reading-preferences';

// Database nuovo: nessuna modifica allo schema dei documenti o dei JSON esistenti.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fluido-preferences-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Preferenze bloccate da un’altra scheda.'));
  });
}
export async function readPreferences(): Promise<unknown> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const read = tx.objectStore('settings').get('reading');
      tx.oncomplete = () => resolve(read.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
let writes: Promise<void> = Promise.resolve();
export function writePreferences(value: ReadingPreferences): Promise<void> {
  writes = writes
    .catch(() => {})
    .then(async () => {
      const db = await database();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('settings', 'readwrite');
          tx.objectStore('settings').put(value, 'reading');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    });
  return writes;
}
