import type { SpikeData } from '../core/file-spike';
import type { LocalHandle } from './files';

export type WorkCopy = {
  data: SpikeData;
  unexported: boolean;
  baseline?: string;
  sidecarHandle?: LocalHandle;
  pdfHandle?: LocalHandle;
};

export interface WorkCache {
  read(hash: string): Promise<WorkCopy | undefined>;
  write(copy: WorkCopy): Promise<void>;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fluido-file-spike-v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('documents');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database bloccato da un’altra scheda.'));
  });
}

export const workCache: WorkCache = {
  async read(hash) {
    const db = await database();
    try {
      return await new Promise<WorkCopy | undefined>((resolve, reject) => {
        const transaction = db.transaction('documents', 'readonly');
        const request = transaction.objectStore('documents').get(hash);
        transaction.oncomplete = () => resolve(request.result as WorkCopy | undefined);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  },
  async write(copy) {
    const db = await database();
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
