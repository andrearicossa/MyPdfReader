import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  simplePdf,
  columnsPdf,
  scannedPdf,
  mixedPdf,
  makePdf,
  text,
} from '../fixtures/pdf-corpus.mjs';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});
const upload = (buffer: Buffer, name = 'corpus.pdf') => ({
  name,
  mimeType: 'application/pdf',
  buffer,
});

test('worker reale: testo, paragrafi, titoli, margini e ritagli raster/vettore', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.getByTestId('input-pdf').setInputFiles(upload(simplePdf()));
  await expect(page.getByTestId('engine-status')).toContainText('Layout semplice rilevato.');
  await expect(page.getByTestId('engine-status')).toContainText('1 pagina in cache');
  await expect(page.getByTestId('engine-content').getByRole('heading')).toHaveText(
    'Il piacere della lettura',
  );
  await expect(page.getByTestId('engine-content')).toContainText('riproduzione');
  await expect(page.getByTestId('engine-content').locator('p[data-block-id]')).toHaveText([
    'Fluido | Documento di prova',
    'Questa pagina contiene un testo semplice e una parola riproduzione che prosegue nella riga successiva.',
    'Un nuovo paragrafo conserva il riferimento alla pagina originale. Il PDF originale rimane invariato.',
    'Figura 1. Colori del documento.',
    'Pagina 1',
  ]);
  const figures = page.getByTestId('engine-figure');
  await expect(figures).toHaveCount(1);
  await expect(figures.locator('canvas')).toBeHidden();
  await figures.getByRole('button', { name: 'Mostra figura' }).click();
  await expect(figures.locator('canvas')).toBeVisible();
  expect(
    await figures.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const d = canvas
        .getContext('2d')!
        .getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
      return d[0] !== 255 || d[1] !== 255 || d[2] !== 255;
    }),
  ).toBe(true);
  await figures.getByRole('button', { name: 'Nascondi figura' }).click();
  await expect(figures.locator('canvas')).toBeHidden();
  await page.getByTestId('engine-page').fill('2');
  await page.getByRole('button', { name: 'Vai alla pagina' }).click();
  await expect(page.getByTestId('engine-status')).toContainText('Pagina 2 pronta.');
  await expect(page.getByTestId('engine-content')).toContainText('Capitolo 2');
  await expect(page.getByTestId('engine-figure')).toHaveCount(1);
  await page.getByRole('button', { name: 'Mostra figura' }).click();
  await expect(page.getByTestId('engine-figure').locator('canvas')).toBeVisible();
  expect(
    await page
      .getByTestId('engine-figure')
      .locator('canvas')
      .evaluate((canvas: HTMLCanvasElement) => {
        const d = canvas
          .getContext('2d')!
          .getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
        return d[0] !== 255 || d[1] !== 255 || d[2] !== 255;
      }),
  ).toBe(true);
  await page.getByTestId('engine-original').click();
  await expect(page.getByTestId('original-canvas')).toBeVisible();
  await expect(page.getByTestId('original-canvas')).toHaveAttribute(
    'aria-label',
    'Pagina PDF originale 2',
  );
  await page.getByTestId('engine-original').click();
  await expect(page.getByTestId('engine-content')).toContainText('Capitolo 2');
  await page.getByTestId('engine-page').fill('3');
  await page.getByRole('button', { name: 'Vai alla pagina' }).click();
  await expect(page.getByTestId('engine-status')).toContainText('Pagina 3 pronta.');
  await expect(page.getByTestId('engine-figure')).toHaveCount(0);
  await page.getByTestId('engine-page').fill('1');
  await page.getByRole('button', { name: 'Vai alla pagina' }).click();
  await expect(page.getByTestId('engine-content')).toContainText('Il piacere');
  await expect(page.getByTestId('engine-content')).not.toContainText('Fluido |');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(requests.some((url) => /pdf\.worker.*mjs/.test(url))).toBe(true);
  expect(
    requests.every((url) => url.startsWith(new URL(page.url()).origin) || url.startsWith('blob:')),
  ).toBe(true);
});
test('scansione, colonne e documento misto: avviso esplicito e originale disponibile', async ({
  page,
}) => {
  for (const [bytes, expected, name, selected] of [
    [scannedPdf(), 'senza testo', 'scansione.pdf', 1],
    [columnsPdf(), 'multi-colonna', 'colonne.pdf', 1],
    [mixedPdf(), 'senza testo', 'misto.pdf', 2],
  ] as const) {
    await page.getByTestId('input-pdf').setInputFiles(upload(bytes, name));
    await expect(page.getByTestId('text-pdf-name')).toHaveText(name);
    await expect(page.getByTestId('button-open-pdf')).toBeEnabled();
    await expect(page.getByTestId('engine-status')).toContainText('Pagina 1 pronta.');
    await page.getByTestId('engine-page').fill(String(selected));
    await page.getByRole('button', { name: 'Vai alla pagina' }).click();
    await expect(page.getByTestId('engine-warning')).toContainText(expected);
    await expect(page.getByTestId('engine-original')).toBeVisible();
    await page.getByTestId('engine-original').click();
    await expect(page.getByTestId('original-canvas')).toBeVisible();
  }
});
test('parser respinge PDF danneggiato senza sostituire nota e documento correnti', async ({
  page,
}) => {
  await page.getByTestId('input-pdf').setInputFiles(upload(simplePdf()));
  await page.getByTestId('input-note').fill('Da conservare');
  await page
    .getByTestId('input-pdf')
    .setInputFiles(upload(Buffer.from('%PDF-1.7\nincompleto\n%%EOF'), 'rotto.pdf'));
  await expect(page.getByTestId('status-error')).toContainText('non è leggibile');
  await expect(page.getByTestId('input-note')).toHaveValue('Da conservare');
  await expect(page.getByTestId('text-pdf-name')).toHaveText('corpus.pdf');
});
test('pagina ruotata non viene presentata come ricostruzione affidabile', async ({ page }) => {
  await page
    .getByTestId('input-pdf')
    .setInputFiles(upload(makePdf([text('Testo ruotato.', 52, 700)], { rotation: 90 })));
  await expect(page.getByTestId('engine-warning')).toContainText('ruotato');
});
test('il motore e i font locali funzionano offline anche al primo PDF dopo reload', async ({
  page,
  context,
}) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('input-pdf').setInputFiles(upload(simplePdf()));
  await expect(page.getByTestId('engine-status')).toContainText('Layout semplice rilevato.');
  await page.getByRole('button', { name: 'Mostra figura' }).click();
  await expect(page.getByTestId('engine-figure').locator('canvas')).toBeVisible();
});

test('PDF cifrato: errore esplicito senza sessione né richiesta credenziali', async ({ page }) => {
  const bytes = readFileSync(new URL('../fixtures/corpus/protetto.pdf', import.meta.url));
  await page.getByTestId('input-pdf').setInputFiles(upload(bytes, 'protetto.pdf'));
  await expect(page.getByTestId('status-error')).toContainText('protetto da password');
  await expect(page.getByTestId('input-note')).toHaveCount(0);
});

test('interrompe e riprende l’estrazione senza modificare il file', async ({ page }) => {
  // Ritarda solo il primo messaggio di estrazione, non sostituisce il worker PDF.
  // Evita di dipendere dalla velocità del computer per raggiungere il pulsante.
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    let delayed = false;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const deliver = () =>
        send.call(this, message, Array.isArray(options) ? { transfer: options } : options);
      if (
        !delayed &&
        typeof message === 'object' &&
        message !== null &&
        'action' in message &&
        message.action === 'GetTextContent'
      ) {
        delayed = true;
        setTimeout(deliver, 1200);
      } else deliver();
    };
  });
  await page.reload();
  const bytes = makePdf(
    Array.from({ length: 200 }, (_, i) =>
      text(`Pagina numero ${i + 1} con testo di prova.`, 52, 700),
    ),
  );
  await page.getByTestId('input-pdf').setInputFiles(upload(bytes, 'lungo.pdf'));
  await page.getByRole('button', { name: 'Interrompi estrazione' }).click();
  await expect(page.getByTestId('engine-status')).toContainText('interrotta');
  await page.getByRole('button', { name: 'Riprova estrazione' }).click();
  await expect(page.getByTestId('engine-status')).toContainText('Layout semplice rilevato.', {
    timeout: 20000,
  });
});
