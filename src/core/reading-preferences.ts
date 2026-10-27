export type ReadingPreferences = {
  theme: 'light' | 'dark' | 'sepia';
  font: 'serif' | 'sans';
  size: number;
  lineHeight: number;
  margin: number;
  notesOpen: boolean;
  indexOpen: boolean;
};
export const defaultPreferences: ReadingPreferences = {
  theme: 'light',
  font: 'serif',
  size: 20,
  lineHeight: 1.7,
  margin: 24,
  notesOpen: true,
  indexOpen: false,
};
export function normalizePreferences(value: unknown): ReadingPreferences {
  const v = value && typeof value === 'object' ? (value as Partial<ReadingPreferences>) : {};
  const bounded = (n: unknown, fallback: number, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  return {
    theme: v.theme === 'dark' || v.theme === 'sepia' ? v.theme : 'light',
    font: v.font === 'sans' ? 'sans' : 'serif',
    size: Math.round(bounded(v.size, 20, 14, 32)),
    lineHeight: Math.round(bounded(v.lineHeight, 1.7, 1.3, 2.2) * 10) / 10,
    margin: Math.round(bounded(v.margin, 24, 8, 48)),
    notesOpen: typeof v.notesOpen === 'boolean' ? v.notesOpen : true,
    indexOpen: typeof v.indexOpen === 'boolean' ? v.indexOpen : false,
  };
}
export function readingWindow<T extends { page: number }>(
  pages: T[],
  next: T,
  direction: 'next' | 'previous',
): T[] {
  const ordered = [...pages.filter((p) => p.page !== next.page), next].sort(
    (a, b) => a.page - b.page,
  );
  return direction === 'next' ? ordered.slice(-5) : ordered.slice(0, 5);
}
