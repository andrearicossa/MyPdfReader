// Risorse della stessa versione del worker: nessuna CDN o richiesta esterna.
import { cp, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('public/pdfjs/', root), { recursive: true });
for (const name of ['cmaps', 'standard_fonts', 'wasm', 'iccs', 'LICENSE']) {
  await cp(
    new URL(`node_modules/pdfjs-dist/${name}`, root),
    new URL(`public/pdfjs/${name}`, root),
    { recursive: true },
  );
}
