import { test, expect, type Page } from '@playwright/test';
import { openAppearance, closePanel, technical } from './reader-ui';
import { createHash } from 'node:crypto';
import {
  makePdf,
  text,
  simplePdf,
  boxedQuotePdf,
  scannedPdf,
  columnsPdf,
} from '../fixtures/pdf-corpus.mjs';

const open = async (page: Page, buffer: Buffer) => {
  await page
    .getByTestId('input-pdf')
    .setInputFiles({ name: 'lettura.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.getByTestId('text-pdf-hash')).toHaveText(
    createHash('sha256').update(buffer).digest('hex'),
  );
  await expect(page.getByTestId('fluid-reader')).toBeVisible();
  await expect(page.locator('[data-flow-page]').first()).toBeVisible();
};
const go = async (page: Page, number: number) => {
  await page.getByTestId('flow-page').fill(String(number));
  await page.getByRole('button', { name: 'Vai', exact: true }).click();
  await expect(page.locator(`[data-flow-page="${number}"]`)).toBeVisible();
};
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('lettura principale, una sola pagina iniziale, salto e finestra DOM limitata', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as { readPages: number[] };
    state.readPages = [];
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (
        message &&
        typeof message === 'object' &&
        'action' in message &&
        message.action === 'GetTextContent' &&
        'data' in message
      )
        state.readPages.push((message.data as { pageIndex: number }).pageIndex + 1);
      send.call(this, message, Array.isArray(options) ? { transfer: options } : options);
    };
  });
  await page.reload();
  await open(
    page,
    makePdf(
      Array.from({ length: 200 }, (_, i) =>
        text(`Solo pagina ${i + 1}: testo leggibile.`, 52, 700),
      ),
    ),
  );
  const requested = () =>
    page.evaluate(() => (window as unknown as { readPages: number[] }).readPages);
  expect(await requested()).toEqual([1]);
  await go(page, 35);
  expect(await requested()).toEqual([1, 35]);
  for (let i = 0; i < 7; i++) {
    await page.getByTestId('flow-continue').click();
    await expect(page.getByTestId('flow-continue')).toBeEnabled();
  }
  expect(await page.locator('[data-flow-page]').count()).toBeLessThanOrEqual(5);
  expect(await requested()).toEqual([1, 35, 36, 37, 38, 39, 40, 41, 42]);
  await page.getByRole('button', { name: 'Carica pagina precedente · 37', exact: true }).click();
  await expect(page.locator('[data-flow-page="37"]')).toBeAttached();
  await expect(page.locator('[data-flow-page]')).toHaveCount(5);
  await go(page, 120);
  await page.getByTestId('flow-original').click();
  await expect(page.getByTestId('original-canvas')).toHaveAttribute(
    'aria-label',
    'Pagina PDF originale 120',
  );
  await page.getByRole('button', { name: 'Successiva', exact: true }).click();
  await expect(page.getByTestId('original-canvas')).toHaveAttribute(
    'aria-label',
    'Pagina PDF originale 121',
  );
  expect(await requested()).not.toContain(121);
  await page.getByTestId('flow-original').click();
  await expect(page.locator('[data-flow-page="121"]')).toBeVisible();
  expect(await requested()).toContain(121);
  await technical(page);
  await expect(page.getByTestId('engine-panel')).toBeVisible();
});

test('preferenze globali persistenti, tutti i temi, box e testo responsive', async ({ page }) => {
  await open(page, boxedQuotePdf());
  await openAppearance(page);
  await expect(page.getByTestId('reading-font')).toBeEnabled();
  await page.getByTestId('reading-font').selectOption('sans');
  await page.getByTestId('reading-size').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await page.getByTestId('reading-line').focus();
  await page.keyboard.press('End');
  await page.getByTestId('reading-margin').focus();
  await page.keyboard.press('End');
  for (const theme of ['dark', 'light', 'sepia']) {
    await page.getByTestId('reading-theme').selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  }
  await expect(page.getByTestId('preferences-status')).toContainText('Preferenze salvate');
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.getByTestId('reading-box')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.flow-prose')).toHaveCSS('font-size', '24px');
  expect(
    await page.locator('.flow-prose').evaluate((el) => parseFloat(getComputedStyle(el).lineHeight)),
  ).toBeCloseTo(52.8, 2);
  await page.setViewportSize({ width: 768, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.context().setOffline(true);
  await page.reload();
  await open(page, boxedQuotePdf());
  await openAppearance(page);
  await expect(page.getByTestId('reading-size')).toHaveValue('24');
  await expect(page.getByTestId('reading-font')).toHaveValue('sans');
  await expect(page.getByTestId('reading-theme')).toHaveValue('sepia');
  await page.getByRole('button', { name: 'Ripristina preferenze' }).click();
  await expect(page.getByTestId('reading-size')).toHaveValue('20');
});

test('scorrimento progressivo e ritorno dall’Originale alla posizione nel testo', async ({
  page,
}) => {
  const content = Array.from({ length: 42 }, (_, i) =>
    text(`Riga ${i + 1}: un paragrafo lungo per provare il flusso di lettura.`, 52, 760 - i * 16),
  ).join('\n');
  await open(page, makePdf([content, content, content]));
  const viewport = page.getByTestId('flow-viewport');
  await viewport.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  // Attendere la fine dello scorrimento nativo, non misurare un fotogramma intermedio.
  await viewport.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        let previous = el.scrollTop,
          stable = 0;
        const frame = () => {
          stable = Math.abs(el.scrollTop - previous) < 0.1 ? stable + 1 : 0;
          previous = el.scrollTop;
          if (stable >= 5) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  const before = await viewport.evaluate((el) => el.scrollTop);
  const fraction = () =>
    viewport.evaluate((el) => {
      const block = el.querySelector('.flow-prose > [data-flow-block]')!.getBoundingClientRect();
      return (el.getBoundingClientRect().top + 12 - block.top) / block.height;
    });
  const oldFraction = await fraction();
  await openAppearance(page);
  await page.getByTestId('reading-size').focus();
  await page.keyboard.press('End');
  await expect.poll(async () => Math.abs((await fraction()) - oldFraction)).toBeLessThan(0.04);
  await page.setViewportSize({ width: 375, height: 900 });
  await expect.poll(async () => Math.abs((await fraction()) - oldFraction)).toBeLessThan(0.05);
  await page.setViewportSize({ width: 1280, height: 900 });
  await closePanel(page);
  await page.getByTestId('flow-original').click();
  await expect(page.getByTestId('original-canvas')).toBeVisible();
  await page.getByTestId('flow-original').click();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(before * 0.7);
  // Firefox può limitare il percorso di un singolo evento wheel:
  // continuare con gesti reali fino al bordo, senza assumere delta == pixel mossi.
  await expect
    .poll(
      async () => {
        if (await page.locator('[data-flow-page="2"]').count()) return true;
        await viewport.hover();
        await page.mouse.wheel(0, 1600);
        return (await page.locator('[data-flow-page="2"]').count()) > 0;
      },
      { timeout: 10000 },
    )
    .toBe(true);
});

test('errore, annullamento, riprova e risultato tardivo non sostituiscono la pagina corrente', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    let failed = false,
      delayed = false;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const o = Array.isArray(options) ? { transfer: options } : options;
      if (
        message &&
        typeof message === 'object' &&
        'action' in message &&
        message.action === 'GetTextContent' &&
        'data' in message
      ) {
        const index = (message.data as { pageIndex: number }).pageIndex;
        if (index === 0 && !failed) {
          failed = true;
          throw new Error('Errore di estrazione simulato');
        }
        if (index === 1 && !delayed) {
          delayed = true;
          setTimeout(() => send.call(this, message, o), 1200);
          return;
        }
      }
      send.call(this, message, o);
    };
  });
  await page.reload();
  await page.getByTestId('input-pdf').setInputFiles({
    name: 'ritardo.pdf',
    mimeType: 'application/pdf',
    buffer: makePdf([1, 2, 3, 4].map((n) => text(`Pagina di prova ${n}.`, 52, 700))),
  });
  await expect(page.getByRole('alert')).toContainText('Errore di estrazione simulato');
  await page.getByRole('button', { name: 'Riprova caricamento' }).click();
  await expect(page.locator('[data-flow-page="1"]')).toBeVisible();
  await page.getByTestId('flow-page').fill('2');
  await page.getByRole('button', { name: 'Vai', exact: true }).click();
  await page.getByRole('button', { name: 'Interrompi caricamento' }).click();
  await expect(page.getByRole('alert')).toContainText('annullato');
  await page.getByRole('button', { name: 'Riprova caricamento' }).click();
  await go(page, 3);
  // Tempo intenzionale: consentire al messaggio della pagina annullata di arrivare.
  await page.waitForTimeout(1600);
  await expect(page.getByTestId('flow-current')).toHaveText('Pagina 3 di 4');
  await expect(page.locator('[data-flow-page]')).toHaveCount(1);
  await expect(page.locator('[data-flow-page="3"]')).toContainText('Pagina di prova 3.');
});

test('figure raster e vettoriali nel flusso, zoom e chiusura accessibile', async ({
  page,
  browserName,
}) => {
  await open(page, simplePdf());
  for (const number of [1, 2]) {
    await go(page, number);
    await page.getByRole('button', { name: 'Ingrandisci figura', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('img', { name: 'Figura ingrandita' })).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Ingrandisci figura di un livello', exact: true })
      .click();
    await expect(page.getByTestId('figure-scale')).toHaveText('125%');
    await page.getByTestId('zoom-stage').dblclick();
    await expect(page.getByTestId('figure-scale')).toHaveText('100%');
    if (browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      const box = (await page.getByTestId('zoom-stage').boundingBox())!;
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      for (let tap = 0; tap < 2; tap++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      await expect(page.getByTestId('figure-scale')).toHaveText('200%');
      await page.getByRole('button', { name: 'Adatta figura' }).click();
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: x - 30, y },
          { x: x + 30, y },
        ],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: x - 70, y },
          { x: x + 70, y },
        ],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect
        .poll(async () =>
          Number((await page.getByTestId('figure-scale').innerText()).replace('%', '')),
        )
        .toBeGreaterThan(150);
      await cdp.detach();
    }
    await page.getByRole('button', { name: 'Adatta figura' }).click();
    await expect(page.getByTestId('figure-scale')).toHaveText('100%');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('flow-current')).toHaveText(`Pagina ${number} di 3`);
  }
});

test('scansione e colonne: avviso e originale della pagina corrente', async ({ page }) => {
  for (const buffer of [scannedPdf(), columnsPdf()]) {
    await open(page, buffer);
    await expect(page.getByTestId('flow-warning')).toBeVisible();
    await page.getByRole('button', { name: 'Originale pagina 1', exact: true }).click();
    await expect(page.getByTestId('original-canvas')).toBeVisible();
    await page.getByTestId('flow-original').click();
    await expect(page.getByTestId('flow-warning')).toBeVisible();
  }
});

test('IndexedDB preferenze non disponibile: lettura e controlli non si bloccano', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name, version) => {
      if (name === 'fluido-preferences-v1')
        throw new DOMException('Storage blocked', 'SecurityError');
      return open(name, version);
    };
  });
  await page.reload();
  await open(page, boxedQuotePdf());
  await openAppearance(page);
  await expect(page.getByTestId('preferences-status')).toContainText('Preferenze temporanee');
  await page.getByTestId('reading-theme').selectOption('sepia');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await expect(page.getByTestId('reading-quote')).toBeVisible();
});
