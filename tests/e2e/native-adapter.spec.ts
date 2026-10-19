import { test, expect } from '@playwright/test';

/**
 * Usa veri FileSystemFileHandle e stream del browser nell'OPFS.
 * Sostituisce SOLO i picker OS: NON prova un file esterno o il dialogo permessi
 * del dispositivo. La matrice ADR-001 dichiara esplicitamente questa distinzione.
 */
test('adattatore con handle reali OPFS: scrive, riapre e rileva conflitti', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Harness OPFS per adattatore Chromium; non è un test dei picker OS.',
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle('spike.pdf', { create: true });
        if (!(await handle.getFile()).size) {
          const writer = await handle.createWritable();
          await writer.write('%PDF-1.4\nprova OPFS\n%%EOF');
          await writer.close();
        }
        return [handle];
      },
    });
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory();
        return root.getFileHandle('spike.annotations.json', { create: true });
      },
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('status-capability')).toContainText(
    'Scrittura diretta disponibile',
  );
  await page.getByTestId('button-open-pdf').click();
  await page.getByTestId('button-create-json').click();
  await expect(page.getByTestId('status-persistence')).toContainText('scrittura confermata');
  await page.getByTestId('input-note').fill('persistenza con handle reale');
  await page.getByTestId('input-page').fill('12');
  await expect(page.getByTestId('status-persistence')).toContainText('scrittura confermata');
  const text = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    return (await (await root.getFileHandle('spike.annotations.json')).getFile()).text();
  });
  expect(JSON.parse(text).draftNote).toBe('persistenza con handle reale');
  expect(JSON.parse(text).position.page).toBe(12);
  await page.reload();
  await page.getByTestId('button-reopen-pdf').click();
  await expect(page.getByTestId('input-note')).toHaveValue('persistenza con handle reale');
  await page.getByTestId('button-reconnect').click();
  await expect(page.getByTestId('status-persistence')).toContainText('ricollegato');
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('spike.annotations.json');
    const data = JSON.parse(await (await handle.getFile()).text());
    data.draftNote = 'copia esterna';
    data.revision++;
    const writer = await handle.createWritable();
    await writer.write(JSON.stringify(data));
    await writer.close();
  });
  await page.getByTestId('input-note').fill('copia locale divergente');
  await expect(page.getByTestId('status-persistence')).toContainText('Scrittura bloccata');
  const external = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    return (await (await root.getFileHandle('spike.annotations.json')).getFile()).text();
  });
  expect(JSON.parse(external).draftNote).toBe('copia esterna');
});
