import { test, expect } from '@playwright/test';
import { simplePdf } from '../fixtures/pdf-corpus.mjs';

const pdf = simplePdf();
const upload = { name: 'prova.pdf', mimeType: 'application/pdf', buffer: pdf };

test.beforeEach(async ({ page }) => {
  // Il percorso fallback deve essere provato anche quando Chromium offre i picker.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true });
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  await page.goto('/');
});

test('PDF invariato, download e import su contesto pulito (AC-02, AC-18, AC-20, AC-22)', async ({
  page,
  browser,
}) => {
  await expect(page.getByTestId('status-capability')).toContainText('Modalità importazione');
  await page.getByTestId('input-pdf').setInputFiles(upload);
  await expect(page.getByTestId('text-pdf-name')).toHaveText('prova.pdf');
  const originalHash = await page.getByTestId('text-pdf-hash').textContent();
  await page.getByTestId('input-note').fill('La mia nota <script>test</script>\nCaffè 日本語');
  await page.getByTestId('input-page').fill('42');
  await expect(page.getByTestId('status-persistence')).toContainText('Modifiche non esportate');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('button-download-json').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('prova.annotations.json');
  const path = await download.path();
  expect(path).toBeTruthy();
  const original = await page.getByTestId('link-original-pdf').getAttribute('href');
  const originalBytes = await page.evaluate(
    async (url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())],
    original,
  );
  expect(Buffer.from(originalBytes)).toEqual(pdf);

  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const other = await context.newPage();
  await other.goto('/');
  await other.getByTestId('input-pdf').setInputFiles({ ...upload, name: 'rinominato.pdf' });
  await expect(other.getByTestId('button-open-pdf')).toBeEnabled();
  await expect(other.getByTestId('text-pdf-name')).toHaveText('rinominato.pdf');
  await other.getByTestId('input-json').setInputFiles(path!);
  await expect(other.getByTestId('input-note')).toHaveValue(
    'La mia nota <script>test</script>\nCaffè 日本語',
  );
  await expect(other.getByTestId('input-page')).toHaveValue('42');
  await expect(other.getByTestId('text-pdf-hash')).toHaveText(originalHash!);
  expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test('cache e posizione recuperate senza dichiarare il JSON salvato (AC-18, AC-30)', async ({
  page,
}) => {
  await page.getByTestId('input-pdf').setInputFiles(upload);
  await page.getByTestId('input-note').fill('recupero');
  await page.getByTestId('input-page').fill('7');
  await expect(page.getByTestId('status-persistence')).toContainText('Modifiche non esportate');
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await page.getByTestId('input-pdf').setInputFiles(upload);
  await expect(page.getByTestId('input-note')).toHaveValue('recupero');
  await expect(page.getByTestId('input-page')).toHaveValue('7');
  await expect(page.getByTestId('status-persistence')).toContainText(
    'Non equivale al file esterno',
  );
});

test('rifiuta JSON errato e di altro PDF senza perdere la nota (AC-21, AC-24)', async ({
  page,
}) => {
  await page.getByTestId('input-pdf').setInputFiles(upload);
  await page.getByTestId('input-note').fill('da conservare');
  await page
    .getByTestId('input-json')
    .setInputFiles({ name: 'rotto.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(page.getByRole('alert')).toContainText('JSON non valido');
  await expect(page.getByTestId('input-note')).toHaveValue('da conservare');
  const wrong = {
    schema: 'fluido/file-spike',
    version: 1,
    document: { sha256: 'f'.repeat(64), fileName: 'altro.pdf', size: 10 },
    revision: 0,
    draftNote: 'altra',
    position: { page: 1 },
  };
  await page.getByTestId('input-json').setInputFiles({
    name: 'altro.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(wrong)),
  });
  await expect(page.getByRole('alert')).toContainText('PDF diverso');
  await expect(page.getByTestId('input-note')).toHaveValue('da conservare');
});

test('falso PDF non apre una sessione (RF-10)', async ({ page }) => {
  await page.getByTestId('input-pdf').setInputFiles({ ...upload, buffer: Buffer.from('non pdf') });
  await expect(page.getByRole('alert')).toContainText('intestazione PDF');
  await expect(page.getByTestId('input-note')).toHaveCount(0);
});

test('aggiornamento PWA bloccato finché le modifiche non sono conservate', async ({ page }) => {
  await page.getByTestId('input-pdf').setInputFiles(upload);
  await page.getByTestId('input-note').fill('proteggere prima del reload');
  const allowed = await page.evaluate(() =>
    window.dispatchEvent(new Event('fluido:before-update', { cancelable: true })),
  );
  expect(allowed).toBe(false);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('button-download-json').click();
  await downloadPromise;
  await expect(page.getByTestId('status-persistence')).toContainText('Download avviato');
  expect(
    await page.evaluate(() =>
      window.dispatchEvent(new Event('fluido:before-update', { cancelable: true })),
    ),
  ).toBe(true);
});
