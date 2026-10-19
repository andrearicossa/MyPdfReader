import { mkdir, writeFile } from 'node:fs/promises';
import {
  simplePdf,
  columnsPdf,
  scannedPdf,
  mixedPdf,
  makePdf,
  text,
} from '../tests/fixtures/pdf-corpus.mjs';
const dest = new URL('../tests/fixtures/corpus/', import.meta.url);
await mkdir(dest, { recursive: true });
for (const [name, bytes] of Object.entries({
  semplice: simplePdf(),
  colonne: columnsPdf(),
  scansione: scannedPdf(),
  misto: mixedPdf(),
  ruotato: makePdf([text('Testo con rotazione di pagina.', 52, 700)], { rotation: 90 }),
  corrotto: Buffer.from('%PDF-1.7\nfile incompleto\n%%EOF\n'),
}))
  await writeFile(new URL(`${name}.pdf`, dest), bytes);
