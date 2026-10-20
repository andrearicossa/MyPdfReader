/** Cache effimera LRU; nessun preload. L'abort interrompe l'attesa del chiamante,
 * non il lavoro PDF.js già inviato al worker, condiviso fra richieste della stessa pagina.
 */
export class PageCache<T> {
  private cache = new Map<number, T>();
  private pending = new Map<number, Promise<T>>();
  private closed = false;
  constructor(
    private read: (page: number) => Promise<T>,
    private limit = 8,
  ) {}
  values(): T[] {
    return [...this.cache.values()];
  }
  numbers(): number[] {
    return [...this.cache.keys()].sort((a, b) => a - b);
  }
  async get(number: number, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    if (this.closed) throw new Error('Documento chiuso.');
    if (this.cache.has(number)) {
      const value = this.cache.get(number)!;
      this.cache.delete(number);
      this.cache.set(number, value);
      return value;
    }
    let pending = this.pending.get(number);
    if (!pending) {
      pending = this.read(number)
        .then((value) => {
          if (!this.closed) {
            this.cache.set(number, value);
            while (this.cache.size > this.limit) this.cache.delete(this.cache.keys().next().value!);
          }
          return value;
        })
        .finally(() => this.pending.delete(number));
      this.pending.set(number, pending);
    }
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(signal.reason ?? new DOMException('Interrotto', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      pending!
        .then((value) => {
          if (!signal.aborted) resolve(value);
        }, reject)
        .finally(() => signal.removeEventListener('abort', abort));
      if (signal.aborted) abort();
    });
  }
  close() {
    this.closed = true;
    this.cache.clear();
  }
}
