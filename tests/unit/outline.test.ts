import { describe, expect, it, vi } from 'vitest';
import { currentSection, readOutline } from '../../src/pdf/outline';
import type { RawOutlineItem } from '../../src/pdf/outline';

function source({
  outline,
  destinations = {},
  failOutline = false,
  failPageIndex = false,
}: {
  outline?: RawOutlineItem[] | null;
  destinations?: Record<string, unknown[] | null>;
  failOutline?: boolean;
  failPageIndex?: boolean;
}) {
  return {
    getOutline: vi.fn(async () => {
      if (failOutline) throw new Error('outline rotto');
      return outline ?? null;
    }),
    getDestination: vi.fn(async (id: string) => destinations[id] ?? null),
    getPageIndex: vi.fn(async (ref: unknown) => {
      if (failPageIndex) throw new Error('riferimento non valido');
      const num = (ref as { num: number }).num;
      // Riferimento 100+pagina → indice zero-based della pagina.
      return num - 101;
    }),
  };
}

const pageRef = (page: number) => ({ num: 100 + page });

describe('lettura dell\u2019indice del PDF', () => {
  it('appiattisce la gerarchia in ordine documento con livelli', async () => {
    const pdf = source({
      outline: [
        { title: 'Capitolo 1', dest: [pageRef(1)], items: [] },
        {
          title: 'Capitolo 2',
          dest: [pageRef(2)],
          items: [{ title: 'Sottosezione', dest: [pageRef(2)], items: [] }],
        },
      ],
    });
    await expect(readOutline(pdf)).resolves.toEqual([
      { id: 'o0', title: 'Capitolo 1', page: 1, level: 1 },
      { id: 'o1', title: 'Capitolo 2', page: 2, level: 1 },
      { id: 'o1-0', title: 'Sottosezione', page: 2, level: 2 },
    ]);
  });
  it('risolve le destinazioni nominate tramite getDestination', async () => {
    const pdf = source({
      outline: [{ title: 'Intro', dest: 'cap1', items: [] }],
      destinations: { cap1: [pageRef(4)] },
    });
    await expect(readOutline(pdf)).resolves.toEqual([
      { id: 'o0', title: 'Intro', page: 4, level: 1 },
    ]);
  });
  it('accetta le destinazioni numeriche zero-based come pagine', async () => {
    const pdf = source({ outline: [{ title: 'Zero', dest: [0], items: [] }] });
    await expect(readOutline(pdf)).resolves.toEqual([
      { id: 'o0', title: 'Zero', page: 1, level: 1 },
    ]);
  });
  it('conserva il genitore senza destinazione se ha figli utili', async () => {
    const pdf = source({
      outline: [
        {
          title: 'Parte I',
          dest: null,
          items: [{ title: 'Capitolo A', dest: [pageRef(1)], items: [] }],
        },
      ],
    });
    await expect(readOutline(pdf)).resolves.toEqual([
      { id: 'o0', title: 'Parte I', page: null, level: 1 },
      { id: 'o0-0', title: 'Capitolo A', page: 1, level: 2 },
    ]);
  });
  it('scarta le foglie non risolvibili e i soli collegamenti esterni', async () => {
    const pdf = source({
      outline: [
        { title: 'Rotto', dest: [pageRef(9)], items: [] },
        { title: 'Solo link', url: 'https://esempio.org', dest: null, items: [] },
        {
          title: 'Gruppo link',
          url: 'https://esempio.org',
          dest: null,
          items: [{ title: 'Figlio', dest: [pageRef(2)], items: [] }],
        },
      ],
      failPageIndex: true,
    });
    // getPageIndex fallisce sempre: "Rotto" viene scartato, i gruppi restano come intestazioni.
    await expect(readOutline(pdf)).resolves.toEqual([
      { id: 'o2', title: 'Gruppo link', page: null, level: 1 },
    ]);
  });
  it('non blocca il documento se l\u2019indice non \u00e8 leggibile', async () => {
    await expect(readOutline(source({ failOutline: true }))).resolves.toEqual([]);
    await expect(readOutline(source({ outline: null }))).resolves.toEqual([]);
  });
  it('limita profondit\u00e0 e numero di voci', async () => {
    const deep = (level: number): RawOutlineItem => ({
      title: `L${level}`,
      dest: [pageRef(1)],
      items: level < 10 ? [deep(level + 1)] : [],
    });
    const entries = await readOutline(source({ outline: [deep(1)] }), { maxLevel: 3 });
    expect(entries.map((e) => e.level)).toEqual([1, 2, 3]);
    const wide = Array.from({ length: 40 }, (_, i) => ({
      title: `V${i}`,
      dest: [pageRef(1)],
      items: [],
    }));
    const capped = await readOutline(source({ outline: wide }), { maxEntries: 7 });
    expect(capped).toHaveLength(7);
  });
});

describe('contesto di pagina onesto', () => {
  const entries = [
    { id: 'a', title: 'Capitolo 1', page: 1, level: 1 },
    { id: 'b', title: 'Capitolo 2', page: 5, level: 1 },
    { id: 'c', title: 'Sottosezione 2.1', page: 5, level: 2 },
    { id: 'd', title: 'Capitolo 3', page: 9, level: 1 },
  ];
  it('dichiara la sezione solo quando la pagina la distingue', () => {
    expect(currentSection(entries, 3)).toBe('Capitolo 1');
    expect(currentSection(entries, 6)).toBeUndefined();
    expect(currentSection(entries, 12)).toBe('Capitolo 3');
  });
  it('usa la pagina raggiunta pi\u00f9 avanti anche con destinazioni fuori ordine', () => {
    const outOfOrder = [
      { id: 'x', title: 'Appendice', page: 30, level: 1 },
      { id: 'y', title: 'Intro', page: 2, level: 1 },
    ];
    expect(currentSection(outOfOrder, 4)).toBe('Intro');
    expect(currentSection(outOfOrder, 31)).toBe('Appendice');
  });
  it('non dichiara nulla prima della prima sezione o senza indice', () => {
    expect(currentSection(entries, 0)).toBeUndefined();
    expect(currentSection([], 3)).toBeUndefined();
  });
});
