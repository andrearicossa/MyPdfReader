/**
 * Corpus sintetico riproducibile, MIT. PDF reali con xref e stream non compressi.
 * Senza dipendenze di generazione; nessun documento o dato personale.
 */
export function makePdf(pages, { rotation = 0 } = {}) {
  const objects = [];
  const put = (n, value) => {
    objects[n] = Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1');
  };
  const stream = (header, text) => {
    const data = Buffer.isBuffer(text) ? text : Buffer.from(text, 'latin1');
    return Buffer.concat([
      Buffer.from(`<<${header} /Length ${data.length}>>\nstream\n`),
      data,
      Buffer.from('\nendstream'),
    ]);
  };
  put(1, '<</Type /Catalog /Pages 2 0 R>>');
  put(
    2,
    `<</Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}]>>`,
  );
  put(3, '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>');
  put(
    4,
    stream(
      '/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode',
      '01696f4f98a3edc982e5b96f>',
    ),
  );
  pages.forEach((content, i) => {
    put(
      5 + i * 2,
      `<</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Rotate ${rotation} /Resources <</Font <</F1 3 0 R>> /XObject <</Im1 4 0 R>>>> /Contents ${6 + i * 2} 0 R>>`,
    );
    put(6 + i * 2, stream('', content));
  });
  const parts = [Buffer.from('%PDF-1.7\n%Fluido\n')];
  const offsets = [0];
  let length = parts[0].length;
  for (let i = 1; i < objects.length; i++) {
    offsets.push(length);
    const part = Buffer.concat([
      Buffer.from(`${i} 0 obj\n`),
      objects[i],
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(part);
    length += part.length;
  }
  const xref = length;
  parts.push(
    Buffer.from(
      `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
        .join('')}trailer\n<</Size ${objects.length} /Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(parts);
}
export function text(value, x, y, size = 12) {
  const safe = value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  return `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${safe}) Tj ET\n`;
}
export function simplePdf() {
  return makePdf(
    [0, 1, 2].map(
      (i) =>
        text('Fluido | Documento di prova', 52, 810, 9) +
        text(`Pagina ${i + 1}`, 270, 24, 9) +
        text(i === 0 ? 'Il piacere della lettura' : `Capitolo ${i + 1}`, 52, 750, 24) +
        text('Questa pagina contiene un testo semplice e una parola ripro-', 52, 710) +
        text('duzione che prosegue nella riga successiva.', 52, 694) +
        text('Un nuovo paragrafo conserva il riferimento alla pagina originale.', 52, 654) +
        text('Il PDF originale rimane invariato.', 52, 638) +
        (i === 0
          ? 'q 210 0 0 110 52 450 cm /Im1 Do Q\n' +
            text('Figura 1. Colori del documento.', 52, 428, 10)
          : i === 1
            ? 'q 0.1 0.4 0.5 rg 52 450 210 110 re f Q\n' +
              text('Figura 2. Un disegno vettoriale.', 52, 428, 10)
            : ''),
    ),
  );
}
export function columnsPdf() {
  return makePdf([
    Array.from(
      { length: 7 },
      (_, i) =>
        text('Colonna sinistra con testo.', 40, 730 - i * 18) +
        text('Colonna destra separata.', 335, 730 - i * 18),
    ).join(''),
  ]);
}
export function scannedPdf() {
  return makePdf(['q 480 0 0 700 52 80 cm /Im1 Do Q\n']);
}
export function mixedPdf() {
  return makePdf([
    text('Pagina testuale semplice e leggibile.', 52, 700),
    'q 480 0 0 700 52 80 cm /Im1 Do Q\n',
  ]);
}

/** Composizione analoga allo screenshot dell'utente, non copia del documento. */
export function boxedQuotePdf({ segments = false, background = false, image = false } = {}) {
  const border = segments
    ? 'q 0 G 52 470 m 542 470 l S 542 470 m 542 690 l S 542 690 m 52 690 l S 52 690 m 52 470 l S Q\n'
    : `q ${background ? '0.94 g 52 470 490 220 re f' : '0 G 52 470 490 220 re S'} Q\n`;
  return makePdf([
    text('Box e citazioni', 52, 790, 24) +
      text('Il testo normale prima del box mantiene un margine ampio.', 52, 750) +
      text('La seconda riga appartiene allo stesso paragrafo del documento.', 52, 734) +
      border +
      text('Primo paragrafo nel box: il testo deve restare selezionabile.', 66, 660, 11) +
      text('Questa seconda riga non deve essere convertita in immagine.', 66, 644, 11) +
      text('Secondo paragrafo nel box con un riferimento distinto.', 66, 604, 11) +
      text('Il bordo non deve generare una figura duplicata.', 66, 588, 11) +
      (image ? 'q 120 0 0 60 320 500 cm /Im1 Do Q\n' : '') +
      text('Una citazione resta testo selezionabile e leggibile,', 78, 400, 11) +
      text('con rientro e attribuzione separati dal testo principale.', 78, 384, 11) +
      text('- Autrice di prova', 90, 358, 10) +
      text('Il testo normale dopo la citazione riprende il margine originale.', 52, 310) +
      text('Non devono comparire parole mancanti o righe duplicate.', 52, 294),
  ]);
}
