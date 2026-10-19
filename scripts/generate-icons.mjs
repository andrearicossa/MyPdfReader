/**
 * Genera le icone PNG della PWA in public/icons/ senza dipendenze esterne.
 *
 * Design: quadrato petrolio con angoli arrotondati, pagina chiara e righe di testo.
 * Le icone maskable hanno sfondo a tutto campo e glifo ridotto nella zona sicura.
 *
 * Uso: node scripts/generate-icons.mjs (oppure: npm run icons)
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, '../public/icons');

const BG = hex('#01696f');
const PAGE = hex('#f9f8f4');
const LINE = hex('#01696f');

/* ---------- Scrittura PNG (RGBA 8 bit) ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondità bit
  ihdr[9] = 6; // colore RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro nessuno
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- Disegno con distanze con segno (bordi lisci) ---------- */

function hex(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}

/** Distanza con segno da un rettangolo con angoli arrotondati. */
function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - r;
}

/** Copertura 0..1 di una forma descritta dalla sua distanza con segno. */
function coverage(d) {
  return Math.min(1, Math.max(0, 0.5 - d));
}

function drawIcon(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const glyphScale = maskable ? 0.62 : 1; // glifo ridotto nella zona sicura maskable
  const bgRadius = maskable ? 0 : size * 0.22;

  const pageHw = size * 0.172 * glyphScale;
  const pageHh = size * 0.234 * glyphScale;
  const pageR = size * 0.03 * glyphScale;
  const pageCx = size / 2;
  const pageCy = size / 2;

  const lines = [
    { hw: size * 0.108, y: -size * 0.108 },
    { hw: size * 0.122, y: -size * 0.038 },
    { hw: size * 0.122, y: size * 0.032 },
    { hw: size * 0.082, y: size * 0.102 },
  ];
  const lineH = size * 0.021 * glyphScale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Sfondo: pieno campo per maskable, quadrato arrotondato altrimenti.
      const bgD = maskable
        ? -1
        : sdRoundRect(x + 0.5, y + 0.5, size / 2, size / 2, size / 2, size / 2, bgRadius);
      const bgA = coverage(bgD);

      // Pagina.
      const pageD = sdRoundRect(x + 0.5, y + 0.5, pageCx, pageCy, pageHw, pageHh, pageR);
      const pageA = coverage(pageD);

      // Righe di testo (solo dove c'è la pagina).
      let lineA = 0;
      for (const l of lines) {
        const d = sdRoundRect(
          x + 0.5,
          y + 0.5,
          pageCx,
          pageCy + l.y * glyphScale,
          l.hw * glyphScale,
          lineH / 2,
          lineH / 2,
        );
        lineA = Math.max(lineA, coverage(d));
      }
      lineA *= pageA;

      // Composizione: sfondo -> pagina -> righe.
      let r = BG[0];
      let g = BG[1];
      let b = BG[2];
      let a = bgA;

      r = r + (PAGE[0] - r) * pageA;
      g = g + (PAGE[1] - g) * pageA;
      b = b + (PAGE[2] - b) * pageA;
      a = a + (1 - a) * pageA;

      r = r + (LINE[0] - r) * lineA;
      g = g + (LINE[1] - g) * lineA;
      b = b + (LINE[2] - b) * lineA;

      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return rgba;
}

function writeIcon(name, size, options) {
  const data = png(size, size, drawIcon(size, options));
  const path = join(outDir, name);
  writeFileSync(path, data);
  console.log(`creata ${path} (${data.length} byte)`);
}

mkdirSync(outDir, { recursive: true });

writeIcon('icon-192.png', 192, {});
writeIcon('icon-512.png', 512, {});
writeIcon('icon-maskable-192.png', 192, { maskable: true });
writeIcon('icon-maskable-512.png', 512, { maskable: true });
writeIcon('apple-touch-icon.png', 180, { maskable: true });
