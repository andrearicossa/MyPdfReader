import type { SpikeData } from '../core/file-spike';
import type { LocalHandle } from './files';

export type WorkCopy<T = SpikeData> = {
  data: T;
  unexported: boolean;
  baseline?: string;
  sidecarHandle?: LocalHandle;
  pdfHandle?: LocalHandle;
};

export interface WorkCache<T = SpikeData> {
  read(hash: string): Promise<WorkCopy<T> | undefined>;
  write(copy: WorkCopy<T>): Promise<void>;
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
    async write(copy) {
      const db = await database(name);
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction('documents', 'readwrite');
          transaction.objectStore('documents').put(copy, copy.data.document.sha256);
          transaction.objectStore('documents').put(copy, '$latest');
          // Confermare solo al commit della transazione, non al singolo put.
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally {
        db.close();
      }
    },
  };
}
export const workCache: WorkCache = createWorkCache<SpikeData>('fluido-file-spike-v1');
