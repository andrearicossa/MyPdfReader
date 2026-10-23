import { test, expect, type Page, type Locator } from '@playwright/test';
import { openFiles, closePanel, openNotes, openAppearance, technical } from './reader-ui';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { boxedQuotePdf, makePdf, text, simplePdf, columnsPdf } from '../fixtures/pdf-corpus.mjs';
import type { AnnotationData } from '../../src/core/annotations';

const fallback = async (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
  });
async function open(page: Page, buffer = boxedQuotePdf()) {
  await page
    .getByTestId('input-pdf')
    .setInputFiles({ name: 'studio.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.getByTestId('text-pdf-hash')).toHaveText(
    createHash('sha256').update(buffer).digest('hex'),
  );
  await expect(page.getByTestId('fluid-reader')).toBeVisible();
  await expect(page.getByTestId('reader-document')).toHaveText('studio.pdf');
  await expect(page.locator('[data-flow-page]').first()).toBeVisible();
}
/** Geometry is inspection only. Selection uses actual mouse input, not addRange(). */
async function selectText(page: Page, first: Locator, start: number, end: number, last = first) {
  await first.scrollIntoViewIfNeeded();
  const point = async (leaf: Locator, offset: number) =>
    leaf.evaluate((el, at) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let remaining = at,
        node = walker.nextNode();
      while (node && remaining > (node.textContent?.length ?? 0)) {
        remaining -= node.textContent?.length ?? 0;
        node = walker.nextNode();
      }
      if (!node) throw new Error('Offset di selezione assente');
      const length = node.textContent?.length ?? 0,
        r = document.createRange();
      r.setStart(node, Math.min(remaining, Math.max(0, length - 1)));
      r.setEnd(node, Math.min(length, remaining + 1));
      const bounds = r.getBoundingClientRect();
      return {
        x: remaining === length ? bounds.right - 0.1 : bounds.left + 0.1,
        y: bounds.top + bounds.height / 2,
      };
    }, offset);
  const a = await point(first, start),
    b = await point(last, end);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 16 });
  await page.mouse.up();
}
async function download(page: Page): Promise<AnnotationData> {
  await openFiles(page);
  const promise = page.waitForEvent('download');
  await page.getByTestId('download-annotations').click();
  const file = await promise;
  expect(file.suggestedFilename()).toBe('studio.annotations.json');
  await closePanel(page);
  return JSON.parse(await readFile((await file.path())!, 'utf8')) as AnnotationData;
}
const uploadJson = async (page: Page, data: AnnotationData | string) =>
  page.getByTestId('input-annotations').setInputFiles({
    name: 'studio.annotations.json',
    mimeType: 'application/json',
    buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)),
  });
async function settle(page: Page) {
  await page.getByTestId('flow-viewport').evaluate(
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
}
test.beforeEach(async ({ page }) => {
  await fallback(page);
  await page.goto('/');
});

test('AC-12/13/14: selezione reale in box, modifica nota, colori, reflow e cancellazione confermata', async ({
  page,
}) => {
  await open(page);
  const leaf = page.getByTestId('reading-box').locator('[data-text-start]').first();
  await selectText(page, leaf, 0, 24);
  await expect(page.getByRole('button', { name: 'Aggiungi nota', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Aggiungi nota', exact: true }).click();
  await page.getByTestId('annotation-note').fill('Nota caffè 日本語 <script>non eseguire</script>');
  await page.getByRole('combobox', { name: 'Colore della nota', exact: true }).selectOption('rose');
  await expect(page.locator('mark.highlight-rose')).toHaveText('Primo paragrafo nel box:');
  await expect(page.getByTestId('annotation-card')).toContainText('<script>non eseguire</script>');
  await page.getByRole('button', { name: 'Chiudi nota', exact: true }).click();
  await openAppearance(page);
  await page.getByTestId('reading-size').focus();
  await page.keyboard.press('End');
  await page.getByTestId('reading-font').selectOption('sans');
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.locator('mark')).toHaveText('Primo paragrafo nel box:');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await closePanel(page);
  await openNotes(page);
  await page.getByRole('button', { name: 'Vai al passaggio', exact: true }).click();
  await expect(page.getByTestId('annotation-editor')).toHaveCount(0);
  await expect(page.locator('mark')).toBeInViewport();
  await openNotes(page);
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  await expect(page.getByTestId('annotation-note')).toHaveValue(
    'Nota caffè 日本語 <script>non eseguire</script>',
  );
  await page.getByTestId('annotation-note').fill('Nota modificata');
  await page.getByRole('button', { name: 'Chiudi nota', exact: true }).click();
  await page.getByRole('button', { name: 'Elimina', exact: true }).click();
  await page.getByRole('button', { name: 'Mantieni', exact: true }).click();
  await expect(page.getByTestId('annotation-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Elimina', exact: true }).click();
  await page.getByRole('button', { name: 'Conferma eliminazione', exact: true }).click();
  await expect(page.getByTestId('annotation-card')).toHaveCount(0);
  await expect(page.locator('mark')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByTestId('reader-notes')).toHaveAttribute('aria-expanded', 'true');
});

test('selezione inversa, sovrapposizioni e attribuzione della citazione', async ({ page }) => {
  await open(page);
  const paragraph = page.getByTestId('reading-box').locator('[data-text-start]').first();
  await selectText(page, paragraph, 24, 0);
  await page.getByRole('button', { name: 'Evidenzia', exact: true }).click();
  await selectText(page, paragraph, 10, 32);
  await page.getByRole('button', { name: 'Colore: Azzurro', exact: true }).click();
  await page.getByRole('button', { name: 'Evidenzia', exact: true }).click();
  await expect(page.getByTestId('annotation-card')).toHaveCount(2);
  await expect(page.locator('mark[data-annotation-ids*=" "]')).toHaveCount(1);
  const attribution = page.getByTestId('quote-attribution').locator('[data-text-start]');
  await selectText(page, attribution, 0, 10);
  await page.getByRole('button', { name: 'Aggiungi nota', exact: true }).click();
  await page.getByTestId('annotation-note').fill('Nota all’attribuzione');
  const result = await download(page);
  expect(result.annotations).toHaveLength(3);
  expect(result.annotations[0]!.anchor.quote).toBe('Primo paragrafo nel box:');
  expect(result.annotations[2]!.anchor.quote).toHaveLength(10);
  await page.locator('mark').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('annotation-editor')).toBeVisible();
});

test('AC-22: export e import in contesto pulito, font diverso, PDF invariato e offline', async ({
  page,
  browser,
}) => {
  const pdf = boxedQuotePdf();
  await open(page, pdf);
  await selectText(
    page,
    page.getByTestId('reading-box').locator('[data-text-start]').first(),
    0,
    24,
  );
  await page.getByRole('button', { name: 'Aggiungi nota', exact: true }).click();
  await page.getByTestId('annotation-note').fill('Portabile');
  const result = await download(page);
  expect(result.schema).toBe('fluido/annotations');
  const bytes = await page.evaluate(async () => [
    ...new Uint8Array(
      await (
        await fetch(
          document.querySelector<HTMLAnchorElement>('[data-testid="link-original-pdf"]')!.href,
        )
      ).arrayBuffer(),
    ),
  ]);
  expect(Buffer.from(bytes)).toEqual(pdf);
  const otherContext = await browser.newContext({ viewport: { width: 375, height: 900 } }),
    other = await otherContext.newPage();
  await fallback(other);
  await other.goto('/');
  await open(other, pdf);
  await openAppearance(other);
  await other.getByTestId('reading-size').focus();
  await other.keyboard.press('End');
  await closePanel(other);
  await uploadJson(other, result);
  await openNotes(other);
  await expect(other.getByTestId('annotation-card')).toContainText('Portabile');
  await expect(other.locator('mark')).toHaveText('Primo paragrafo nel box:');
  await expect(other.getByTestId('reading-size')).toHaveValue('32');
  await other.evaluate(() => navigator.serviceWorker.ready);
  await other.reload();
  await otherContext.setOffline(true);
  await other.reload();
  await open(other, pdf);
  await openNotes(other);
  await expect(other.getByTestId('annotation-card')).toContainText('Portabile');
  await expect(other.locator('mark')).toHaveText('Primo paragrafo nel box:');
  await otherContext.close();
});

test('AC-18: posizione interna al paragrafo e ripristino pagina senza estrarre le precedenti', async ({
  page,
}) => {
  const content = Array.from({ length: 42 }, (_, i) =>
    text(
      `Riga ${i + 1} con testo lungo per verificare il punto di lettura nel paragrafo.`,
      52,
      760 - i * 16,
    ),
  ).join('\n');
  const pdf = makePdf([content, content, content, content]);
  await open(page, pdf);
  await page.getByTestId('flow-page').fill('3');
  await page.getByRole('button', { name: 'Vai', exact: true }).click();
  await expect(page.locator('[data-flow-page="3"]')).toBeVisible();
  await page.getByTestId('flow-viewport').focus();
  await page.keyboard.press('PageDown');
  await settle(page);
  const result = await download(page);
  expect(result.position.page).toBe(3);
  expect(result.position.offset).toBeGreaterThan(20);
  expect(result.position.anchor?.quote).toBeTruthy();
  await page.reload();
  await open(page, pdf);
  await expect(page.getByTestId('flow-current')).toHaveText('Pagina 3 di 4');
  await expect(page.locator('[data-flow-page]')).toHaveCount(1);
  await expect
    .poll(() => page.getByTestId('flow-viewport').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100);
  await technical(page);
  await page.getByRole('button', { name: 'Lettura fluida', exact: true }).click();
  await expect(page.getByTestId('flow-current')).toHaveText('Pagina 3 di 4');
  const exported = await download(page);
  expect(exported.position.anchor?.quote).toBe(result.position.anchor?.quote);
});

test('ancore riallineate o non risolte e import non valido conservano le note', async ({
  page,
}) => {
  await open(page);
  await selectText(
    page,
    page.getByTestId('reading-box').locator('[data-text-start]').first(),
    0,
    24,
  );
  await page.getByRole('button', { name: 'Aggiungi nota', exact: true }).click();
  await page.getByTestId('annotation-note').fill('Conservare');
  const d = await download(page),
    a = d.annotations[0]!;
  a.anchor.start += 3;
  a.anchor.end += 3;
  await uploadJson(page, d);
  await expect(page.getByTestId('annotation-card')).toContainText('riallineato');
  await page.getByRole('button', { name: 'Vai al passaggio', exact: true }).click();
  await expect(page.locator('mark')).toHaveText('Primo paragrafo nel box:');
  const missing = structuredClone(d);
  missing.annotations[0]!.anchor = {
    page: 1,
    start: 0,
    end: 7,
    quote: 'assente',
    prefix: '',
    suffix: '',
  };
  // Ripristinare senza lasciare dati non esportati, perché il gesto di salto salva la posizione.
  await download(page);
  await uploadJson(page, missing);
  await expect(page.getByTestId('annotation-card')).toContainText('Ancora non trovata');
  await expect(page.locator('mark')).toHaveCount(0);
  const ambiguous = structuredClone(missing);
  ambiguous.annotations[0]!.anchor = {
    page: 1,
    start: 99999,
    end: 100008,
    quote: 'paragrafo',
    prefix: '',
    suffix: '',
  };
  await uploadJson(page, ambiguous);
  await expect(page.getByTestId('annotation-card')).toContainText('Ancora ambigua');
  await expect(page.locator('mark')).toHaveCount(0);
  await uploadJson(page, '{"schema":"errato"}');
  await openFiles(page);
  await expect(page.getByTestId('annotations-error')).toBeVisible();
  await expect(page.getByTestId('annotation-card')).toContainText('Conservare');
  const mismatch = structuredClone(missing);
  mismatch.document.sha256 = 'b'.repeat(64);
  await uploadJson(page, mismatch);
  await expect(page.getByTestId('annotations-error')).toContainText('PDF diverso');
});

test('selezione tra paragrafi nello stesso box usa i separatori canonici', async ({ page }) => {
  await open(page);
  const leaves = page.getByTestId('reading-box').locator('[data-text-start]');
  await selectText(page, leaves.first(), 5, 15, leaves.nth(1));
  await page.getByRole('button', { name: 'Aggiungi nota', exact: true }).click();
  await page.getByTestId('annotation-note').fill('Tra due paragrafi');
  const d = await download(page),
    quote = d.annotations[0]!.anchor.quote;
  expect(quote).toContain('\n\n');
  expect(
    (await page.getByTestId('reading-box').locator('mark').allTextContents())
      .join('')
      .replace(/\s/g, ''),
  ).toBe(quote.replace(/\s/g, ''));
});

test('cache annotazioni indisponibile: avviso, download e protezione PWA senza perdere la nota', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name: string, version?: number) {
      if (name === 'fluido-annotations-v1')
        throw new DOMException('Storage disabilitato', 'SecurityError');
      return open.call(this, name, version);
    };
  });
  await page.reload();
  await open(page);
  await expect(page.getByTestId('annotation-save-status')).toContainText(
    'Cache locale non disponibile',
  );
  await selectText(
    page,
    page.getByTestId('reading-box').locator('[data-text-start]').first(),
    0,
    24,
  );
  await page.getByRole('button', { name: 'Aggiungi nota', exact: true }).click();
  await page.getByTestId('annotation-note').fill('Salvare comunque');
  await expect
    .poll(() => page.getByTestId('annotation-save-status').textContent())
    .toContain('Cache non salvata');
  expect(
    await page.evaluate(() =>
      window.dispatchEvent(new Event('fluido:before-update', { cancelable: true })),
    ),
  ).toBe(false);
  const d = await download(page);
  expect(d.annotations[0]!.note).toBe('Salvare comunque');
  await expect(page.getByTestId('annotation-save-status')).toContainText('Download avviato');
  expect(
    await page.evaluate(() =>
      window.dispatchEvent(new Event('fluido:before-update', { cancelable: true })),
    ),
  ).toBe(true);
  await expect(page.getByTestId('annotation-card')).toContainText('Salvare comunque');
});

test('rifiuta selezioni tra pagine o su ricostruzioni non affidabili', async ({ page }) => {
  const pdf = makePdf([
    text('Prima pagina con testo selezionabile.', 52, 720),
    text('Seconda pagina con altro testo.', 52, 720),
  ]);
  await open(page, pdf);
  await page.getByTestId('flow-continue').click();
  await expect(page.locator('[data-flow-page="2"]')).toBeVisible();
  await selectText(
    page,
    page.locator('[data-flow-page="1"] [data-text-start]').first(),
    0,
    8,
    page.locator('[data-flow-page="2"] [data-text-start]').first(),
  );
  await expect(page.getByTestId('annotation-selection')).toContainText('una sola pagina');
  await expect(page.getByRole('button', { name: 'Evidenzia', exact: true })).toBeDisabled();
  await open(page, columnsPdf());
  const leaf = page.locator('[data-text-start]').first();
  await selectText(page, leaf, 0, 8);
  await expect(page.getByTestId('annotation-selection')).toContainText('non affidabile');
});

test('bookmark figura: riapertura sul flusso, non nel dialogo zoom', async ({ page }) => {
  const pdf = simplePdf();
  await open(page, pdf);
  await page.getByRole('button', { name: 'Ingrandisci figura', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  const d = await download(page);
  expect(d.position.figure).toBe('p1-f1');
  await page.reload();
  await open(page, pdf);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-figure-id="p1-f1"]')).toBeVisible();
});

test('annotazioni con handle reali OPFS: scrittura confermata, riapertura e conflitto', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'OPFS con API handle complete disponibile nel solo harness Chromium; non testa i picker OS.',
  );
  await page.addInitScript(
    (bytes) => {
      Object.defineProperty(window, 'showOpenFilePicker', {
        configurable: true,
        value: async () => {
          const root = await navigator.storage.getDirectory(),
            handle = await root.getFileHandle('studio.pdf', { create: true });
          if (!(await handle.getFile()).size) {
            const writer = await handle.createWritable();
            await writer.write(new Uint8Array(bytes));
            await writer.close();
          }
          return [handle];
        },
      });
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () =>
          (await navigator.storage.getDirectory()).getFileHandle('studio.annotations.json', {
            create: true,
          }),
      });
    },
    [...boxedQuotePdf()],
  );
  await page.reload();
  await page.getByTestId('button-open-pdf').click();
  await expect(page.getByTestId('reading-box')).toBeVisible();
  await openFiles(page);
  await page.getByRole('button', { name: 'Crea file annotazioni', exact: true }).click();
  await expect(page.getByTestId('annotation-save-status')).toContainText('scrittura confermata');
  await closePanel(page);
  await selectText(
    page,
    page.getByTestId('reading-box').locator('[data-text-start]').first(),
    0,
    24,
  );
  await page.getByRole('button', { name: 'Aggiungi nota', exact: true }).click();
  await page.getByTestId('annotation-note').fill('Nota su file reale');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        return JSON.parse(
          await (await (await root.getFileHandle('studio.annotations.json')).getFile()).text(),
        ).annotations[0]?.note;
      }),
    )
    .toBe('Nota su file reale');
  await page.reload();
  await page.getByTestId('button-reopen-pdf').click();
  await expect(page.getByTestId('annotation-card')).toContainText('Nota su file reale');
  await openFiles(page);
  await page.getByRole('button', { name: 'Ricollega annotazioni', exact: true }).click();
  await closePanel(page);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(),
      handle = await root.getFileHandle('studio.annotations.json');
    const d = JSON.parse(await (await handle.getFile()).text());
    d.revision++;
    d.annotations[0].note = 'Modifica esterna';
    const w = await handle.createWritable();
    await w.write(JSON.stringify(d));
    await w.close();
  });
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  await page.getByTestId('annotation-note').fill('Copia locale');
  await expect(page.getByTestId('annotation-save-status')).toContainText('Scrittura bloccata');
  const external = await page.evaluate(async () =>
    JSON.parse(
      await (
        await (
          await (await navigator.storage.getDirectory()).getFileHandle('studio.annotations.json')
        ).getFile()
      ).text(),
    ),
  );
  expect(external.annotations[0].note).toBe('Modifica esterna');
});
