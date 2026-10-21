import { describe, it, expect } from 'vitest';
import {
  createAnnotations,
  makeAnchor,
  resolveAnchor,
  parseAnnotations,
  serializeAnnotations,
  type AnnotationData,
  type TextAnchor,
} from '../../src/core/annotations';
import { annotationSession } from '../../src/storage/annotations';
import type { WorkCache, WorkCopy } from '../../src/storage/cache';
import type { ReadingPage } from '../../src/core/reading-model';
const doc = { sha256: 'a'.repeat(64), fileName: 'test.pdf', size: 100 };
const page = (text: string): ReadingPage => ({
  page: 1,
  text,
  width: 600,
  height: 800,
  rotation: 0,
  blocks: [],
  warnings: [],
  supported: true,
});
const anchor = (text = 'Prima caffè 日本語 dopo') => makeAnchor(page(text), 6, 15);
const data = (): AnnotationData => ({
  ...createAnnotations(doc),
  annotations: [
    {
      id: 'nota-1',
      anchor: anchor(),
      color: 'yellow',
      note: '<script>alert(1)</script>',
      createdAt: '2026-10-21T10:00:00.000Z',
      updatedAt: '2026-10-21T10:00:00.000Z',
    },
  ],
});
describe('Ancore e JSON annotazioni', () => {
  it('quote e contesto usano offset UTF-16, non pixel', () => {
    const a = anchor();
    expect(a.quote).toBe('caffè 日本語');
    expect(resolveAnchor('Prima caffè 日本語 dopo', a)).toEqual({
      status: 'exact',
      start: 6,
      end: 15,
    });
  });
  it('riallinea una citazione unica dopo inserimento nel testo', () => {
    const a = anchor();
    expect(resolveAnchor('Nuovo Prima caffè 日本語 dopo', a)).toMatchObject({
      status: 'relocated',
      start: 12,
    });
  });
  it('disambigua ripetizioni mediante contesto completo', () => {
    const a = makeAnchor(page('A frase B'), 2, 7);
    expect(resolveAnchor('frase senza contesto. A frase B', a)).toMatchObject({
      status: 'relocated',
      start: 24,
    });
  });
  it('non sceglie arbitrariamente tra due occorrenze', () => {
    const a: TextAnchor = { page: 1, start: 200, end: 205, quote: 'frase', prefix: '', suffix: '' };
    expect(resolveAnchor('frase e frase', a)).toEqual({ status: 'ambiguous' });
  });
  it('segnala testo assente', () =>
    expect(resolveAnchor('testo differente', anchor())).toEqual({ status: 'missing' }));
  it.each([
    [-1, 2],
    [0, 0],
    [0, 100],
    [1.5, 3],
  ])('rifiuta offset non validi %s–%s', (s, e) =>
    expect(() => makeAnchor(page('testo'), s, e)).toThrow(),
  );
  it('rifiuta selezioni solo spazi', () => expect(() => makeAnchor(page('    '), 0, 3)).toThrow());
  it('roundtrip JSON senza interpretare note HTML', () =>
    expect(parseAnnotations(serializeAnnotations(data()), doc.sha256)).toEqual(data()));
  it('non propaga proprietà sconosciute', () => {
    const value = { ...data(), unknown: 'x', position: { page: 1, offset: 0, unknown: 'x' } };
    const parsed = parseAnnotations(JSON.stringify(value), doc.sha256);
    expect(parsed).not.toHaveProperty('unknown');
    expect(parsed.position).not.toHaveProperty('unknown');
  });
  it('rifiuta fingerprint diverso senza cambiare dati', () =>
    expect(() => parseAnnotations(serializeAnnotations(data()), 'b'.repeat(64))).toThrow(
      'PDF diverso',
    ));
  it.each([
    (d: AnnotationData) => ({ ...d, version: 2 }),
    (d: AnnotationData) => ({ ...d, normalization: 'fluido-text/1' }),
    (d: AnnotationData) => ({ ...d, position: { page: 0, offset: 0 } }),
    (d: AnnotationData) => ({ ...d, annotations: [...d.annotations, ...d.annotations] }),
    (d: AnnotationData) => ({
      ...d,
      annotations: d.annotations.map((a) => ({ ...a, color: 'red' })),
    }),
    (d: AnnotationData) => ({
      ...d,
      annotations: d.annotations.map((a) => ({ ...a, anchor: { ...a.anchor, end: 999 } })),
    }),
  ])('rifiuta schema, posizioni e annotazioni non validi', (change) =>
    expect(() => parseAnnotations(JSON.stringify(change(data())), doc.sha256)).toThrow(),
  );
  it('conserva ancore del punto e figure nel formato portabile', () => {
    const d = data();
    d.position = { page: 1, offset: 6, anchor: anchor(), figure: 'p1-f1', fraction: 0.25 };
    expect(parseAnnotations(serializeAnnotations(d), doc.sha256).position).toEqual(d.position);
  });
  it('rifiuta ancora del punto su altra pagina', () => {
    const d = data();
    d.position = { page: 1, offset: 6, anchor: { ...anchor(), page: 2 } };
    expect(() => parseAnnotations(serializeAnnotations(d), doc.sha256)).toThrow('punto di lettura');
  });
});
describe('Sessione annotazioni separata dalla prova tecnica', () => {
  const cache = () => {
    let copy: WorkCopy<AnnotationData> | undefined;
    return {
      async read() {
        return copy;
      },
      async write(next) {
        copy = structuredClone(next);
      },
    } satisfies WorkCache<AnnotationData>;
  };
  it('salva CRUD e posizione con una sola revisione e ripristina la cache', async () => {
    const storage = cache(),
      session = annotationSession(doc, storage);
    await session.restore();
    session.change((d) => ({
      ...d,
      annotations: data().annotations,
      position: { page: 8, offset: 27 },
    }));
    await session.flush();
    expect(session.state.unexported).toBe(true);
    expect(session.state.data.revision).toBe(1);
    const next = annotationSession(doc, storage);
    await next.restore();
    expect(next.state.data.annotations).toHaveLength(1);
    expect(next.state.data.position).toEqual({ page: 8, offset: 27 });
    await session.close();
    await next.close();
  });
  it('importa lo schema reale e non confonde il vecchio file-spike', async () => {
    const s = annotationSession(doc, cache());
    await s.import(serializeAnnotations(data()));
    expect(s.state.data.annotations).toHaveLength(1);
    await expect(
      s.import(JSON.stringify({ schema: 'fluido/file-spike', version: 1 })),
    ).rejects.toThrow('Schema');
    expect(s.state.data.annotations).toHaveLength(1);
    await s.close();
  });
  it('un import errato non sostituisce annotazioni o posizione', async () => {
    const s = annotationSession(doc, cache());
    await s.import(serializeAnnotations(data()));
    await expect(s.import('null')).rejects.toThrow();
    expect(s.state.data).toEqual(data());
    await s.close();
  });
});
