/** Coordinate in punti PDF: viewport PDF.js a scala 1, rotazione della pagina applicata.
 * Origine in alto a sinistra; offset UTF-16 nel testo normalizzato della singola pagina.
 * Le annotazioni usano questi offset insieme a citazione e contesto (core/annotations).
 */
import { inside, group, groupQuotes, assignOffsets } from './text-groups';
export type Rect = { x: number; y: number; width: number; height: number };
export type TextRun = Rect & { text: string; fontSize: number; vertical?: boolean; rtl?: boolean };
export type RawPage = {
  page: number;
  width: number;
  height: number;
  rotation: number;
  runs: TextRun[];
  figures: Rect[];
  frames?: Rect[];
  images?: Rect[];
  graphicWarnings?: string[];
};
export type TextBlock = {
  kind: 'paragraph' | 'heading' | 'box' | 'quote';
  id: string;
  page: number;
  text: string;
  start: number;
  end: number;
  rects: Rect[];
  children?: TextBlock[];
  attributionId?: string;
};
export type FigureBlock = {
  kind: 'figure';
  id: string;
  page: number;
  region: Rect;
  placement: 'flow' | 'page-end';
};
export type ReadingPage = {
  page: number;
  width: number;
  height: number;
  rotation: number;
  text: string;
  blocks: (TextBlock | FigureBlock)[];
  warnings: string[];
  supported: boolean;
};
export type ReadingModel = {
  normalization: 'fluido-text/2';
  pages: ReadingPage[];
  support: 'simple' | 'partial' | 'unsupported';
  removedMarginalLines: number;
};

type Line = Rect & { text: string; fontSize: number; runs: TextRun[] };
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 12;
};

export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/[ﬀﬁﬂﬃﬄ]/g, (c) => ({ ﬀ: 'ff', ﬁ: 'fi', ﬂ: 'fl', ﬃ: 'ffi', ﬄ: 'ffl' })[c]!)
    .replace(/[\u00ad\u200b]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function linesOf(page: RawPage): Line[] {
  const lines: Line[] = [];
  for (const run of [...page.runs].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (!normalizeText(run.text)) continue;
    const line = lines.find((line) => Math.abs(line.y - run.y) < Math.max(2, run.fontSize * 0.35));
    if (line) {
      Object.assign(line, union(line, run));
      line.runs.push(run);
    } else lines.push({ ...run, runs: [run] });
  }
  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);
    let text = '';
    let end = line.x;
    for (const run of line.runs) {
      text += (text && run.x - end > run.fontSize * 0.12 ? ' ' : '') + run.text;
      end = run.x + run.width;
    }
    line.text = normalizeText(text);
    line.fontSize = median(line.runs.map((run) => run.fontSize));
  }
  return lines.sort((a, b) => a.y - b.y);
}

function marginalKey(line: Line, page: RawPage): string | undefined {
  const zone = line.y < page.height * 0.08 ? 'top' : line.y > page.height * 0.92 ? 'bottom' : '';
  if (!zone || line.text.length > 160) return;
  return `${zone}:${line.text.toLowerCase().replace(/\d+/g, '#')}`;
}

function hasColumns(lines: Line[], pageWidth: number): boolean {
  let splitRows = 0;
  for (const line of lines) {
    let left = '';
    for (let i = 0; i < line.runs.length - 1; i++) {
      const run = line.runs[i]!;
      const next = line.runs[i + 1]!;
      left += run.text;
      const right = line.runs
        .slice(i + 1)
        .map((r) => r.text)
        .join('');
      if (
        next.x - run.x - run.width > Math.max(40, line.fontSize * 3) &&
        left.trim().length >= 12 &&
        right.trim().length >= 12
      ) {
        splitRows++;
        break;
      }
    }
  }
  if (splitRows >= 3 && splitRows >= lines.length * 0.25) return true;
  const left = lines.filter((l) => l.x < pageWidth * 0.35 && l.x + l.width < pageWidth * 0.53);
  const right = lines.filter((l) => l.x > pageWidth * 0.48);
  if (left.length < 3 || right.length < 3) return false;
  const leftEnd = Math.max(...left.map((l) => l.x + l.width));
  const rightStart = Math.min(...right.map((l) => l.x));
  const overlap =
    Math.min(Math.max(...left.map((l) => l.y)), Math.max(...right.map((l) => l.y))) -
    Math.max(Math.min(...left.map((l) => l.y)), Math.min(...right.map((l) => l.y)));
  return rightStart - leftEnd > 40 && overlap > 24;
}

export function buildReadingModel(rawPages: RawPage[]): ReadingModel {
  const allLines = rawPages.map(linesOf);
  const repeats = new Map<string, Set<number>>();
  rawPages.forEach((page, index) => {
    for (const line of allLines[index]!) {
      const key = marginalKey(line, page);
      if (key) {
        if (!repeats.has(key)) repeats.set(key, new Set());
        repeats.get(key)!.add(page.page);
      }
    }
  });
  let removedMarginalLines = 0;
  const pages = rawPages.map((page, index): ReadingPage => {
    const original = allLines[index]!;
    const lines = original.filter((line) => {
      const key = marginalKey(line, page);
      const count = key ? (repeats.get(key)?.size ?? 0) : 0;
      const remove = count >= 2 && count >= rawPages.length * 0.6;
      if (remove) removedMarginalLines++;
      return !remove;
    });
    const warnings: string[] = [...(page.graphicWarnings ?? [])];
    if (!original.length)
      warnings.push(
        'Pagina senza testo estraibile: possibile scansione o pagina vuota. OCR non disponibile.',
      );
    if (hasColumns(lines, page.width))
      warnings.push('Possibile layout multi-colonna o tabella: ordine di lettura non affidabile.');
    if (page.runs.some((run) => run.vertical))
      warnings.push('Testo verticale o ruotato: ricostruzione non supportata.');
    if (page.runs.some((run) => run.rtl))
      warnings.push('Testo da destra a sinistra: ordine di lettura non supportato.');
    const frames: Rect[] = [];
    if (!warnings.length)
      for (const frame of page.frames ?? []) {
        const contained = lines.filter((l) => inside(l, frame));
        if (
          contained.length >= 2 &&
          (page.images ?? []).some(
            (image) =>
              image.x < frame.x + frame.width &&
              image.x + image.width > frame.x &&
              image.y < frame.y + frame.height &&
              image.y + image.height > frame.y,
          )
        ) {
          warnings.push('Box con immagini: raggruppamento non supportato. Consulta l’originale.');
          continue;
        }
        if (
          contained.length < 2 ||
          frame.width * frame.height > page.width * page.height * 0.75 ||
          contained.some((l) => l.x - frame.x < 2 || frame.x + frame.width - l.x - l.width < 2) ||
          (page.images ?? []).some(
            (image) =>
              image.x < frame.x + frame.width &&
              image.x + image.width > frame.x &&
              image.y < frame.y + frame.height &&
              image.y + image.height > frame.y,
          ) ||
          hasColumns(contained, page.width)
        )
          continue;
        if (frames.some((f) => inside(f, frame, 3) && inside(frame, f, 3))) continue;
        if (
          frames.some(
            (f) =>
              f.x < frame.x + frame.width &&
              f.x + f.width > frame.x &&
              f.y < frame.y + frame.height &&
              f.y + f.height > frame.y,
          )
        ) {
          warnings.push('Box sovrapposti: raggruppamento incerto. Verifica l’originale.');
          continue;
        }
        frames.push(frame);
      }
    const owner = (line: Line) => frames.find((f) => inside(line, f));
    const outside = lines.filter((l) => !owner(l));
    const bodySize = median(
      (outside.length ? outside : lines)
        .filter((line) => line.text.length > 25)
        .map((line) => line.fontSize),
    );
    const paragraphs: TextBlock[] = [];
    const owners = new Map<TextBlock, Rect | undefined>();
    const figures = page.figures.filter(
      (r) => !frames.some((frame) => inside(r, frame, 5) && inside(frame, r, 5)),
    );
    if (figures.some((region) => lines.filter((line) => inside(line, region, 3)).length >= 2))
      warnings.push('Regione grafica con testo: separazione incerta. Confronta con l’originale.');
    let previous: Line | undefined;
    let current: TextBlock | undefined;
    let previousOwner: Rect | undefined;
    for (const line of lines) {
      const kind = line.fontSize >= bodySize * 1.3 ? 'heading' : 'paragraph';
      const gap = previous ? line.y - previous.y - previous.height : Infinity;
      const previousBottom = previous ? previous.y + previous.height : -Infinity;
      const figureBetween =
        previous && figures.some((r) => r.y >= previousBottom && r.y + r.height <= line.y);
      const lineOwner = owner(line);
      const newBlock =
        !current ||
        lineOwner !== previousOwner ||
        current.kind !== kind ||
        kind === 'heading' ||
        gap > line.fontSize * 0.9 ||
        figureBetween ||
        Math.abs(line.x - (previous?.x ?? line.x)) > line.fontSize * 1.5;
      if (newBlock) {
        current = {
          kind,
          id: `p${page.page}-b${paragraphs.length + 1}`,
          page: page.page,
          text: line.text,
          start: 0,
          end: 0,
          rects: [line],
        };
        paragraphs.push(current);
        owners.set(current, lineOwner);
      } else {
        const dehyphenate = /\p{L}-$/u.test(current!.text) && /^\p{Ll}/u.test(line.text);
        current!.text = dehyphenate
          ? current!.text.slice(0, -1) + line.text
          : `${current!.text} ${line.text}`;
        current!.rects.push({ x: line.x, y: line.y, width: line.width, height: line.height });
      }
      previous = line;
      previousOwner = lineOwner;
    }
    for (const block of paragraphs) {
      block.rects = block.rects.map(({ x, y, width, height }) => ({ x, y, width, height }));
    }
    const grouped: TextBlock[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i]!;
      const frame = owners.get(paragraph);
      if (!frame) {
        grouped.push(paragraph);
        continue;
      }
      const children = [paragraph];
      while (i + 1 < paragraphs.length && owners.get(paragraphs[i + 1]!) === frame)
        children.push(paragraphs[++i]!);
      grouped.push(group('box', children));
    }
    const blocks: (TextBlock | FigureBlock)[] = warnings.length
      ? grouped
      : groupQuotes(grouped, bodySize);
    let text = '';
    for (const block of blocks as TextBlock[]) {
      if (text) text += '\n\n';
      assignOffsets(block, text.length);
      text += block.text;
    }
    for (const [i, region] of figures.entries()) {
      const overlaps = lines.some(
        (l) =>
          l.x < region.x + region.width &&
          l.x + l.width > region.x &&
          l.y < region.y + region.height &&
          l.y + l.height > region.y,
      );
      blocks.push({
        kind: 'figure',
        id: `p${page.page}-f${i + 1}`,
        page: page.page,
        region,
        placement: overlaps ? 'page-end' : 'flow',
      });
    }
    const yOf = (b: TextBlock | FigureBlock) =>
      b.kind === 'figure' ? (b.placement === 'page-end' ? Infinity : b.region.y) : b.rects[0]!.y;
    blocks.sort((a, b) => yOf(a) - yOf(b));
    return {
      page: page.page,
      width: page.width,
      height: page.height,
      rotation: page.rotation,
      text,
      blocks,
      warnings,
      supported: warnings.length === 0,
    };
  });
  const supported = pages.filter((page) => page.supported).length;
  return {
    normalization: 'fluido-text/2',
    pages,
    removedMarginalLines,
    support:
      pages.length && supported === pages.length ? 'simple' : supported ? 'partial' : 'unsupported',
  };
}
