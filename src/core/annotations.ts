import type { ReadingPage, TextBlock } from './reading-model';
import type { SpikeData } from './file-spike';

export const colors = ['yellow', 'green', 'blue', 'rose'] as const;
export type HighlightColor = (typeof colors)[number];
export const colorNames: Record<HighlightColor, string> = {
  yellow: 'Giallo',
  green: 'Verde',
  blue: 'Azzurro',
  rose: 'Rosa',
};
export type TextAnchor = {
  page: number;
  start: number;
  end: number;
  quote: string;
  prefix: string;
  suffix: string;
};
export type Annotation = {
  id: string;
  anchor: TextAnchor;
  color: HighlightColor;
  note: string;
  createdAt: string;
  updatedAt: string;
};
export type ReadingPosition = {
  page: number;
  offset: number;
  fraction?: number;
  figure?: string;
  anchor?: TextAnchor;
};
export type AnnotationData = {
  schema: 'fluido/annotations';
  version: 1;
  normalization: 'fluido-text/2';
  document: SpikeData['document'];
  revision: number;
  draftNote: string;
  annotations: Annotation[];
  position: ReadingPosition;
};
export function createAnnotations(document: SpikeData['document']): AnnotationData {
  return {
    schema: 'fluido/annotations',
    version: 1,
    normalization: 'fluido-text/2',
    document,
    revision: 0,
    draftNote: '',
    annotations: [],
    position: { page: 1, offset: 0 },
  };
}
export function makeAnchor(page: ReadingPage, start: number, end: number): TextAnchor {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end > page.text.length ||
    end - start > 20_000 ||
    !page.text.slice(start, end).trim()
  )
    throw new Error('Selezione non valida o troppo lunga (massimo 20.000 caratteri).');
  return {
    page: page.page,
    start,
    end,
    quote: page.text.slice(start, end),
    prefix: page.text.slice(Math.max(0, start - 48), start),
    suffix: page.text.slice(end, end + 48),
  };
}
export type ResolvedAnchor =
  | { status: 'exact' | 'relocated'; start: number; end: number }
  | { status: 'missing' | 'ambiguous' };
export function resolveAnchor(text: string, anchor: TextAnchor): ResolvedAnchor {
  if (text.slice(anchor.start, anchor.end) === anchor.quote)
    return { status: 'exact', start: anchor.start, end: anchor.end };
  const matches: number[] = [];
  for (let from = 0; from <= text.length - anchor.quote.length;) {
    const at = text.indexOf(anchor.quote, from);
    if (at < 0) break;
    matches.push(at);
    from = at + 1;
  }
  if (!matches.length) return { status: 'missing' };
  let candidates = matches;
  if (matches.length > 1) {
    candidates = matches.filter(
      (at) =>
        (anchor.prefix.length > 0 || anchor.suffix.length > 0) &&
        (!anchor.prefix ||
          text.slice(Math.max(0, at - anchor.prefix.length), at) === anchor.prefix) &&
        (!anchor.suffix ||
          text.slice(at + anchor.quote.length, at + anchor.quote.length + anchor.suffix.length) ===
            anchor.suffix),
    );
  }
  if (candidates.length !== 1) return { status: 'ambiguous' };
  return { status: 'relocated', start: candidates[0]!, end: candidates[0]! + anchor.quote.length };
}
export function textLeaves(page: ReadingPage): TextBlock[] {
  const walk = (b: TextBlock): TextBlock[] => (b.children ? b.children.flatMap(walk) : [b]);
  return page.blocks.flatMap((b) => (b.kind === 'figure' ? [] : walk(b)));
}

export function parseAnnotations(text: string, hash: string): AnnotationData {
  if (text.length > 10_000_000)
    throw new Error('JSON annotazioni troppo grande (limite 10 milioni di caratteri).');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('JSON annotazioni non valido.');
  }
  const object = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number =>
    Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
  const string = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
  const d = object(value),
    doc = object(d.document),
    pos = object(d.position);
  if (d.schema !== 'fluido/annotations' || d.version !== 1 || d.normalization !== 'fluido-text/2')
    throw new Error(
      'Schema annotazioni non supportato. I file sperimentali restano nella prova tecnica.',
    );
  if (
    !string(doc.sha256, 64) ||
    !/^[a-f0-9]{64}$/.test(doc.sha256) ||
    !string(doc.fileName, 1000) ||
    !integer(doc.size, 0) ||
    !integer(d.revision, 0) ||
    !string(d.draftNote, 100_000) ||
    !integer(pos.page, 1, 1_000_000) ||
    !integer(pos.offset, 0) ||
    (pos.fraction !== undefined &&
      (typeof pos.fraction !== 'number' ||
        !Number.isFinite(pos.fraction) ||
        pos.fraction < 0 ||
        pos.fraction > 1)) ||
    (pos.figure !== undefined && (!string(pos.figure, 100) || !/^p\d+-f\d+$/.test(pos.figure))) ||
    !Array.isArray(d.annotations) ||
    d.annotations.length > 10_000
  )
    throw new Error('Struttura del JSON annotazioni non valida.');
  if (doc.sha256 !== hash)
    throw new Error('Il JSON annotazioni appartiene a un PDF diverso (SHA-256).');
  const ids = new Set<string>();
  const annotations = d.annotations.map((raw: unknown): Annotation => {
    const a = object(raw),
      anchor = object(a.anchor);
    if (
      !string(a.id, 100) ||
      !a.id ||
      ids.has(a.id) ||
      !colors.includes(a.color as HighlightColor) ||
      !string(a.note, 100_000) ||
      !string(a.createdAt, 40) ||
      !Number.isFinite(Date.parse(a.createdAt)) ||
      !string(a.updatedAt, 40) ||
      !Number.isFinite(Date.parse(a.updatedAt)) ||
      !integer(anchor.page, 1, 1_000_000) ||
      !integer(anchor.start, 0) ||
      !integer(anchor.end, 1) ||
      Number(anchor.end) <= Number(anchor.start) ||
      !string(anchor.quote, 20_000) ||
      !anchor.quote.trim() ||
      anchor.quote.length !== Number(anchor.end) - Number(anchor.start) ||
      !string(anchor.prefix, 48) ||
      !string(anchor.suffix, 48)
    )
      throw new Error('Annotazione non valida: verifica ancore, identificativi e limiti.');
    ids.add(a.id);
    return {
      id: a.id,
      color: a.color as HighlightColor,
      note: a.note,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      anchor: {
        page: anchor.page,
        start: anchor.start,
        end: anchor.end,
        quote: anchor.quote,
        prefix: anchor.prefix,
        suffix: anchor.suffix,
      },
    };
  });
  let positionAnchor: TextAnchor | undefined;
  if (pos.anchor !== undefined) {
    const anchor = object(pos.anchor);
    if (
      anchor.page !== pos.page ||
      !integer(anchor.start, 0) ||
      !integer(anchor.end, 1) ||
      Number(anchor.end) <= Number(anchor.start) ||
      !string(anchor.quote, 20_000) ||
      !anchor.quote.trim() ||
      anchor.quote.length !== Number(anchor.end) - Number(anchor.start) ||
      !string(anchor.prefix, 48) ||
      !string(anchor.suffix, 48)
    )
      throw new Error('Ancora del punto di lettura non valida.');
    positionAnchor = {
      page: pos.page,
      start: anchor.start,
      end: anchor.end,
      quote: anchor.quote,
      prefix: anchor.prefix,
      suffix: anchor.suffix,
    };
  }
  return {
    schema: 'fluido/annotations',
    version: 1,
    normalization: 'fluido-text/2',
    document: { sha256: doc.sha256, fileName: doc.fileName, size: doc.size },
    revision: d.revision,
    draftNote: d.draftNote,
    annotations,
    position: {
      page: pos.page,
      offset: pos.offset,
      ...(pos.fraction === undefined ? {} : { fraction: pos.fraction as number }),
      ...(pos.figure ? { figure: pos.figure as string } : {}),
      ...(positionAnchor ? { anchor: positionAnchor } : {}),
    },
  };
}
export const serializeAnnotations = (data: AnnotationData) => JSON.stringify(data, null, 2) + '\n';
