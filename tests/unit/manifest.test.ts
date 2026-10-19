import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../../public');

type ManifestIcon = { src: string; sizes: string; purpose?: string };
type Manifest = {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  lang: string;
  icons: ManifestIcon[];
};

/** Legge larghezza e altezza dichiarate nell'IHDR di un PNG. */
function pngSize(buffer: Buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('Manifest PWA (Fase 0, AC-32)', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(publicDir, 'manifest.webmanifest'), 'utf-8'),
  ) as Manifest;

  it("dichiara i campi obbligatori per l'installazione", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('it');
  });

  it('dichiara icone esistenti, con dimensioni corrette e purpose maskable', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
    const purposes = manifest.icons.map((icon) => icon.purpose ?? 'any');
    expect(purposes).toContain('maskable');

    for (const icon of manifest.icons) {
      const path = resolve(publicDir, icon.src.replace(/^\//, ''));
      expect(existsSync(path), `icona mancante: ${icon.src}`).toBe(true);
      const { width, height } = pngSize(readFileSync(path));
      expect([width, height], `dimensioni di ${icon.src}`).toEqual(
        icon.sizes.split('x').map(Number),
      );
    }
  });

  it("collega l'icona Apple Touch esistente", () => {
    const html = readFileSync(resolve(here, '../../index.html'), 'utf-8');
    const match = html.match(/apple-touch-icon" href="([^"]+)"/);
    if (!match) throw new Error('apple-touch-icon non trovata in index.html');
    expect(existsSync(resolve(publicDir, match[1]!.replace(/^\//, '')))).toBe(true);
  });
});
