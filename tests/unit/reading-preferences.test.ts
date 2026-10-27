import { describe, it, expect } from 'vitest';
import {
  defaultPreferences,
  normalizePreferences,
  readingWindow,
} from '../../src/core/reading-preferences';

describe('preferenze globali e finestra fluida', () => {
  it('ha default validi e rifiuta valori assenti o strutture estranee', () => {
    for (const value of [null, undefined, 'text', [], { theme: 'unknown' }])
      expect(normalizePreferences(value)).toEqual(defaultPreferences);
  });
  it('limita tutti i valori numerici e rifiuta NaN/Infinity', () => {
    expect(
      normalizePreferences({ size: 500, lineHeight: 0, margin: 999, font: 'sans', theme: 'sepia' }),
    ).toEqual({
      size: 32,
      lineHeight: 1.3,
      margin: 48,
      font: 'sans',
      theme: 'sepia',
      notesOpen: true,
      indexOpen: false,
    });
    expect(normalizePreferences({ size: NaN, lineHeight: Infinity, margin: '24' })).toEqual(
      defaultPreferences,
    );
    expect(normalizePreferences({ size: 10, lineHeight: 9, margin: -5 })).toMatchObject({
      size: 14,
      lineHeight: 2.2,
      margin: 8,
    });
  });
  it('conserva indexOpen retrocompatibile e rifiuta valori non booleani', () => {
    expect(normalizePreferences({ indexOpen: true })).toMatchObject({ indexOpen: true });
    expect(normalizePreferences({ indexOpen: 1 })).toMatchObject({ indexOpen: false });
    expect(normalizePreferences({})).toMatchObject({ indexOpen: false, notesOpen: true });
  });
  it('non modifica i dati ricevuti e arrotonda il modello', () => {
    const original = { size: 21.4, lineHeight: 1.87, margin: 21.8 };
    expect(normalizePreferences(original)).toMatchObject({ size: 21, lineHeight: 1.9, margin: 22 });
    expect(original.size).toBe(21.4);
  });
  it('limita il DOM a cinque pagine, ordinando e senza duplicati', () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({ page: i + 1 }));
    const next = readingWindow(pages, { page: 6 }, 'next');
    expect(next.map((p) => p.page)).toEqual([2, 3, 4, 5, 6]);
    expect(readingWindow(next, { page: 1 }, 'previous').map((p) => p.page)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(readingWindow(pages, { page: 3 }, 'next')).toHaveLength(5);
    expect(pages[0]!.page).toBe(1);
  });
});
