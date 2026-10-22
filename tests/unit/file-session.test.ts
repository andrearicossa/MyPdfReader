import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpike, serializeSpike } from '../../src/core/file-spike';
import { FileSession } from '../../src/storage/file-session';
import type { LocalHandle } from '../../src/storage/files';
import { CacheConflictError, type WorkCache, type WorkCopy } from '../../src/storage/cache';

const document = { sha256: 'c'.repeat(64), fileName: 'prova.pdf', size: 50 };

function memoryCache(): WorkCache & { copy?: WorkCopy } {
  return {
    copy: undefined,
    async read() {
      return this.copy;
    },
    async write(copy, expectedToken) {
      if (expectedToken !== undefined && (this.copy?.cacheToken ?? null) !== expectedToken)
        throw new CacheConflictError();
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

  it('download dopo permesso revocato non annulla la scrittura al ricollegamento', async () => {
    const session = new FileSession(document, memoryCache());
    const file = disk();
    await session.create(file.handle);
    file.state.permission = 'denied';
    session.update('scaricata, ma ancora da scrivere nel file', 3);
    await session.flush();
    expect(session.state.status).toBe('error');
    await session.exported(session.state.data.revision);
    expect(session.state.unexported).toBe(false);
    file.state.permission = 'granted';
    await session.reconnect();
    expect(JSON.parse(file.state.text).draftNote).toBe('scaricata, ma ancora da scrivere nel file');
    expect(session.state.status).toBe('saved');
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

  it('cache e download non attendono uno stream lento; download non annulla l’autoscrittura', async () => {
    vi.useFakeTimers();
    const cache = memoryCache(),
      session = new FileSession(document, cache),
      file = disk();
    await session.create(file.handle);
    let unblock!: () => void, started!: () => void;
    const writing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    file.state.onClose = async () => {
      started();
      await blocked;
    };
    session.update('prima lenta', 1);
    const pending = session.flush();
    await writing;
    session.update('seconda recuperabile', 2);
    await vi.advanceTimersByTimeAsync(700);
    expect(cache.copy?.data.draftNote).toBe('seconda recuperabile');
    await session.persistLocal();
    await session.exported(session.state.data.revision);
    expect(session.state.unexported).toBe(false);
    expect(file.state.text).not.toContain('seconda recuperabile');
    unblock();
    await pending;
    await session.flush();
    expect(JSON.parse(file.state.text).draftNote).toBe('seconda recuperabile');
    expect(session.state.status).toBe('saved');
    await session.close();
    vi.useRealTimers();
  });

  it.each(['local', 'external'] as const)(
    'conflitto file: scelta %s esplicita e snapshot esportabile',
    async (choice) => {
      const session = new FileSession(document, memoryCache()),
        file = disk();
      await session.create(file.handle);
      const external = { ...createSpike(document), revision: 99, draftNote: 'esterna' };
      file.state.text = serializeSpike(external);
      session.update('locale', 7);
      await session.flush();
      expect(session.state.conflict?.canUseExternal).toBe(true);
      expect(session.conflictExport()).toBe(file.state.text);
      await session.exported(session.state.data.revision);
      expect(session.state.status).toBe('conflict');
      await session.resolveConflict(choice);
      expect(session.state.conflict).toBeUndefined();
      expect(session.state.data.draftNote).toBe(choice === 'local' ? 'locale' : 'esterna');
      expect(JSON.parse(file.state.text).draftNote).toBe(session.state.data.draftNote);
      expect(session.state.data.revision).toBe(choice === 'local' ? 100 : 99);
      await session.close();
    },
  );

  it('file cambiato ancora: aggiorna il conflitto senza applicare la scelta precedente', async () => {
    const session = new FileSession(document, memoryCache()),
      file = disk();
    await session.create(file.handle);
    file.state.text = serializeSpike({ ...createSpike(document), revision: 2 });
    session.update('locale', 2);
    await session.flush();
    const latest = serializeSpike({ ...createSpike(document), revision: 3 });
    file.state.text = latest;
    await expect(session.resolveConflict('local')).rejects.toThrow('ancora');
    expect(session.state.conflict?.externalRevision).toBe(3);
    expect(file.state.text).toBe(latest);
    await session.close();
  });

  it.each([
    '{',
    '{"schema":"fluido/file-spike","version":99}',
    serializeSpike(createSpike({ ...document, sha256: 'd'.repeat(64) })),
  ])('conflitto non importabile: nessun overwrite per %s', async (external) => {
    const session = new FileSession(document, memoryCache()),
      file = disk();
    await session.create(file.handle);
    file.state.text = external;
    session.update('non perdere', 1);
    await session.flush();
    expect(session.state.conflict?.canUseExternal).toBe(false);
    await expect(session.resolveConflict('local')).rejects.toThrow('non è valida');
    expect(file.state.text).toBe(external);
    expect(session.state.data.draftNote).toBe('non perdere');
    await session.close();
  });

  it.each(['local', 'external'] as const)(
    'due schede: CAS e scelta cache %s senza sovrascrittura silenziosa',
    async (choice) => {
      const cache = memoryCache(),
        first = new FileSession(document, cache),
        second = new FileSession(document, cache);
      await first.restore();
      await second.restore();
      first.update('prima scheda', 1);
      await first.flush();
      second.update('seconda scheda', 2);
      await second.flush();
      expect(second.state.conflict?.source).toBe('cache');
      expect(cache.copy?.data.draftNote).toBe('prima scheda');
      await second.exported(second.state.data.revision);
      expect(second.state.conflict?.source).toBe('cache');
      expect(cache.copy?.data.draftNote).toBe('prima scheda');
      await second.resolveConflict(choice);
      const chosen = choice === 'local' ? 'seconda scheda' : 'prima scheda';
      expect(second.state.data.draftNote).toBe(chosen);
      expect(cache.copy?.data.draftNote).toBe(chosen);
      expect(second.state.mode).toBe('manual');
      expect(second.conflictExport()).toBeUndefined();
      // Chiudere la scheda ormai obsoleta non deve riscrivere la versione scelta.
      await first.close();
      await second.close();
      expect(cache.copy?.data.draftNote).toBe(chosen);
    },
  );

  it('cache cambiata dopo la prima scelta: richiede una nuova conferma', async () => {
    const cache = memoryCache(),
      first = new FileSession(document, cache),
      second = new FileSession(document, cache);
    await first.restore();
    await second.restore();
    first.update('prima', 1);
    await first.flush();
    second.update('seconda', 2);
    await second.flush();
    first.update('prima aggiornata ancora', 3);
    await first.flush();
    await expect(second.resolveConflict('local')).rejects.toThrow('ancora');
    expect(JSON.parse(second.conflictExport()!).draftNote).toBe('prima aggiornata ancora');
    expect(cache.copy?.data.draftNote).toBe('prima aggiornata ancora');
    await first.close();
    await second.close();
  });

  it('download manuale prima del debounce: non ricompare un falso avviso non esportato', async () => {
    vi.useFakeTimers();
    const session = new FileSession(document, memoryCache());
    session.update('già scaricata', 1);
    await session.exported(session.state.data.revision);
    await vi.advanceTimersByTimeAsync(700);
    expect(session.state.unexported).toBe(false);
    expect(session.state.status).toBe('export');
    expect(session.state.message).toContain('Download avviato');
    await session.close();
    vi.useRealTimers();
  });

  it('lettura cache fallita: non sostituisce una copia precedente non ispezionata', async () => {
    const cache = memoryCache();
    cache.copy = {
      data: { ...createSpike(document), draftNote: 'precedente da conservare' },
      unexported: true,
    };
    cache.read = async () => {
      throw new Error('Lettura temporaneamente indisponibile');
    };
    const session = new FileSession(document, cache);
    await session.restore();
    session.update('nuovo lavoro in memoria', 1);
    await session.flush();
    expect(cache.copy.data.draftNote).toBe('precedente da conservare');
    expect(session.state.cachePending).toBe(true);
    await session.close();
    expect(cache.copy.data.draftNote).toBe('precedente da conservare');
  });

  it('cache futura conservata intatta, lavoro locale ancora esportabile', async () => {
    const cache = memoryCache();
    cache.copy = {
      data: { ...createSpike(document), version: 99 } as unknown as ReturnType<typeof createSpike>,
      unexported: true,
    };
    const future = structuredClone(cache.copy);
    const session = new FileSession(document, cache);
    await session.restore();
    session.update('nuova copia separata', 1);
    await session.flush();
    expect(cache.copy).toEqual(future);
    expect(session.state.cachePending).toBe(true);
    expect(session.state.cacheMessage).toContain('Cache non salvata');
    await session.exported(session.state.data.revision);
    expect(session.state.cachePending).toBe(false);
    await session.close();
    expect(cache.copy).toEqual(future);
  });
});
