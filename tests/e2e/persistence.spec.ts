import { test, expect, type Page } from '@playwright/test';
import { openFiles, closePanel, openNotes } from './reader-ui';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { boxedQuotePdf } from '../fixtures/pdf-corpus.mjs';
import { createAnnotations, type AnnotationData } from '../../src/core/annotations';

const pdf = boxedQuotePdf();
const hash = createHash('sha256').update(pdf).digest('hex');
const fallback = async (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
  });
async function open(page: Page) {
  await page
    .getByTestId('input-pdf')
    .setInputFiles({ name: 'studio.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByTestId('reading-box')).toBeVisible();
  await expect(page.getByTestId('text-pdf-hash')).toHaveText(hash);
}
async function cached(page: Page) {
  return page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('fluido-annotations-v1', 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<AnnotationData | undefined>((resolve, reject) => {
        const tx = db.transaction('documents', 'readonly'),
          r = tx.objectStore('documents').get(key);
        tx.oncomplete = () => resolve(r.result?.data as AnnotationData | undefined);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, hash);
}
async function seed(page: Page) {
  const leaf = page.getByTestId('reading-box').locator('[data-text-start]').first();
  const { start, quote } = await leaf.evaluate((el) => ({
    start: Number(el.getAttribute('data-text-start')),
    quote: el.textContent!.slice(0, 24),
  }));
  const d = createAnnotations({ sha256: hash, fileName: 'studio.pdf', size: pdf.length });
  d.annotations = [
    {
      id: 'persistence-note',
      anchor: { page: 1, start, end: start + quote.length, quote, prefix: '', suffix: '' },
      color: 'yellow',
      note: 'Nota v1 precedente',
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    },
  ];
  // Il JSON della Fase 4 non ha un updatedAt radice.
  await page.getByTestId('input-annotations').setInputFiles({
    name: 'studio.annotations.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(d)),
  });
  await expect(page.getByTestId('annotation-card')).toContainText('Nota v1 precedente');
  await expect
    .poll(async () => (await cached(page))?.annotations[0]?.note)
    .toBe('Nota v1 precedente');
}
async function edit(page: Page, note: string) {
  await openNotes(page);
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  await page.getByTestId('annotation-note').fill(note);
}
async function download(page: Page, testId = 'download-annotations') {
  await openFiles(page);
  const waiting = page.waitForEvent('download');
  await page.getByTestId(testId).click();
  const file = await waiting;
  if (testId === 'download-annotations') await closePanel(page);
  return JSON.parse(await readFile((await file.path())!, 'utf8')) as AnnotationData;
}

test.beforeEach(async ({ page }) => {
  await fallback(page);
  await page.goto('/');
});

test('v1, debounce reale, riapertura, export/import su contesto pulito offline', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  await open(page);
  await seed(page);
  await edit(page, 'Cache entro due secondi');
  const start = Date.now();
  await expect
    .poll(async () => (await cached(page))?.annotations[0]?.note, {
      intervals: [50, 100, 150],
      timeout: 2000,
    })
    .toBe('Cache entro due secondi');
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(2000);
  testInfo.annotations.push({ type: 'cache-observed-ms', description: String(elapsed) });
  await expect(page.getByTestId('annotation-unsaved')).toHaveText('Modifiche non esportate.');
  const exported = await download(page);
  expect(exported.updatedAt).toBeTruthy();
  expect(exported.normalization).toBe('fluido-text/2');
  await expect(page.getByTestId('annotation-save-status')).toContainText('Download avviato');
  await page.reload();
  await open(page);
  await expect(page.getByTestId('annotation-card')).toContainText('Cache entro due secondi');
  await expect(page.getByTestId('annotation-save-status')).toContainText('Download manuale');

  const other = await browser.newContext({ baseURL });
  try {
    const second = await other.newPage();
    await fallback(second);
    await second.goto('/');
    await second.evaluate(() => navigator.serviceWorker.ready);
    // registerType prompt non usa clientsClaim: la pagina viene controllata alla navigazione.
    await second.reload();
    await other.setOffline(true);
    await second.reload();
    await open(second);
    await expect(second.getByTestId('annotation-card')).toHaveCount(0);
    await second.getByTestId('input-annotations').setInputFiles({
      name: 'studio.annotations.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exported)),
    });
    await expect(second.getByTestId('annotation-card')).toContainText('Cache entro due secondi');
    expect((await download(second)).annotations).toEqual(exported.annotations);
  } finally {
    await other.close();
  }
});

for (const choice of ['local', 'external'] as const) {
  test(`cache tra due schede: scelta ${choice}, download delle copie e nessun overwrite prima della conferma`, async ({
    page,
  }) => {
    await open(page);
    await seed(page);
    await download(page);
    const second = await page.context().newPage();
    await fallback(second);
    await second.goto('/');
    await open(second);
    await expect(second.getByTestId('annotation-card')).toContainText('Nota v1 precedente');
    // Entrambe le viste hanno completato il ripristino prima delle modifiche.
    await expect.poll(async () => (await cached(second))?.position.page).toBe(1);
    await edit(page, 'Prima scheda conserva questa');
    await expect
      .poll(async () => (await cached(page))?.annotations[0]?.note)
      .toBe('Prima scheda conserva questa');
    await edit(second, 'Seconda scheda conserva questa');
    await expect(second.getByTestId('persistence-conflict')).toContainText('Due copie nel browser');
    await expect(second.getByTestId('reader-persistence-warning')).toBeVisible();
    await second.getByTestId('reader-notes').click();
    await second.getByTestId('reader-focus').click();
    await expect(second.getByTestId('reader-persistence-warning')).toBeVisible();
    await second.getByRole('button', { name: 'Risolvi', exact: true }).click();
    await expect(second.getByTestId('file-panel')).toBeVisible();
    await closePanel(second);
    await second.getByTestId('reader-exit-focus').click();
    expect((await cached(second))?.annotations[0]?.note).toBe('Prima scheda conserva questa');
    expect((await download(second, 'download-conflict-external')).annotations[0]?.note).toBe(
      'Prima scheda conserva questa',
    );
    expect((await download(second)).annotations[0]?.note).toBe('Seconda scheda conserva questa');
    await openFiles(second);
    await expect(second.getByTestId('persistence-conflict')).toBeVisible();
    // Annullare non seleziona una copia.
    second.once('dialog', (dialog) => dialog.dismiss());
    await second.getByTestId(`resolve-conflict-${choice}`).click();
    await expect(second.getByTestId('persistence-conflict')).toBeVisible();
    second.once('dialog', (dialog) => dialog.accept());
    await second.getByTestId(`resolve-conflict-${choice}`).click();
    await expect(second.getByTestId('persistence-conflict')).toHaveCount(0);
    const expected =
      choice === 'local' ? 'Seconda scheda conserva questa' : 'Prima scheda conserva questa';
    await expect(second.getByTestId('annotation-card')).toContainText(expected);
    expect((await download(second)).annotations[0]?.note).toBe(expected);
    expect((await cached(second))?.annotations[0]?.note).toBe(expected);
    await expect(second.getByTestId('annotation-save-status')).toContainText('Download manuale');
  });
}

test('quota durante put: nessun pageerror, cache precedente intatta e download recuperabile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await seed(page);
  await download(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        this.transaction.db.name === 'fluido-annotations-v1' &&
        value?.data?.annotations?.[0]?.note === 'Quota esaurita'
      )
        throw new DOMException('Quota simulata', 'QuotaExceededError');
      return original.call(this, value, key);
    };
  });
  await edit(page, 'Quota esaurita');
  await expect(page.getByTestId('annotation-save-status')).toContainText('Cache non salvata');
  expect((await cached(page))?.annotations[0]?.note).toBe('Nota v1 precedente');
  expect(
    await page.evaluate(() =>
      window.dispatchEvent(new Event('fluido:before-update', { cancelable: true })),
    ),
  ).toBe(false);
  expect((await download(page)).annotations[0]?.note).toBe('Quota esaurita');
  expect(errors).toEqual([]);
});

test('OPFS: scelte esterna/locale, file futuro protetto e download delle due copie', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'OPFS completo nel solo harness Chromium; non certifica selettori e permessi OS.',
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () =>
        (await navigator.storage.getDirectory()).getFileHandle('studio.annotations.json', {
          create: true,
        }),
    });
  });
  await page.reload();
  await open(page);
  await seed(page);
  await openFiles(page);
  await page.getByRole('button', { name: 'Crea file annotazioni', exact: true }).click();
  await expect(page.getByTestId('annotation-save-status')).toContainText('scrittura confermata');
  const mutate = async (note: string, future = false) =>
    page.evaluate(
      async ({ note, future }) => {
        const h = await (
          await navigator.storage.getDirectory()
        ).getFileHandle('studio.annotations.json');
        const d = JSON.parse(await (await h.getFile()).text());
        d.revision += 10;
        d.annotations[0].note = note;
        d.updatedAt = '2026-10-22T15:00:00.000Z';
        if (future) d.version = 99;
        const w = await h.createWritable();
        await w.write(JSON.stringify(d));
        await w.close();
      },
      { note, future },
    );
  const diskNote = () =>
    page.evaluate(
      async () =>
        JSON.parse(
          await (
            await (
              await (
                await navigator.storage.getDirectory()
              ).getFileHandle('studio.annotations.json')
            ).getFile()
          ).text(),
        ).annotations[0].note as string,
    );

  await mutate('Versione esterna');
  await edit(page, 'Versione locale');
  await expect(page.getByTestId('persistence-conflict')).toContainText('Due versioni del JSON');
  expect(await diskNote()).toBe('Versione esterna');
  expect((await download(page, 'download-conflict-external')).annotations[0]?.note).toBe(
    'Versione esterna',
  );
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('resolve-conflict-external').click();
  await expect(page.getByTestId('annotation-card')).toContainText('Versione esterna');
  await expect(page.getByTestId('persistence-conflict')).toHaveCount(0);
  await mutate('Seconda versione esterna');
  await edit(page, 'Seconda versione locale');
  await openFiles(page);
  await expect(page.getByTestId('persistence-conflict')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('resolve-conflict-local').click();
  await expect(page.getByTestId('persistence-conflict')).toHaveCount(0);
  await expect.poll(diskNote).toBe('Seconda versione locale');
  await expect(page.getByTestId('annotation-save-status')).toContainText('scrittura confermata');
  await mutate('File futuro intatto', true);
  await closePanel(page);
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  await page.getByTestId('annotation-note').fill('Recupero locale da schema futuro');
  await expect(page.getByTestId('resolve-conflict-local')).toBeDisabled();
  await expect(page.getByTestId('resolve-conflict-external')).toBeDisabled();
  expect((await download(page, 'download-conflict-external')).version).toBe(99);
  expect((await download(page)).annotations[0]?.note).toBe('Recupero locale da schema futuro');
  expect(await diskNote()).toBe('File futuro intatto');
});
