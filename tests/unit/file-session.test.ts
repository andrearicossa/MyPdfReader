import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpike, serializeSpike } from '../../src/core/file-spike';
import { FileSession } from '../../src/storage/file-session';
import type { LocalHandle } from '../../src/storage/files';
import type { WorkCache, WorkCopy } from '../../src/storage/cache';

const document = { sha256: 'c'.repeat(64), fileName: 'prova.pdf', size: 50 };

function memoryCache(): WorkCache & { copy?: WorkCopy } {
  return {
    copy: undefined,
    async read() {
      return this.copy;
    },
    async write(copy) {
      this.copy = structuredClone({ ...copy, sidecarHandle: undefined, pdfHandle: undefined });
    },
  };
}

function disk(name = 'prova.annotations.json') {
  const state = {
    text: '',
    permission: 'granted' as PermissionState,
    failClose: false,
    writes: 0,
    onClose: undefined as (() => Promise<void>) | undefined,
  };
  const handle: LocalHandle = {
    kind: 'file',
    name,
    async getFile() {
      return new File([state.text], name);
    },
    async queryPermission() {
      return state.permission;
    },
    async requestPermission() {
      return state.permission;
    },
    async isSameEntry(other) {
      return other === handle;
    },
    async createWritable() {
      let pending = '';
      return {
        async write(text) {
          pending = text;
        },
        async close() {
          if (state.onClose) await state.onClose();
          if (state.failClose) throw new Error('Disco pieno');
          state.text = pending;
          state.writes++;
        },
        async abort() {},
      };
    },
  };
  return { state, handle };
}

describe('Ciclo del file con adattatori simulati (AC-15, AC-16, AC-17, AC-29, AC-30)', () => {
  beforeEach(() => vi.useRealTimers());

  it('conferma salvato solo dopo close e mantiene il PDF separato', async () => {
    const file = disk();
    const session = new FileSession(document, memoryCache());
    await session.create(file.handle);
    session.update('Nota reale', 42);
    expect(session.state.status).toBe('pending');
    await session.flush();
    expect(JSON.parse(file.state.text).draftNote).toBe('Nota reale');
    expect(JSON.parse(file.state.text).position.page).toBe(42);
    expect(session.state.status).toBe('saved');
    expect(session.state.unexported).toBe(false);
    await session.close();
  });

  it('parte entro 2 s dall’ultima modifica', async () => {
    vi.useFakeTimers();
    const session = new FileSession(document, memoryCache());
    const file = disk();
    await session.create(file.handle);
    session.update('debounce', 1);
    await vi.advanceTimersByTimeAsync(699);
    expect(file.state.writes).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(file.state.writes).toBe(2);
    await session.close();
    vi.useRealTimers();
  });

  it('fallimento di close: non dichiara salvato, cache e modifiche restano', async () => {
    const cache = memoryCache();
    const session = new FileSession(document, cache);
    const file = disk();
    await session.create(file.handle);
    file.state.failClose = true;
    session.update('non perdere', 5);
    await session.flush();
    expect(session.state.status).toBe('error');
    expect(session.state.unexported).toBe(true);
    expect(cache.copy?.data.draftNote).toBe('non perdere');
    expect(file.state.text).not.toContain('non perdere');
    await session.close();
  });

  it('permesso revocato: conserva il lavoro e permette il recupero', async () => {
    const session = new FileSession(document, memoryCache());
    const file = disk();
    await session.create(file.handle);
    file.state.permission = 'denied';
    session.update('nota offline', 8);
    await session.flush();
    expect(session.state.status).toBe('error');
    expect(session.state.message).toContain('Permesso');
    file.state.permission = 'granted';
    await session.reconnect();
    expect(session.state.status).toBe('saved');
    await session.close();
  });

  it('modifica esterna: non sovrascrive e blocca i tentativi automatici successivi', async () => {
    const session = new FileSession(document, memoryCache());
    const file = disk();
    await session.create(file.handle);
    const external = file.state.text.replace('"revision": 0', '"revision": 99');
    file.state.text = external;
    session.update('nota locale', 1);
    await session.flush();
    expect(session.state.status).toBe('conflict');
    session.update('ancora locale', 1);
    await session.flush();
    expect(file.state.text).toBe(external);
    await session.close();
  });

  it('cache inaccessibile: nessuna perdita silenziosa o falsa conferma', async () => {
    const cache: WorkCache = {
      read: async () => {
        throw Error();
      },
      write: async () => {
        throw Error();
      },
    };
    const session = new FileSession(document, cache);
    await session.restore();
    session.update('recuperabile con download', 1);
    await session.flush();
    expect(session.state.status).toBe('export');
    expect(session.state.cacheMessage).toContain('Cache non salvata');
    expect(session.state.unexported).toBe(true);
    await session.close();
  });

  it('ripristina dalla cache senza fingere che il file esterno sia collegato', async () => {
    const cache = memoryCache();
    const first = new FileSession(document, cache);
    first.update('dal browser', 17);
    await first.close();
    const next = new FileSession(document, cache);
    await next.restore();
    expect(next.state.data.draftNote).toBe('dal browser');
    expect(next.state.data.position.page).toBe(17);
    expect(next.state.mode).toBe('manual');
    expect(next.state.unexported).toBe(true);
    await next.close();
  });

  it('JSON invalido o di altro PDF: non sostituisce lo stato corrente', async () => {
    const session = new FileSession(document, memoryCache());
    session.update('originale', 4);
    await expect(session.import('{')).rejects.toThrow();
    const other = createSpike({ ...document, sha256: 'd'.repeat(64) });
    await expect(session.import(serializeSpike(other))).rejects.toThrow('diverso');
    expect(session.state.data.draftNote).toBe('originale');
    await session.close();
  });

  it('rifiuta file non vuoti e non scrive mai sul PDF', async () => {
    const session = new FileSession(document, memoryCache());
    const file = disk();
    file.state.text = 'contenuto preesistente';
    await expect(session.create(file.handle)).rejects.toThrow('non è vuoto');
    const pdf = disk('originale.pdf');
    await expect(session.create(pdf.handle)).rejects.toThrow('non il PDF');
    expect(file.state.writes).toBe(0);
    expect(pdf.state.writes).toBe(0);
    await session.close();
  });

  it('conserva una modifica arrivata durante la scrittura precedente', async () => {
    const session = new FileSession(document, memoryCache());
    const file = disk();
    await session.create(file.handle);
    let injected = false;
    file.state.onClose = async () => {
      if (!injected) {
        injected = true;
        session.update('seconda', 2);
      }
    };
    session.update('prima', 1);
    await session.flush();
    expect(session.state.unexported).toBe(true);
    await session.flush();
    expect(JSON.parse(file.state.text).draftNote).toBe('seconda');
    expect(session.state.unexported).toBe(false);
    await session.close();
  });
});
