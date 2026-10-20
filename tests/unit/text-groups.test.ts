import { describe, it, expect } from 'vitest';
import {
  buildReadingModel,
  type RawPage,
  type TextRun,
  type TextBlock,
} from '../../src/core/reading-model';
import { rectanglePath, segmentFrames } from '../../src/pdf/frames';
const run = (text: string, y: number, x = 40, width = 400, fontSize = 12): TextRun => ({
  text,
  y,
  x,
  width,
  height: fontSize,
  fontSize,
});
const raw = (runs: TextRun[]): RawPage => ({
  page: 1,
  width: 595,
  height: 842,
  rotation: 0,
  runs,
  figures: [],
});
const body = (y: number) => run('Un paragrafo normale lungo che fissa i margini del documento.', y);
function checkOffsets(block: TextBlock, text: string) {
  expect(text.slice(block.start, block.end)).toBe(block.text);
  for (const child of block.children ?? []) checkOffsets(child, text);
}
describe('Box e citazioni', () => {
  it('box multi-paragrafo: testo una sola volta, ordine e offset di gruppo/figli', () => {
    const p = raw([
      body(100),
      run('Un testo nel box con emoji 😀 e caffè.', 180, 60, 400),
      run('Una riga di continuazione.', 196, 60, 400),
      run('Secondo paragrafo del box.', 260, 60, 400),
      run('Ancora testo.', 276, 60, 400),
      body(500),
    ]);
    p.frames = [{ x: 40, y: 150, width: 450, height: 200 }];
    p.figures = [...p.frames];
    const page = buildReadingModel([p]).pages[0]!;
    expect(page.blocks.map((b) => b.kind)).toEqual(['paragraph', 'box', 'paragraph']);
    const box = page.blocks[1] as TextBlock;
    expect(box.children).toHaveLength(2);
    expect(page.text.match(/emoji/g)).toHaveLength(1);
    for (const b of page.blocks) if (b.kind !== 'figure') checkOffsets(b, page.text);
  });
  it('citazione rientrata con attribuzione: gruppo e testo conservati', () => {
    const page = buildReadingModel([
      raw([
        body(100),
        run('Una citazione lunga rientrata.', 200, 70, 300, 11),
        run('Il testo continua nella riga seguente.', 216, 70, 300, 11),
        run('- Autrice di prova', 260, 90, 120, 10),
        body(400),
      ]),
    ]).pages[0]!;
    const quote = page.blocks[1] as TextBlock;
    expect(quote.kind).toBe('quote');
    expect(quote.children).toHaveLength(2);
    expect(quote.attributionId).toBe(quote.children![1]!.id);
    checkOffsets(quote, page.text);
  });
  it('non trasforma in citazione un rientro di prima riga o una lista', () => {
    const page = buildReadingModel([
      raw([
        body(70),
        run('Prima riga con rientro semplice.', 120, 60, 350),
        run('Seconda riga a margine.', 136),
        run('1. Elemento di una lista lunga.', 220, 70, 300, 11),
        run('Continuazione della lista.', 236, 70, 300, 11),
        body(400),
      ]),
    ]).pages[0]!;
    expect(page.blocks.some((b) => b.kind === 'quote')).toBe(false);
  });
  it('non sopprime immagini vere contenute in un rettangolo', () => {
    const p = raw([
      body(100),
      run('Testo nel riquadro.', 180, 60, 300),
      run('Altra riga del testo.', 196, 60, 300),
      body(500),
    ]);
    p.frames = [{ x: 40, y: 150, width: 450, height: 200 }];
    p.figures = [...p.frames];
    p.images = [{ x: 100, y: 260, width: 100, height: 60 }];
    const page = buildReadingModel([p]).pages[0]!;
    expect(page.blocks.some((b) => b.kind === 'box')).toBe(false);
    expect(page.blocks.some((b) => b.kind === 'figure')).toBe(true);
    expect(page.supported).toBe(false);
    expect(page.warnings.join(' ')).toContain('Box con immagini');
  });
  it('un rettangolo vuoto resta figura, non diventa box', () => {
    const p = raw([body(100), body(500)]);
    p.frames = [{ x: 40, y: 200, width: 200, height: 100 }];
    p.figures = [...p.frames];
    const page = buildReadingModel([p]).pages[0]!;
    expect(page.blocks.map((b) => b.kind)).toEqual(['paragraph', 'figure', 'paragraph']);
  });
  it('non cancella il testo di una tabella in un riquadro', () => {
    const p = raw(
      [100, 120, 140, 160].flatMap((y) => [
        run('Colonna sinistra lunga.', y, 40, 150),
        run('Colonna destra lunga.', y, 340, 150),
      ]),
    );
    p.frames = [{ x: 30, y: 80, width: 480, height: 120 }];
    p.figures = [...p.frames];
    const page = buildReadingModel([p]).pages[0]!;
    expect(page.supported).toBe(false);
    expect(page.text).toContain('Colonna sinistra');
    expect(page.blocks.some((b) => b.kind === 'box')).toBe(false);
  });
});
describe('Rilevamento rettangoli da operatori', () => {
  const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  it('rettangolo chiuso trasformato, con ordine diverso dei vertici', () => {
    const path = new Float32Array([0, 10, 20, 1, 110, 20, 1, 110, 70, 1, 10, 70, 4]);
    expect(rectanglePath(path, identity)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });
  it('una curva o una figura obliqua non è un box', () => {
    expect(rectanglePath([0, 10, 20, 2, 20, 20, 40, 40, 50, 70, 4], identity)).toBeUndefined();
    expect(rectanglePath([0, 0, 0, 1, 50, 0, 1, 100, 50, 1, 50, 50, 4], identity)).toBeUndefined();
  });
  it('assembla quattro segmenti ma non un bordo mancante', () => {
    const segments = [
      { x: 10, y: 20, width: 100, height: 0 },
      { x: 10, y: 90, width: 100, height: 0 },
      { x: 10, y: 20, width: 0, height: 70 },
      { x: 110, y: 20, width: 0, height: 70 },
    ];
    expect(segmentFrames(segments)).toEqual([{ x: 10, y: 20, width: 100, height: 70 }]);
    expect(segmentFrames(segments.slice(0, 3))).toEqual([]);
  });
});
