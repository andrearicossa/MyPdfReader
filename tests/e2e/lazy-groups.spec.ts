import { test, expect, type Page } from '@playwright/test';
import { boxedQuotePdf, makePdf, text } from '../fixtures/pdf-corpus.mjs';
const go = async (page: Page, number: number) => {
  await page.getByTestId('engine-page').fill(String(number));
  await page.getByRole('button', { name: 'Vai alla pagina' }).click();
  await expect(page.getByTestId('engine-status')).toContainText(`Pagina ${number} pronta.`);
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { textPages: number[] };
    state.textPages = [];
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (
        typeof message === 'object' &&
        message !== null &&
        'action' in message &&
        message.action === 'GetTextContent' &&
        'data' in message
      )
        state.textPages.push((message.data as { pageIndex: number }).pageIndex + 1);
      send.call(this, message, Array.isArray(options) ? { transfer: options } : options);
    };
  });
  await page.goto('/');
});
const extracted = (page: Page) =>
  page.evaluate(() => (window as unknown as { textPages: number[] }).textPages);
test('prima pagina soltanto, salto a 35, cache LRU e Originale senza estrarre altro testo', async ({
  page,
}) => {
  const buffer = makePdf(
    Array.from({ length: 200 }, (_, i) =>
      text(`Contenuto esclusivo della pagina ${i + 1}.`, 52, 700),
    ),
  );
  await page
    .getByTestId('input-pdf')
    .setInputFiles({ name: '200-pagine.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.getByTestId('engine-status')).toContainText('Pagina 1 pronta.');
  await page.waitForTimeout(350);
  expect(await extracted(page)).toEqual([1]);
  await go(page, 35);
  expect(await extracted(page)).toEqual([1, 35]);
  await expect(page.getByTestId('engine-content')).toContainText(
    'Contenuto esclusivo della pagina 35.',
  );
  await page.getByRole('button', { name: 'Pagina precedente', exact: true }).click();
  await expect(page.getByTestId('engine-status')).toContainText('Pagina 34 pronta.');
  await page.getByRole('button', { name: 'Pagina successiva', exact: true }).click();
  await expect(page.getByTestId('engine-status')).toContainText('Pagina 35 pronta.');
  expect(await extracted(page)).toEqual([1, 35, 34]);
  await page.getByTestId('engine-original').click();
  await page.getByRole('button', { name: 'Pagina successiva', exact: true }).click();
  await expect(page.getByTestId('original-canvas')).toBeVisible();
  await expect(page.getByTestId('original-canvas')).toHaveAttribute(
    'aria-label',
    'Pagina PDF originale 36',
  );
  expect(await extracted(page)).toEqual([1, 35, 34]);
  await page.getByTestId('engine-original').click();
  await expect(page.getByTestId('engine-status')).toContainText('Pagina 36 pronta.');
  expect(await extracted(page)).toEqual([1, 35, 34, 36]);
  for (let number = 2; number <= 10; number++) await go(page, number);
  await expect(page.getByTestId('engine-cache')).toHaveText('8 pagine in cache (massimo 8).');
  const before = (await extracted(page)).length;
  await go(page, 1);
  expect((await extracted(page)).length).toBe(before + 1);
  await expect(page.getByRole('button', { name: 'Pagina precedente', exact: true })).toBeDisabled();
  await page.getByTestId('engine-page').fill('0');
  await page.getByRole('button', { name: 'Vai alla pagina' }).click();
  await expect(page.getByTestId('engine-status')).toContainText('Pagina 1 pronta.');
});
test('box a bordo chiuso, quattro segmenti o sfondo e citazione con attribuzione', async ({
  page,
}) => {
  for (const [name, options] of [
    ['bordo', {}],
    ['segmenti', { segments: true }],
    ['sfondo', { background: true }],
  ] as const) {
    await page.getByTestId('input-pdf').setInputFiles({
      name: `${name}.pdf`,
      mimeType: 'application/pdf',
      buffer: boxedQuotePdf(options),
    });
    await expect(page.getByTestId('text-pdf-name')).toHaveText(`${name}.pdf`);
    await expect(page.getByTestId('button-open-pdf')).toBeEnabled();
    await expect(page.getByTestId('reading-box')).toHaveCount(1);
    await expect(page.getByTestId('reading-box').locator('p')).toHaveCount(2);
    await expect(page.getByTestId('reading-box')).toContainText('Secondo paragrafo nel box');
    await expect(page.getByTestId('reading-quote')).toHaveCount(1);
    await expect(page.getByTestId('quote-attribution')).toHaveText('- Autrice di prova');
    await expect(page.getByTestId('engine-figure')).toHaveCount(0);
    await expect(
      page.getByText(
        'Primo paragrafo nel box: il testo deve restare selezionabile. Questa seconda riga non deve essere convertita in immagine.',
        { exact: true },
      ),
    ).toHaveCount(1);
    await page.getByTestId('reading-box').locator('p').first().dblclick();
    expect(await page.evaluate(() => getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByTestId('engine-original').click();
    await expect(page.getByTestId('original-canvas')).toBeVisible();
    await page.getByTestId('engine-original').click();
    await expect(page.getByTestId('reading-box')).toHaveCount(1);
  }
});
test('immagine vera nel riquadro: non viene eliminata come bordo', async ({ page }) => {
  await page.getByTestId('input-pdf').setInputFiles({
    name: 'box-immagine.pdf',
    mimeType: 'application/pdf',
    buffer: boxedQuotePdf({ image: true }),
  });
  await expect(page.getByTestId('engine-status')).toContainText('Pagina 1 pronta.');
  await expect(page.getByTestId('reading-box')).toHaveCount(0);
  await expect(page.getByTestId('engine-figure')).toHaveCount(1);
  await page.getByRole('button', { name: 'Mostra figura' }).click();
  await expect(page.getByTestId('engine-figure').locator('canvas')).toBeVisible();
});
test('cambio pagina durante richiesta lenta: mai mostrare il risultato obsoleto', async ({
  page,
}) => {
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
        setTimeout(deliver, 1500);
      } else deliver();
    };
  });
  await page.reload();
  await page.getByTestId('input-pdf').setInputFiles({
    name: 'lento.pdf',
    mimeType: 'application/pdf',
    buffer: makePdf(
      Array.from({ length: 40 }, (_, i) => text(`Risultato della pagina ${i + 1}.`, 52, 700)),
    ),
  });
  await expect(page.getByTestId('engine-status')).toContainText('Estrazione della pagina 1');
  await go(page, 35);
  await page.waitForTimeout(1700);
  await expect(page.getByTestId('engine-content')).toContainText('Risultato della pagina 35.');
  await expect(page.getByTestId('engine-status')).toContainText('Pagina 35 pronta.');
  expect((await extracted(page)).sort((a, b) => a - b)).toEqual([1, 35]);
});
