import { createSpike, parseSpike, serializeSpike, type SpikeData } from '../core/file-spike';
import { CacheConflictError, workCache, type WorkCache, type WorkCopy } from './cache';
import type { LocalHandle } from './files';

export type SessionData = Pick<SpikeData, 'document' | 'revision' | 'draftNote' | 'position'>;
export type DataCodec<T> = {
  create(document: SpikeData['document']): T;
  parse(text: string, hash: string): T;
  serialize(data: T): string;
  touch?(data: T): T;
};
const spikeCodec: DataCodec<SpikeData> = {
  create: createSpike,
  parse: parseSpike,
  serialize: serializeSpike,
};
export type FileState<T = SpikeData> = {
  data: T;
  mode: 'manual' | 'automatic';
  status: 'export' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
  message: string;
  cacheMessage: string;
  fileName?: string;
  canReconnect: boolean;
  unexported: boolean;
  cachePending: boolean;
  /** Effimero: collegare/importare un file non prova un commit dello stream. */
  writeConfirmed?: boolean;
  conflict?: {
    source: 'file' | 'cache';
    externalRevision?: number;
    externalUpdatedAt?: string;
    canUseExternal: boolean;
  };
};

export class FileSession<T extends SessionData = SpikeData> {
  state: FileState<T>;
  private handle?: LocalHandle;
  private pdfHandle?: LocalHandle;
  private rememberedHandle?: LocalHandle;
  private baseline?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private queue = Promise.resolve();
  private cacheQueue = Promise.resolve();
  private cacheToken: string | null = null;
  private cacheDisabled = false;
  private filePending = false;
  private conflictText?: string;
  private conflictCopy?: WorkCopy<T>;
  private listeners = new Set<(state: FileState<T>) => void>();
  private cache: WorkCache<T>;
  private codec: DataCodec<T>;

  constructor(
    document: SpikeData['document'],
    cache: WorkCache<T> = workCache as unknown as WorkCache<T>,
    codec: DataCodec<T> = spikeCodec as unknown as DataCodec<T>,
  ) {
    this.cache = cache;
    this.codec = codec;
    this.state = {
      data: codec.create(document),
      mode: 'manual',
      status: 'export',
      message: 'Nessun file associato. Crea un nuovo file oppure importane uno.',
      cacheMessage: 'Cache non ancora verificata.',
      canReconnect: false,
      unexported: false,
      cachePending: false,
    };
  }

  subscribe(listener: (state: FileState<T>) => void): () => void {
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
        // Una cache futura/corrotta non viene mai riscritta come un documento vuoto.
        try {
          this.state.data = this.codec.parse(
            this.codec.serialize(cached.data),
            this.state.data.document.sha256,
          );
        } catch (error) {
          this.cacheDisabled = true;
          throw error;
        }
        this.cacheToken = cached.cacheToken ?? null;
        this.baseline = cached.baseline;
        this.rememberedHandle = cached.sidecarHandle;
        this.pdfHandle = pdfHandle ?? cached.pdfHandle;
        this.state.canReconnect = !!this.rememberedHandle;
        this.state.unexported = cached.unexported;
        this.filePending = cached.filePending ?? cached.unexported;
        this.state.message =
          'Copia di lavoro recuperata dal browser. Non equivale al file esterno: ricollegalo o scarica il JSON.';
      }
      this.state.cacheMessage = 'Cache locale disponibile; può essere eliminata dal browser.';
      // Anche l'apertura senza modifiche deve poter ricordare l'handle del PDF.
      if (!cached) await this.remember();
    } catch {
      this.cacheDisabled = true;
      this.state.cacheMessage =
        'Cache locale non disponibile o non valida: scarica il JSON prima di chiudere.';
    }
    this.emit();
  }

  update(note: string, page: number) {
    this.change((data) => ({ ...data, draftNote: note, position: { page } }));
  }

  change(update: (data: T) => T) {
    const next = update(this.state.data);
    if (next === this.state.data) return;
    const revised = {
      ...next,
      revision: this.state.data.revision + 1,
    };
    this.state.data = this.codec.touch?.(revised) ?? revised;
    this.state.unexported = true;
    this.state.writeConfirmed = false;
    this.state.cachePending = true;
    this.filePending = true;
    // Un conflitto o errore blocca l'autoscrittura fino a un'azione esplicita.
    if (this.state.status !== 'conflict' && this.state.status !== 'error') {
      this.state.status = 'pending';
      this.state.message = 'Modifiche in attesa.';
    }
    this.emit();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 700);
  }

  private remember(): Promise<void> {
    this.cacheQueue = this.cacheQueue.then(async () => {
      if (this.state.conflict?.source === 'cache') return;
      const copy: WorkCopy<T> = {
        data: this.state.data,
        unexported: this.state.unexported,
        baseline: this.baseline,
        sidecarHandle: this.handle ?? this.rememberedHandle,
        pdfHandle: this.pdfHandle,
        cacheToken: crypto.randomUUID(),
        filePending: this.filePending,
      };
      try {
        if (this.cacheDisabled) throw new Error('Cache conservata senza modificarla.');
        await this.cache.write(copy, this.cacheToken);
        this.cacheToken = copy.cacheToken!;
        if (this.state.data === copy.data) this.state.cachePending = false;
        this.state.cacheMessage = 'Copia di lavoro salvata nel browser; non sostituisce il JSON.';
      } catch (error) {
        this.state.cacheMessage = 'Cache non salvata: conserva i dati scaricando il JSON.';
        if (error instanceof CacheConflictError) {
          this.state.status = 'conflict';
          this.state.message =
            'La copia di lavoro è cambiata in un’altra scheda. Scrittura bloccata: scegli quale copia conservare.';
          this.conflictCopy = await this.cache
            .read(this.state.data.document.sha256)
            .catch(() => undefined);
          this.state.conflict = this.conflictInfo('cache', this.conflictCopy?.data);
        }
      }
      this.emit();
    });
    return this.cacheQueue;
  }

  private conflictInfo(
    source: 'file' | 'cache',
    value?: unknown,
  ): NonNullable<FileState<T>['conflict']> {
    try {
      const data = this.codec.parse(JSON.stringify(value), this.state.data.document.sha256);
      const updatedAt = (data as T & { updatedAt?: string }).updatedAt;
      return {
        source,
        externalRevision: data.revision,
        externalUpdatedAt: updatedAt,
        canUseExternal: true,
      };
    } catch {
      return { source, canUseExternal: false };
    }
  }

  private fileConflict(text: string) {
    this.conflictText = text;
    this.state.conflict = this.conflictInfo(
      'file',
      (() => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return undefined;
        }
      })(),
    );
    this.state.status = 'conflict';
    this.state.message =
      'Il JSON è cambiato fuori dall’app. Scrittura bloccata: scarica la tua copia prima di scegliere quale conservare.';
    this.emit();
  }

  private hasCacheConflict(): boolean {
    return this.state.conflict?.source === 'cache';
  }

  /** Serializza le scritture e mantiene le modifiche effettuate durante close(). */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    // La cache non attende né uno stream lento né la coda delle scritture esterne.
    const cached = this.remember();
    this.queue = this.queue.then(async () => {
      await cached;
      if (
        !this.handle ||
        this.state.conflict ||
        this.state.status === 'conflict' ||
        this.state.status === 'error'
      ) {
        if (this.state.status === 'pending') {
          this.state.status = 'export';
          this.state.message = 'Modifiche non esportate: scarica il file JSON aggiornato.';
        }
        this.emit();
        return;
      }
      if (!this.filePending) return;
      const data = this.state.data;
      const text = this.codec.serialize(data);
      this.state.status = 'saving';
      this.state.message = 'Scrittura del file in corso…';
      this.emit();
      try {
        // Non richiedere permessi automaticamente nel debounce.
        if ((await this.handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
          throw new Error('Permesso di scrittura revocato. Ricollega il file o scarica il JSON.');
        }
        const current = await (await this.handle.getFile()).text();
        if (this.hasCacheConflict()) return;
        if (current !== this.baseline) {
          this.fileConflict(current);
          return;
        }
        const stream = await this.handle.createWritable();
        try {
          // Riduce la finestra tra lettura e scrittura, senza promettere un CAS del filesystem.
          const latest = await (await this.handle.getFile()).text();
          if (this.hasCacheConflict()) {
            await stream.abort().catch(() => undefined);
            return;
          }
          if (latest !== current) {
            await stream.abort().catch(() => undefined);
            this.fileConflict(latest);
            return;
          }
          await stream.write(text);
          await stream.close();
        } catch (error) {
          await stream.abort().catch(() => undefined);
          throw error;
        }
        this.baseline = text;
        this.state.writeConfirmed = this.state.data === data;
        if (this.state.data === data) {
          this.state.unexported = false;
          this.filePending = false;
        }
        if (!this.state.conflict) {
          this.state.status = this.filePending ? 'pending' : 'saved';
          this.state.message = this.filePending
            ? 'Nuove modifiche in attesa.'
            : 'Salvato nel file associato (scrittura confermata).';
        } else this.state.status = 'conflict';
        await this.remember();
      } catch (error) {
        if (this.state.conflict) this.state.status = 'conflict';
        else {
          this.state.status = 'error';
          this.state.message = error instanceof Error ? error.message : 'Scrittura fallita.';
        }
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
    if (this.state.conflict?.source === 'cache')
      throw new Error('Risolvi prima il conflitto tra le copie nel browser.');
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
    this.filePending = true;
    this.state.conflict = undefined;
    await this.flush();
  }

  async import(text: string, handle?: LocalHandle) {
    // Validare prima di qualsiasi I/O: un import invalido non attiva scritture.
    const data = this.codec.parse(text, this.state.data.document.sha256);
    await this.flush();
    if (this.state.conflict?.source === 'cache')
      throw new Error('Risolvi prima il conflitto tra le copie nel browser.');
    if (handle) await this.safeHandle(handle);
    if (handle && (await (await handle.getFile()).text()) !== text)
      throw new Error('Il file è cambiato durante l’importazione. Selezionalo nuovamente.');
    // Il chiamante deve ottenere conferma prima di sostituire la copia corrente.
    this.state.data = data;
    this.state.writeConfirmed = false;
    this.handle = this.rememberedHandle = handle;
    this.baseline = handle ? text : undefined;
    this.state.canReconnect = !!handle;
    this.state.fileName = handle?.name;
    this.state.mode = handle ? 'automatic' : 'manual';
    this.state.unexported = false;
    this.filePending = false;
    this.state.cachePending = true;
    this.state.conflict = undefined;
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
    if (this.state.conflict?.source === 'cache')
      throw new Error('Risolvi prima il conflitto tra le copie nel browser.');
    const current = await (await handle.getFile()).text();
    if (current !== this.baseline) {
      this.fileConflict(current);
      return;
    }
    this.codec.parse(current, this.state.data.document.sha256);
    this.handle = handle;
    this.state.mode = 'automatic';
    this.state.fileName = handle.name;
    this.state.status = this.filePending ? 'pending' : 'saved';
    this.state.message = 'File ricollegato con permesso di scrittura.';
    this.state.conflict = undefined;
    await this.flush();
    this.emit();
  }

  /** Nessun merge automatico. Il chiamante deve confermare la sostituzione. */
  async resolveConflict(choice: 'local' | 'external') {
    await this.flush();
    const conflict = this.state.conflict;
    if (!conflict) return;
    if (!conflict.canUseExternal)
      throw new Error(
        'La copia esterna non è valida o usa uno schema non supportato. Scarica la copia locale in un nuovo file.',
      );
    if (conflict.source === 'cache') {
      const copy = await this.cache.read(this.state.data.document.sha256);
      if (!copy || copy.cacheToken !== this.conflictCopy?.cacheToken) {
        this.conflictCopy = copy;
        this.state.conflict = this.conflictInfo('cache', copy?.data);
        this.emit();
        throw new Error('La copia nel browser è cambiata ancora. Controlla e ripeti la scelta.');
      }
      const external = this.codec.parse(
        this.codec.serialize(copy.data),
        this.state.data.document.sha256,
      );
      this.cacheToken = copy.cacheToken ?? null;
      if (choice === 'external') {
        this.state.data = external;
        this.baseline = copy.baseline;
        this.rememberedHandle = copy.sidecarHandle;
        this.state.unexported = copy.unexported;
        this.filePending = copy.filePending ?? copy.unexported;
        this.state.cachePending = false;
      } else {
        this.state.unexported = true;
        this.filePending = true;
        this.state.cachePending = true;
      }
      // Una scelta sulla cache non autorizza la sovrascrittura del file esterno.
      this.handle = undefined;
      this.state.mode = 'manual';
      this.state.canReconnect = !!this.rememberedHandle;
      this.state.conflict = undefined;
      this.state.status = 'export';
      this.state.message =
        'Copia scelta nel browser. Scarica il JSON oppure ricollega il file esterno.';
      if (choice === 'local') await this.remember();
      this.emit();
      return;
    }
    const handle = this.handle ?? this.rememberedHandle;
    if (!handle) throw new Error('Ricollega prima il file esterno.');
    const text = await (await handle.getFile()).text();
    if (text !== this.conflictText) {
      this.fileConflict(text);
      throw new Error('Il file è cambiato ancora. Controlla e ripeti la scelta.');
    }
    const external = this.codec.parse(text, this.state.data.document.sha256);
    if (choice === 'external') {
      await this.import(text, handle);
      return;
    }
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted')
      throw new Error(
        'Permesso di scrittura non disponibile. Scarica la copia locale in un nuovo file.',
      );
    this.handle = handle;
    this.baseline = text;
    const revised = {
      ...this.state.data,
      revision: Math.max(this.state.data.revision, external.revision) + 1,
    };
    this.state.data = this.codec.touch?.(revised) ?? revised;
    this.state.conflict = undefined;
    this.state.status = 'pending';
    this.state.unexported = true;
    this.filePending = true;
    this.state.mode = 'automatic';
    await this.flush();
  }

  async exported(revision: number) {
    // Un download avviato non garantisce che l'utente abbia conservato il file.
    if (this.state.data.revision === revision) {
      this.state.unexported = false;
      this.state.cachePending = false;
      if (!this.handle && this.state.status === 'pending') this.state.status = 'export';
    }
    if (!this.state.conflict)
      this.state.message = 'Download avviato: verifica di aver conservato il JSON aggiornato.';
    this.emit();
    await this.remember();
    this.emit();
  }

  /** Il download resta accessibile anche quando uno stream esterno è bloccato. */
  persistLocal(): Promise<void> {
    return this.remember();
  }

  /** Copia esatta rilevata al momento del conflitto, senza conversioni di schema. */
  conflictExport(): string | undefined {
    if (!this.state.conflict) return undefined;
    return this.state.conflict?.source === 'file'
      ? this.conflictText
      : this.conflictCopy
        ? JSON.stringify(this.conflictCopy.data, null, 2) + '\n'
        : undefined;
  }

  async close() {
    clearTimeout(this.timer);
    await this.flush();
    this.listeners.clear();
  }
}
