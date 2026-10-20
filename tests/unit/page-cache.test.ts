import { describe, it, expect, vi } from 'vitest';
import { PageCache } from '../../src/pdf/page-cache';
const signal = () => new AbortController().signal;
describe('Cache pagine su richiesta', () => {
  it('non legge pagine alla creazione e carica solo quelle richieste', async () => {
    const read = vi.fn(async (n: number) => `pagina ${n}`);
    const cache = new PageCache(read);
    expect(read).not.toHaveBeenCalled();
    expect(await cache.get(35, signal())).toBe('pagina 35');
    expect(read.mock.calls).toEqual([[35]]);
    expect(await cache.get(35, signal())).toBe('pagina 35');
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('espelle la meno recente e mantiene il limite', async () => {
    const read = vi.fn(async (n: number) => n);
    const cache = new PageCache(read, 2);
    await cache.get(1, signal());
    await cache.get(2, signal());
    await cache.get(1, signal());
    await cache.get(35, signal());
    expect(cache.numbers()).toEqual([1, 35]);
    await cache.get(2, signal());
    expect(read.mock.calls.map((c) => c[0])).toEqual([1, 2, 35, 2]);
  });
  it('deduplica richieste concorrenti e abortisce un solo chiamante', async () => {
    let finish!: (n: number) => void;
    const read = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const cache = new PageCache(read);
    const controller = new AbortController();
    const first = cache.get(1, controller.signal);
    const second = cache.get(1, signal());
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    finish(42);
    expect(await second).toBe(42);
    expect(read).toHaveBeenCalledTimes(1);
    expect(cache.numbers()).toEqual([1]);
  });
  it('errori non restano in cache e si può riprovare', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('errore')).mockResolvedValueOnce(1);
    const cache = new PageCache<number>(read);
    await expect(cache.get(1, signal())).rejects.toThrow('errore');
    expect(await cache.get(1, signal())).toBe(1);
  });
  it('non carica con signal già interrotto né dopo chiusura', async () => {
    const read = vi.fn(async (n: number) => n);
    const cache = new PageCache(read);
    const abort = new AbortController();
    abort.abort();
    await expect(cache.get(1, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    cache.close();
    await expect(cache.get(1, signal())).rejects.toThrow('chiuso');
    expect(read).not.toHaveBeenCalled();
  });
});
