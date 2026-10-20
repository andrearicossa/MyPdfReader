import { describe, it, expect } from 'vitest';
import {
  buildReadingModel,
  normalizeText,
  type RawPage,
  type TextRun,
} from '../../src/core/reading-model';
import { mergeRegions, multiply, transformedRect } from '../../src/pdf/figures';

const run = (text: string, y: number, fontSize = 12, x = 40, width = 400): TextRun => ({
  text,
  x,
  y,
  width,
  height: fontSize,
  fontSize,
});
const page = (runs: TextRun[], number = 1): RawPage => ({
  page: number,
  width: 595,
  height: 842,
  rotation: 0,
  runs,
  figures: [],
});

describe('Modello di lettura, normalizzazione fluido-text/2', () => {
  it('normalizza spazi e legature preservando Unicode e UTF-16', () => {
    expect(normalizeText('  caﬀè\u00a0 e\u0300 \u00ad日本語 😀 ')).toBe('caffè è 日本語 😀');
  });
  it('ricostruisce righe, paragrafi, titoli e sillabazione', () => {
    const model = buildReadingModel([
      page([
        run('Titolo', 80, 24),
        run('Una parola ripro-', 130),
        run('duzione e testo.', 146),
        run('Altro paragrafo.', 190),
      ]),
    ]);
    expect(model.pages[0]!.blocks.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
    ]);
    expect(model.pages[0]!.text).toBe(
      'Titolo\n\nUna parola riproduzione e testo.\n\nAltro paragrafo.',
    );
  });
  it('offset UTF-16 verificabili con slice, anche per emoji', () => {
    const p = buildReadingModel([
      page([run('Un testo 😀 con caratteri.', 120), run('Secondo.', 180)]),
    ]).pages[0]!;
    for (const b of p.blocks)
      if (b.kind !== 'figure') expect(p.text.slice(b.start, b.end)).toBe(b.text);
  });
  it('riordina run e inserisce lo spazio fra frammenti', () => {
    const p = buildReadingModel([
      page([run('mondo', 100, 12, 90, 50), run('Ciao', 100, 12, 40, 30)]),
    ]).pages[0]!;
    expect(p.text).toBe('Ciao mondo');
  });
  it('non fonde fra pagine né rimuove intestazioni non ripetute', () => {
    const model = buildReadingModel([
      page([run('Titolo singolo', 20), run('fine-', 100)]),
      page([run('Altro titolo', 20), run('inizio', 100)], 2),
    ]);
    expect(model.removedMarginalLines).toBe(0);
    expect(model.pages[0]!.text).toContain('fine-');
    expect(model.pages[1]!.text).toContain('inizio');
  });
  it('rimuove solo righe marginali ripetute, con numeri pagina variabili', () => {
    const model = buildReadingModel(
      [1, 2, 3].map((n) =>
        page([run('Manuale', 20), run('Corpo del documento.', 120), run(`Pagina ${n}`, 810)], n),
      ),
    );
    expect(model.removedMarginalLines).toBe(6);
    expect(model.pages.every((p) => p.text === 'Corpo del documento.')).toBe(true);
  });
  it('non rimuove testo ripetuto nel corpo', () => {
    const model = buildReadingModel([1, 2].map((n) => page([run('Corpo ripetuto.', 300)], n)));
    expect(model.removedMarginalLines).toBe(0);
  });
  it('segnala scansioni/pagine vuote e documenti misti', () => {
    expect(buildReadingModel([]).support).toBe('unsupported');
    expect(buildReadingModel([page([])]).support).toBe('unsupported');
    expect(buildReadingModel([page([run('Testo semplice.', 100)]), page([], 2)]).support).toBe(
      'partial',
    );
  });
  it('rileva colonne allineate senza dichiarare affidabile il testo', () => {
    const runs = [100, 120, 140, 160].flatMap((y) => [
      run('Testo sinistro lungo.', y, 12, 40, 150),
      run('Testo destro lungo.', y, 12, 340, 150),
    ]);
    const model = buildReadingModel([page(runs)]);
    expect(model.support).toBe('unsupported');
    expect(model.pages[0]!.warnings.join(' ')).toContain('multi-colonna');
  });
  it('segnala testo verticale', () => {
    expect(buildReadingModel([page([{ ...run('Verticale', 100), vertical: true }])]).support).toBe(
      'unsupported',
    );
  });
  it('segnala testo RTL e grafica complessa invece di dichiarare layout semplice', () => {
    const p = page([{ ...run('Testo diagnostico.', 100), rtl: true }]);
    p.graphicWarnings = ['Grafica complessa.'];
    const model = buildReadingModel([p]);
    expect(model.support).toBe('unsupported');
    expect(model.pages[0]!.warnings.join(' ')).toContain('destra a sinistra');
    expect(model.pages[0]!.warnings.join(' ')).toContain('Grafica complessa');
  });
  it('rileva anche colonne con righe sfalsate', () => {
    const runs = [100, 120, 140, 160].flatMap((y) => [
      run('Testo sinistro lungo.', y, 12, 40, 150),
      run('Testo destro lungo.', y + 8, 12, 340, 150),
    ]);
    expect(buildReadingModel([page(runs)]).support).toBe('unsupported');
  });
  it('mantiene figure fra i blocchi, senza unire paragrafi attraverso una figura', () => {
    const p = page([run('Prima della figura.', 100), run('Dopo la figura.', 122)]);
    p.figures = [{ x: 40, y: 112, width: 100, height: 10 }];
    const model = buildReadingModel([p]);
    expect(model.pages[0]!.blocks.map((b) => b.kind)).toEqual(['paragraph', 'figure', 'paragraph']);
  });
  it('porta a fine pagina una figura sovrapposta al testo', () => {
    const p = page([run('Testo sopra la figura.', 100)]);
    p.figures = [{ x: 40, y: 90, width: 100, height: 100 }];
    expect(buildReadingModel([p]).pages[0]!.blocks.at(-1)).toMatchObject({
      kind: 'figure',
      placement: 'page-end',
    });
  });
});
describe('Geometrie delle figure', () => {
  it('trasforma i quattro angoli, incluse rotazioni e coordinate negative', () => {
    expect(transformedRect([0, 0, 100, 50], [0, 1, -1, 0, 60, 10])).toEqual({
      x: 10,
      y: 10,
      width: 50,
      height: 100,
    });
  });
  it('compone le trasformazioni nello stesso ordine di PDF.js', () => {
    expect(multiply([2, 0, 0, 2, 10, 20], [1, 0, 0, 1, 5, 5])).toEqual([2, 0, 0, 2, 20, 30]);
  });
  it('unisce componenti vicine e limita la regione alla pagina', () => {
    const result = mergeRegions(
      [
        { x: -10, y: 20, width: 40, height: 30 },
        { x: 25, y: 20, width: 40, height: 30 },
      ],
      595,
      842,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ x: 0, y: 18, width: 67, height: 34 });
  });
  it('esclude decorazioni minuscole e sfondi estesi', () => {
    expect(
      mergeRegions(
        [
          { x: 0, y: 0, width: 595, height: 842 },
          { x: 20, y: 20, width: 1, height: 1 },
        ],
        595,
        842,
      ),
    ).toEqual([]);
  });
});
