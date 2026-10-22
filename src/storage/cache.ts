import type { SpikeData } from '../core/file-spike';
import type { LocalHandle } from './files';

export type WorkCopy<T = SpikeData> = {
  data: T;
  unexported: boolean;
  baseline?: string;
  sidecarHandle?: LocalHandle;
  pdfHandle?: LocalHandle;
  cacheToken?: string;
  filePending?: boolean;
};

export interface WorkCache<T = SpikeData> {
  read(hash: string): Promise<WorkCopy<T> | undefined>;
  write(copy: WorkCopy<T>, expectedToken?: string | null): Promise<void>;
}

export class CacheConflictError extends Error {
  constructor() {
    super('La copia di lavoro è cambiata in un’altra scheda.');
    this.name = 'CacheConflictError';
  }
}

function database(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('documents');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database bloccato da un’altra scheda.'));
  });
}

export function createWorkCache<T extends { document: { sha256: string } }>(
  name: string,
): WorkCache<T> {
  return {
    async read(hash) {
      const db = await database(name);
      try {
        return await new Promise<WorkCopy<T> | undefined>((resolve, reject) => {
          const transaction = db.transaction('documents', 'readonly');
          const request = transaction.objectStore('documents').get(hash);
          transaction.oncomplete = () => resolve(request.result as WorkCopy<T> | undefined);
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally {
        db.close();
      }
    },
    async write(copy, expectedToken) {
      const db = await database(name);
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction('documents', 'readwrite');
          const store = transaction.objectStore('documents');
          let conflict = false;
          let failure: unknown;
          const commit = () => {
            store.put(copy, copy.data.document.sha256);
            store.put(copy, '$latest');
          };
          if (expectedToken === undefined) commit();
          else {
            const previous = store.get(copy.data.document.sha256);
            previous.onsuccess = () => {
              try {
                const token = (previous.result as WorkCopy<T> | undefined)?.cacheToken ?? null;
                if (token !== expectedToken) {
                  conflict = true;
                  transaction.abort();
                } else commit();
              } catch (error) {
                failure = error;
                transaction.abort();
              }
            };
          }
          // Confermare solo al commit della transazione, non al singolo put.
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () =>
            reject(conflict ? new CacheConflictError() : (failure ?? transaction.error));
        });
      } finally {
        db.close();
      }
    },
  };
}
export const workCache: WorkCache = createWorkCache<SpikeData>('fluido-file-spike-v1');
