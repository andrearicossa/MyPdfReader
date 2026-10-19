import { union, type Rect } from '../core/reading-model';

export type Matrix = [number, number, number, number, number, number];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function transformedRect(rect: [number, number, number, number], m: Matrix): Rect {
  const points = [
    [rect[0], rect[1]],
    [rect[0], rect[3]],
    [rect[2], rect[1]],
    [rect[2], rect[3]],
  ].map(([x, y]) => [m[0] * x! + m[2] * y! + m[4], m[1] * x! + m[3] * y! + m[5]]);
  const xs = points.map((p) => p[0]!);
  const ys = points.map((p) => p[1]!);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
export function mergeRegions(regions: Rect[], width: number, height: number): Rect[] {
  const result: Rect[] = [];
  for (const candidate of regions) {
    const x = Math.max(0, candidate.x - 2);
    const y = Math.max(0, candidate.y - 2);
    const r = {
      x,
      y,
      width: Math.min(width, candidate.x + candidate.width + 2) - x,
      height: Math.min(height, candidate.y + candidate.height + 2) - y,
    };
    if (r.width < 10 || r.height < 10 || r.width * r.height > width * height * 0.85) continue;
    let merged = r;
    for (let i = result.length - 1; i >= 0; i--) {
      const b = result[i]!;
      if (
        merged.x <= b.x + b.width + 10 &&
        merged.x + merged.width + 10 >= b.x &&
        merged.y <= b.y + b.height + 10 &&
        merged.y + merged.height + 10 >= b.y
      ) {
        merged = union(merged, b);
        result.splice(i, 1);
      }
    }
    result.push(merged);
  }
  return result;
}
