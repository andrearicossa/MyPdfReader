import { createSpike, parseSpike, serializeSpike, type SpikeData } from '../core/file-spike';
import { workCache, type WorkCache, type WorkCopy } from './cache';
import type { LocalHandle } from './files';

export type FileState = {
  data: SpikeData;
  mode: 'manual' | 'automatic';
  status: 'export' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
  message: string;
  cacheMessage: string;
  fileName?: string;
  canReconnect: boolean;
  unexported: boolean;
  cachePending: boolean;
};

export class FileSession {
  state: FileState;
  private handle?: LocalHandle;
  private pdfHandle?: LocalHandle;
  private rememberedHandle?: LocalHandle;
  private baseline?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private queue = Promise.resolve();
  private listeners = new Set<(state: FileState) => void>();
  private cache: WorkCache;

  constructor(document: SpikeData['document'], cache: WorkCache = workCache) {
    this.cache = cache;
    this.state = {
      data: createSpike(document),
      mode: 'manual',
      status: 'export',
      message: 'Nessun file associato. Crea un nuovo file oppure importane uno.',
      cacheMessage: 'Cache non ancora verificata.',
      canReconnect: false,
      unexported: false,
      cachePending: false,
    };
  }

  subscribe(listener: (state: FileState) => void): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((listener) => listener({ ...this.state }));
  }

  async restore(pdfHandle?: LocalHandle) {
    this.pdfHandle = pdfHandle;
    try {
      const cached = await this.cache.read(this.state.data.document.sha256);
      if (cached) {
        this.state.data = parseSpike(serializeSpike(cached.data), this.state.data.document.sha256);
        this.baseline = cached.baseline;
        this.rememberedHandle = cached.sidecarHandle;
        this.pdfHandle = pdfHandle ?? cached.pdfHandle;
        this.state.canReconnect = !!this.rememberedHandle;
        this.state.unexported = cached.unexported;
        this.state.message =
          'Copia di lavoro recuperata dal browser. Non equivale al file esterno: ricollegalo o scarica il JSON.';
      }
      this.state.cacheMessage = 'Cache locale disponibile; può essere eliminata dal browser.';
      // Anche l'apertura senza modifiche deve poter ricordare l'handle del PDF.
      if (!cached) await this.remember();
    } catch {
      this.state.cacheMessage =
        'Cache locale non disponibile o non valida: scarica il JSON prima di chiudere.';
    }
    this.emit();
  }

  update(note: string, page: number) {
    this.state.data = {
      ...this.state.data,
      revision: this.state.data.revision + 1,
      draftNote: note,
      position: { page },
    };
    this.state.unexported = true;
    this.state.cachePending = true;
    // Un conflitto o errore blocca l'autoscrittura fino a un'azione esplicita.
    if (this.state.status !== 'conflict' && this.state.status !== 'error') {
      this.state.status = 'pending';
      this.state.message = 'Modifiche in attesa.';
    }
    this.emit();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 700);
  }

  private async remember(): Promise<void> {
    const copy: WorkCopy = {
      data: this.state.data,
      unexported: this.state.unexported,
      baseline: this.baseline,
      sidecarHandle: this.handle ?? this.rememberedHandle,
      pdfHandle: this.pdfHandle,
    };
    const revision = copy.data.revision;
    try {
      await this.cache.write(copy);
      if (this.state.data.revision === revision) this.state.cachePending = false;
      this.state.cacheMessage = 'Copia di lavoro salvata nel browser; non sostituisce il JSON.';
    } catch {
      this.state.cacheMessage = 'Cache non salvata: conserva i dati scaricando il JSON.';
    }
    this.emit();
  }

  /** Serializza le scritture e mantiene le modifiche effettuate durante close(). */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.queue = this.queue.then(async () => {
      await this.remember();
      if (!this.handle || this.state.status === 'conflict' || this.state.status === 'error') {
        if (this.state.status === 'pending') {
          this.state.status = 'export';
          this.state.message = 'Modifiche non esportate: scarica il file JSON aggiornato.';
        }
        this.emit();
        return;
      }
      if (!this.state.unexported) return;
      const data = this.state.data;
      const text = serializeSpike(data);
      this.state.status = 'saving';
      this.state.message = 'Scrittura del file in corso…';
      this.emit();
      try {
        // Non richiedere permessi automaticamente nel debounce.
        if ((await this.handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
          throw new Error('Permesso di scrittura revocato. Ricollega il file o scarica il JSON.');
        }
        const current = await (await this.handle.getFile()).text();
        if (current !== this.baseline) {
          this.state.status = 'conflict';
          this.state.message =
            'Il JSON è cambiato fuori dall’app. Scrittura bloccata: scarica la tua copia prima di importare quella esterna.';
          return;
        }
        const stream = await this.handle.createWritable();
        try {
          await stream.write(text);
          await stream.close();
        } catch (error) {
          await stream.abort().catch(() => undefined);
          throw error;
        }
        this.baseline = text;
        if (this.state.data.revision === data.revision) this.state.unexported = false;
        this.state.status = this.state.unexported ? 'pending' : 'saved';
        this.state.message = this.state.unexported
          ? 'Nuove modifiche in attesa.'
          : 'Salvato nel file associato (scrittura confermata).';
        await this.remember();
      } catch (error) {
        this.state.status = 'error';
        this.state.message = error instanceof Error ? error.message : 'Scrittura fallita.';
      } finally {
        this.emit();
      }
    });
    return this.queue;
  }

  private async safeHandle(handle: LocalHandle) {
    if (!handle.name.toLowerCase().endsWith('.json')) {
      throw new Error('Scegli un file .json separato, non il PDF originale.');
    }
    if (this.pdfHandle && (await handle.isSameEntry(this.pdfHandle))) {
      throw new Error('Il file associato non può coincidere con il PDF originale.');
    }
  }

  async create(handle: LocalHandle) {
    await this.flush();
    await this.safeHandle(handle);
    const text = await (await handle.getFile()).text();
    if (text.length) {
      throw new Error('Il file scelto non è vuoto. Importalo oppure scegli un nuovo nome.');
    }
    this.handle = this.rememberedHandle = handle;
    this.baseline = text;
    this.state.canReconnect = true;
    this.state.fileName = handle.name;
    this.state.mode = 'automatic';
    this.state.status = 'pending';
    this.state.unexported = true;
    await this.flush();
  }

  async import(text: string, handle?: LocalHandle) {
    await this.flush();
    if (handle) await this.safeHandle(handle);
    const data = parseSpike(text, this.state.data.document.sha256);
    // Il chiamante deve ottenere conferma prima di sostituire la copia corrente.
    this.state.data = data;
    this.handle = this.rememberedHandle = handle;
    this.baseline = handle ? text : undefined;
    this.state.canReconnect = !!handle;
    this.state.fileName = handle?.name;
    this.state.mode = handle ? 'automatic' : 'manual';
    this.state.unexported = false;
    this.state.cachePending = true;
    this.state.status = handle ? 'saved' : 'export';
    this.state.message = handle
      ? 'File associato letto; aggiornamento automatico attivo.'
      : 'JSON importato. Gli aggiornamenti richiedono un nuovo download.';
    await this.remember();
  }

  /** Chiamato direttamente da un gesto utente, prima di altre attese. */
  async reconnect() {
    const handle = this.rememberedHandle;
    if (!handle) return;
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted')
      throw new Error('Permesso negato. Puoi ancora scaricare il JSON.');
    await this.flush();
    const current = await (await handle.getFile()).text();
    parseSpike(current, this.state.data.document.sha256);
    if (current !== this.baseline) {
      throw new Error(
        'Il file esterno è cambiato. Scarica la copia locale e importa il JSON esterno.',
      );
    }
    this.handle = handle;
    this.state.mode = 'automatic';
    this.state.fileName = handle.name;
    this.state.status = this.state.unexported ? 'pending' : 'saved';
    this.state.message = 'File ricollegato con permesso di scrittura.';
    await this.flush();
    this.emit();
  }

  async exported(revision: number) {
    // Un download avviato non garantisce che l'utente abbia conservato il file.
    if (this.state.data.revision === revision) {
      this.state.unexported = false;
      this.state.cachePending = false;
    }
    this.state.message = 'Download avviato: verifica di aver conservato il JSON aggiornato.';
    await this.remember();
  }

  async close() {
    clearTimeout(this.timer);
    await this.flush();
    this.listeners.clear();
  }
}
