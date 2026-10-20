import type { Rect } from '../core/reading-model';
import { transformedRect, type Matrix } from './figures';

/** DrawOPS di PDF.js 5.4.624: move=0, line=1, close=4.
 * Accetta solo un rettangolo assiale chiuso, non una curva con bounding box rettangolare.
 */
export function rectanglePath(data: unknown, matrix: Matrix): Rect | undefined {
  if (!data || (!Array.isArray(data) && !ArrayBuffer.isView(data))) return;
  const p = Array.from(data as ArrayLike<number>);
  if (p.length !== 13 || p[0] !== 0 || p[3] !== 1 || p[6] !== 1 || p[9] !== 1 || p[12] !== 4)
    return;
  const xs = [p[1]!, p[4]!, p[7]!, p[10]!],
    ys = [p[2]!, p[5]!, p[8]!, p[11]!];
  if (new Set(xs).size !== 2 || new Set(ys).size !== 2) return;
  for (let i = 0; i < 4; i++) if (xs[i] !== xs[(i + 1) % 4] && ys[i] !== ys[(i + 1) % 4]) return;
  if (!(
    (Math.abs(matrix[1]) < 0.01 && Math.abs(matrix[2]) < 0.01) ||
    (Math.abs(matrix[0]) < 0.01 && Math.abs(matrix[3]) < 0.01)
  ))
    return;
  return transformedRect(
    [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    matrix,
  );
}
export function segmentFrames(segments: Rect[]): Rect[] {
  const horizontals = segments.filter((r) => r.height < 1 && r.width > 40);
  const verticals = segments.filter((r) => r.width < 1 && r.height > 30);
  const frames: Rect[] = [];
  // Non tenta di ricostruire tabelle o migliaia di segmenti decorativi.
  if (horizontals.length + verticals.length > 300) return frames;
  for (let i = 0; i < horizontals.length; i++)
    for (let j = i + 1; j < horizontals.length; j++) {
      const a = horizontals[i]!,
        b = horizontals[j]!;
      if (Math.abs(a.x - b.x) > 2 || Math.abs(a.width - b.width) > 2 || Math.abs(a.y - b.y) < 30)
        continue;
      const top = Math.min(a.y, b.y),
        bottom = Math.max(a.y, b.y);
      const side = (x: number) =>
        verticals.some(
          (v) =>
            Math.abs(v.x - x) < 2 &&
            Math.abs(v.y - top) < 2 &&
            Math.abs(v.y + v.height - bottom) < 2,
        );
      if (side(a.x) && side(a.x + a.width))
        frames.push({ x: a.x, y: top, width: a.width, height: bottom - top });
    }
  return frames;
}
