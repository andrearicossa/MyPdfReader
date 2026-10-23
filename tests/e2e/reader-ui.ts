import { expect, type Page } from '@playwright/test';

export async function closePanel(page: Page) {
  for (const id of ['appearance-panel', 'file-panel', 'notes-panel']) {
    if (await page.getByTestId(id).isVisible())
      await page
        .getByTestId(id)
        .getByRole('button', { name: /^Chiudi / })
        .first()
        .click();
  }
}
export async function openFiles(page: Page) {
  if (!(await page.getByTestId('file-panel').isVisible())) {
    await closePanel(page);
    await page.getByTestId('reader-more').click();
  }
}
export async function openNotes(page: Page) {
  await closePanel(page);
  // setViewportSize attende il viewport, non la consegna asincrona di matchMedia.
  // Attendere il pannello mobile reale prima di interpretare aria-expanded.
  const mobile = await page.evaluate(() => matchMedia('(max-width: 900px)').matches);
  await expect(page.getByTestId('notes-panel')).toHaveCount(mobile ? 1 : 0);
  if ((await page.getByTestId('reader-notes').getAttribute('aria-expanded')) !== 'true')
    await page.getByTestId('reader-notes').click();
}
export async function openAppearance(page: Page) {
  await closePanel(page);
  await page.getByTestId('reader-appearance').click();
}
export async function technical(page: Page) {
  await openFiles(page);
  await page.getByText('Dettagli del documento', { exact: true }).click();
  await page.getByRole('button', { name: 'Vista tecnica', exact: true }).click();
}
