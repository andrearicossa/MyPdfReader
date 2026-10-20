import type { Rect, TextBlock } from './reading-model';

export function inside(inner: Rect, outer: Rect, tolerance = 2): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}
export function bounds(block: TextBlock): Rect {
  const x = Math.min(...block.rects.map((r) => r.x)),
    y = Math.min(...block.rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...block.rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...block.rects.map((r) => r.y + r.height)) - y,
  };
}
export function group(kind: 'box' | 'quote', children: TextBlock[]): TextBlock {
  return {
    kind,
    id: `${children[0]!.id}-${kind}`,
    page: children[0]!.page,
    children,
    text: children.map((c) => c.text).join('\n\n'),
    start: 0,
    end: 0,
    rects: children.flatMap((c) => c.rects),
  };
}

/** Quotazioni geometriche, non classificazione semantica. Non riconosce un autore
 * dal nome: l'attribuzione richiede un marcatore esplicito e un contesto citazione.
 */
export function groupQuotes(blocks: TextBlock[], bodySize: number): TextBlock[] {
  const plain = blocks.filter((b) => b.kind === 'paragraph');
  const long = plain.filter((b) => b.text.length > 25);
  if (long.length < 2) return blocks;
  const left = Math.min(...long.map((b) => bounds(b).x));
  const right = Math.max(...long.map((b) => bounds(b).x + bounds(b).width));
  const attribution = (b: TextBlock) =>
    /^[-–—]\s+\S|^(?:Fonte|Source|Da|From|Autore|Author)\s*:/iu.test(b.text);
  const candidate = (b: TextBlock) => {
    if (b.kind !== 'paragraph' || /^(?:[-•*]\s|\d+[.)]\s|[a-z][.)]\s)/iu.test(b.text)) return false;
    const r = bounds(b);
    const inset = r.x - left;
    const quotation = /^[“"«‘]/u.test(b.text);
    return (
      inset >= bodySize * 0.7 &&
      (quotation || (b.rects.length >= 2 && r.x + r.width <= right - bodySize * 0.7))
    );
  };
  const result: TextBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (!candidate(b)) {
      result.push(b);
      continue;
    }
    const children = [b];
    let last = bounds(b);
    while (i + 1 < blocks.length) {
      const next = blocks[i + 1]!;
      const r = bounds(next);
      if (next.kind !== 'paragraph' || r.y - last.y - last.height > bodySize * 2.8) break;
      if (attribution(next) && r.x >= left + bodySize * 0.5) {
        children.push(next);
        i++;
        break;
      }
      if (!candidate(next) || Math.abs(r.x - bounds(b).x) > bodySize) break;
      children.push(next);
      last = r;
      i++;
    }
    const quote = group('quote', children);
    if (children.length > 1 && attribution(children.at(-1)!))
      quote.attributionId = children.at(-1)!.id;
    result.push(quote);
  }
  return result;
}

export function assignOffsets(block: TextBlock, start: number): void {
  block.start = start;
  block.end = start + block.text.length;
  let offset = start;
  for (const child of block.children ?? []) {
    assignOffsets(child, offset);
    offset = child.end + 2;
  }
}
