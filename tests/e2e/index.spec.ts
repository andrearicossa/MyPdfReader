import { test, expect, type Page } from '@playwright/test';
import { outlinedPdf, simplePdf } from '../fixtures/pdf-corpus.mjs';
import { closePanel, openIndex, openNotes } from './reader-ui';

async function open(page: Page, buffer = outlinedPdf()) {
  await page.goto('/');
  await page.getByTestId('input-pdf').setInputFiles({
    name: 'Documento con indice.pdf',
    mimeType: 'application/pdf',
    buffer,
  });
  await expect(page.locator('[data-flow-page]').first()).toBeVisible();
}

test('indice desktop: voci, contesto, salto e posizione conservata', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  // All'apertura: pagina 1, contesto Capitolo 1, pannello chiuso di default.
  await expect(page.getByTestId('reader-index')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('reader-context')).toHaveText('Capitolo 1');
  // Scorrimento interno: l'apertura dell'indice non sposta il testo.
  await page.getByTestId('flow-viewport').evaluate((el) => (el.scrollTop = 120));
  const scrollTop = await page.getByTestId('flow-viewport').evaluate((el) => el.scrollTop);
  await openIndex(page);
  await expect(page.getByTestId('index-aside')).toBeVisible();
  expect(
    Math.abs((await page.getByTestId('flow-viewport').evaluate((el) => el.scrollTop)) - scrollTop),
  ).toBeLessThan(2);
  const entries = page.getByTestId('index-aside').locator('.index-item');
  await expect(entries).toHaveCount(4);
  await expect(entries.nth(0)).toContainText('Capitolo 1');
  await expect(entries.nth(2)).toContainText('Sottosezione 2.1');
  // La voce della pagina corrente è evidenziata senza dichiarare la sottosezione.
  await expect(entries.nth(0).locator('button')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('index-context')).toHaveText('Sei in: Capitolo 1');
  // Salto alla voce Capitolo 3: pagina, contesto ed evidenza si aggiornano.
  await entries.nth(3).getByRole('button').click();
  await expect(page.getByTestId('flow-page')).toHaveValue('3');
  await expect(page.getByTestId('reader-context')).toHaveText('Capitolo 3');
  await expect(entries.nth(3).locator('button')).toHaveAttribute('aria-current', 'page');
  await expect(errors).toEqual([]);
});

test('pagina ambigua: nessuna sezione dichiarata, entrambe le voci evidenziate', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByTestId('flow-page').fill('2');
  await page.getByRole('button', { name: 'Vai', exact: true }).click();
  await expect(page.locator('[data-flow-page="2"]')).toBeVisible();
  // Capitolo 2 e Sottosezione 2.1 partono dalla stessa pagina: il contesto non nomina una sezione.
  await expect(page.getByTestId('reader-context')).toBeHidden();
  await openIndex(page);
  const entries = page.getByTestId('index-aside').locator('.index-item');
  await expect(entries.nth(1)).toHaveClass(/current/);
  await expect(entries.nth(2)).toHaveClass(/current/);
  await expect(page.getByTestId('index-context')).toBeHidden();
  // Lo scorrimento normale aggiorna il contesto: tornando a pagina 3 il Capitolo 3 torna visibile.
  await page.getByRole('button', { name: 'Successiva', exact: true }).click();
  await expect(page.getByTestId('reader-context')).toHaveText('Capitolo 3');
});

test('PDF senza sommario: fallback sull\u2019elenco pagine', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, simplePdf());
  await expect(page.getByTestId('reader-context')).toBeHidden();
  await openIndex(page);
  await expect(page.getByTestId('index-aside')).toContainText('Il PDF non ha un sommario');
  await page.getByTestId('index-aside').getByRole('button', { name: '2', exact: true }).click();
  await expect(page.getByTestId('flow-page')).toHaveValue('2');
  await expect(page.getByTestId('index-aside')).toBeVisible();
  await expect(errors).toEqual([]);
});

test('indice mobile: dialog dedicato, salto con chiusura e nessuna sovrapposizione con le note', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await expect(page.getByTestId('index-aside')).toHaveCount(0);
  await openIndex(page);
  await expect(page.getByTestId('index-panel-dialog')).toBeVisible();
  await expect(page.getByTestId('index-panel-dialog')).toContainText('Capitolo 2');
  // Il dialog resta entro il viewport senza overflow orizzontale.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Apre le note: l'indice si chiude, non restano dialoghi sovrapposti.
  await openNotes(page);
  await expect(page.getByTestId('index-panel-dialog')).not.toBeVisible();
  await expect(page.getByTestId('notes-panel')).toBeVisible();
  await closePanel(page);
  // Il salto dall'indice chiude il dialog e porta alla pagina richiesta.
  await openIndex(page);
  await page
    .getByTestId('index-panel-dialog')
    .getByRole('button', { name: /Capitolo 3/ })
    .click();
  await expect(page.getByTestId('index-panel-dialog')).not.toBeVisible();
  await expect(page.getByTestId('flow-page')).toHaveValue('3');
  await expect(page.getByTestId('reader-index')).toBeFocused();
  await expect(errors).toEqual([]);
});

test('convivenza con le note: un solo pannello sugli schermi intermedi, entrambi larghi', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await open(page);
  await openNotes(page);
  await openIndex(page);
  await expect(page.getByTestId('index-aside')).toBeVisible();
  // Sotto i 1250 px le note cedono lo spazio all'indice.
  await expect(page.getByTestId('annotations-panel')).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('annotations-panel')).toBeVisible();
  await expect(page.getByTestId('index-aside')).toBeVisible();
  // La transizione verso mobile chiude il pannello e al ritorno lo ripristina.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByTestId('reader-index')).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('index-aside')).toBeVisible();
  // La preferenza sopravvive a un ricaricamento con lo stesso documento.
  await page.reload();
  await page.getByTestId('input-pdf').setInputFiles({
    name: 'Documento con indice.pdf',
    mimeType: 'application/pdf',
    buffer: outlinedPdf(),
  });
  await expect(page.getByTestId('index-aside')).toBeVisible();
});

test('Solo lettura chiude l\u2019indice e le annotazioni non si perdono dopo un salto', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await openIndex(page);
  await page.getByTestId('reader-focus').click();
  await expect(page.getByTestId('reader-index')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('index-aside')).not.toBeVisible();
  await page.getByTestId('reader-exit-focus').click();
  await openIndex(page);
  // Una nota creata prima del salto resta al suo posto.
  const leaf = page.locator('[data-flow-page] p').filter({ hasText: 'testo semplice' }).first();
  await expect(leaf).toBeVisible();
  const points = await leaf.evaluate((el) => {
    const node = el.firstChild!;
    const span = Math.min(30, (node.textContent ?? '').length - 1);
    return [0, span].map((at) => {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      const box = range.getBoundingClientRect();
      return { x: box.left + 0.1, y: box.top + box.height / 2 };
    });
  });
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  await page.mouse.move(points[1]!.x, points[1]!.y, { steps: 16 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Aggiungi nota', exact: true }).click();
  await page.locator('#annotation-note').fill('Nota da conservare dopo il salto.');
  await page.getByRole('button', { name: 'Chiudi nota', exact: true }).click();
  await expect(page.getByTestId('reader-notes')).toContainText('1');
  const entries = page.getByTestId('index-aside').locator('.index-item');
  await entries.nth(3).getByRole('button').click();
  await expect(page.getByTestId('flow-page')).toHaveValue('3');
  await entries.nth(0).getByRole('button').click();
  await expect(page.getByTestId('flow-page')).toHaveValue('1');
  await expect(page.getByTestId('reader-notes')).toContainText('1');
  await page.getByTestId('reader-notes').click();
  await expect(page.getByTestId('annotations-panel')).toContainText(
    'Nota da conservare dopo il salto.',
  );
});
