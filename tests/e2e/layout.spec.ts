import { test, expect, type Page } from '@playwright/test';
import { boxedQuotePdf, makePdf, text } from '../fixtures/pdf-corpus.mjs';
import { openAppearance, openFiles, closePanel, openNotes } from './reader-ui';
import { createAnnotations } from '../../src/core/annotations';
import { createHash } from 'node:crypto';

async function open(page: Page, buffer = boxedQuotePdf()) {
  await page.goto('/');
  await page.getByTestId('input-pdf').setInputFiles({
    name: 'Documento molto lungo per provare il titolo locale.pdf',
    mimeType: 'application/pdf',
    buffer,
  });
  await expect(page.locator('[data-flow-page]').first()).toBeVisible();
}
async function fit(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const bounds = await page.locator(selector).boundingBox();
    const viewport = page.viewportSize()!;
    expect(bounds, selector).toBeTruthy();
    expect(bounds!.x, selector).toBeGreaterThanOrEqual(-1);
    expect(bounds!.y, selector).toBeGreaterThanOrEqual(-1);
    expect(bounds!.x + bounds!.width, selector).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds!.y + bounds!.height, selector).toBeLessThanOrEqual(viewport.height + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function contrast(page: Page, scope: string, selector: string) {
  const measured = await page.locator(scope).evaluate((root, selector) => {
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const light = (a: number[]) =>
      a
        .slice(0, 3)
        .map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    return [...root.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        let parent: HTMLElement | null = el,
          background = [255, 255, 255];
        while (parent) {
          const color = rgb(getComputedStyle(parent).backgroundColor);
          if (color.length === 3 || color[3] === 1) {
            background = color;
            break;
          }
          parent = parent.parentElement;
        }
        const foreground = light(rgb(getComputedStyle(el).color)),
          back = light(background);
        return {
          text: el.textContent?.trim().slice(0, 60),
          ratio: (Math.max(foreground, back) + 0.05) / (Math.min(foreground, back) + 0.05),
        };
      });
  }, selector);
  expect(measured.length).toBeGreaterThan(0);
  for (const m of measured) expect(m.ratio, `${m.text}: contrasto`).toBeGreaterThanOrEqual(4.5);
}

test('layout reale: note desktop, modali mobile, resize completo e preferenza locale', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(page.getByTestId('annotations-panel')).toBeVisible();
  await fit(page, [
    '.reader-topbar',
    '.flow-toolbar',
    '.reader-actions',
    '.flow-viewport',
    '.annotations-panel',
  ]);
  await page.getByRole('button', { name: 'Chiudi annotazioni', exact: true }).click();
  await expect(page.getByTestId('reader-notes')).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 375, height: 812 });
  await fit(page, ['.reader-topbar', '.flow-toolbar', '.reader-actions', '.flow-viewport']);
  await openNotes(page);
  await expect(page.getByTestId('notes-panel')).toBeVisible();
  await expect(page.getByTestId('reader-notes')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('notes-panel')).not.toBeVisible();
  await expect(page.getByTestId('reader-notes')).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('annotations-panel')).not.toBeVisible();
  await expect(page.getByTestId('reader-notes')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('preferences-status')).toContainText('Preferenze salvate');
  await page.reload();
  await page
    .getByTestId('input-pdf')
    .setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: boxedQuotePdf() });
  await expect(page.getByTestId('reading-box')).toBeVisible();
  await expect(page.getByTestId('reader-notes')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('reader-notes').click();
  await expect(page.getByTestId('annotations-panel')).toBeVisible();
});

test('Aspetto, focus trap, sfondo, Escape e Solo lettura reversibile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 500 });
  await open(page);
  await openAppearance(page);
  await fit(page, ['[data-testid="appearance-panel"]']);
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page
        .getByTestId('appearance-panel')
        .evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.getByTestId('reading-size').focus();
  await page.keyboard.press('End');
  await expect(page.getByTestId('reading-size')).toHaveValue('32');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reader-appearance')).toBeFocused();
  await page.getByTestId('reader-focus').click();
  await expect(page.getByTestId('reader-exit-focus')).toBeVisible();
  await expect(page.locator('.reader-topbar')).not.toBeVisible();
  await expect(page.getByTestId('annotations-panel')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.reader-topbar')).toBeVisible();
  await expect(page.getByTestId('annotations-panel')).toBeVisible();
  await openAppearance(page);
  await page.mouse.click(20, 100);
  await expect(page.getByTestId('appearance-panel')).not.toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await openFiles(page);
  await page
    .getByTestId('file-panel')
    .getByRole('button', { name: 'Solo lettura', exact: true })
    .click();
  await expect(page.getByTestId('reader-exit-focus')).toBeVisible();
  await page.getByTestId('reader-exit-focus').click();
  await fit(page, ['.reader-actions', '.flow-toolbar']);
  expect(errors).toEqual([]);
});

test('chiusura e riapertura delle note non spostano il testo letto', async ({ page }) => {
  const content = Array.from({ length: 42 }, (_, i) =>
    text(
      `Riga ${i + 1}: un paragrafo lungo per provare il punto di lettura e i pannelli.`,
      52,
      760 - i * 16,
    ),
  ).join('\n');
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, makePdf([content, content]));
  const viewport = page.getByTestId('flow-viewport');
  await viewport.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  // Attendere lo scroll nativo prima di catturare il punto.
  await viewport.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        let old = el.scrollTop,
          stable = 0;
        const frame = () => {
          stable = Math.abs(old - el.scrollTop) < 0.1 ? stable + 1 : 0;
          old = el.scrollTop;
          if (stable >= 5) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  const visibleText = async () =>
    viewport.evaluate((el) => {
      const top = el.getBoundingClientRect().top + 12;
      const leaves = [...el.querySelectorAll<HTMLElement>('[data-text-start]')];
      const leaf = leaves.find((n) => n.getBoundingClientRect().bottom > top)!;
      const r = leaf.getBoundingClientRect();
      return (top - r.top) / r.height;
    });
  const before = await visibleText();
  await page.getByTestId('reader-notes').click();
  await expect.poll(async () => Math.abs((await visibleText()) - before)).toBeLessThan(0.06);
  await page.getByTestId('reader-focus').click();
  await expect.poll(async () => Math.abs((await visibleText()) - before)).toBeLessThan(0.06);
  await page.getByTestId('reader-exit-focus').click();
  await expect.poll(async () => Math.abs((await visibleText()) - before)).toBeLessThan(0.06);
  await page.getByTestId('reader-notes').click();
  await expect.poll(async () => Math.abs((await visibleText()) - before)).toBeLessThan(0.06);
});

test('font self-hosted e tre temi anche offline, pannelli senza overflow', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page
    .getByTestId('input-pdf')
    .setInputFiles({ name: 'offline.pdf', mimeType: 'application/pdf', buffer: boxedQuotePdf() });
  await expect(page.getByTestId('reading-box')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('20px "Source Serif 4"'))).toBe(true);
  await openAppearance(page);
  for (const theme of ['light', 'dark', 'sepia']) {
    await page.getByTestId('reading-theme').selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await fit(page, ['[data-testid="appearance-panel"]']);
    await contrast(page, '[data-testid="appearance-panel"]', 'label, p, button');
    await closePanel(page);
    await contrast(
      page,
      '.fluid-reader',
      '.reader-title h1, .reader-save, .reader-tool, .flow-toolbar button, .flow-toolbar label, .page-total',
    );
    await openNotes(page);
    await fit(page, ['[data-testid="notes-panel"]']);
    await closePanel(page);
    await openAppearance(page);
  }
});

test('note lunghe: scroll indipendente, editor riapribile e Vai al passaggio mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const buffer = boxedQuotePdf();
  const leaf = page.getByTestId('reading-box').locator('[data-text-start]').first();
  const anchor = await leaf.evaluate((el) => {
    const start = Number(el.getAttribute('data-text-start'));
    return {
      page: 1,
      start,
      end: start + 24,
      quote: el.textContent!.slice(0, 24),
      prefix: '',
      suffix: '',
    };
  });
  const data = createAnnotations({
    sha256: createHash('sha256').update(buffer).digest('hex'),
    fileName: 'a.pdf',
    size: buffer.length,
  });
  data.annotations = Array.from({ length: 24 }, (_, i) => ({
    id: `layout-${i}`,
    anchor,
    color: 'yellow',
    note: i ? `Nota ${i + 1}` : 'Nota lunga e leggibile.\n'.repeat(200),
    createdAt: '2026-10-23T10:00:00.000Z',
    updatedAt: '2026-10-23T10:00:00.000Z',
  }));
  await openFiles(page);
  await page.getByTestId('input-annotations').setInputFiles({
    name: 'a.annotations.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByTestId('annotation-card')).toHaveCount(24);
  await closePanel(page);
  const rootTop = await page.getByTestId('flow-viewport').evaluate((el) => el.scrollTop);
  await page.locator('.annotations-content').hover();
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => page.locator('.annotations-content').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100);
  expect(await page.getByTestId('flow-viewport').evaluate((el) => el.scrollTop)).toBe(rootTop);
  await page
    .getByTestId('annotation-card')
    .first()
    .getByRole('button', { name: 'Modifica', exact: true })
    .click();
  await expect(page.getByTestId('annotation-note')).toHaveValue(data.annotations[0]!.note);
  await page.getByRole('button', { name: 'Chiudi annotazioni', exact: true }).click();
  await page.locator('mark').first().click();
  await expect(page.getByTestId('annotation-note')).toBeVisible();
  await expect(page.getByTestId('reader-notes')).toHaveAttribute('aria-expanded', 'true');
  await page.setViewportSize({ width: 375, height: 812 });
  await openNotes(page);
  await page.getByRole('button', { name: 'Chiudi nota', exact: true }).click();
  await page
    .getByTestId('annotation-card')
    .first()
    .getByRole('button', { name: 'Vai al passaggio', exact: true })
    .click();
  await expect(page.getByTestId('notes-panel')).not.toBeVisible();
  await expect(page.getByTestId('flow-viewport')).toBeFocused();
  await expect(page.locator('mark').first()).toBeInViewport();
});

test('menu reale: Vista tecnica, selettore standard, PDF errato e cambio documento', async ({
  page,
}) => {
  await open(page);
  await openFiles(page);
  await page.getByText('Dettagli del documento', { exact: true }).click();
  await page.getByRole('button', { name: 'Vista tecnica', exact: true }).click();
  await expect(page.getByTestId('engine-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Lettura fluida', exact: true }).click();
  await expect(page.getByTestId('reading-box')).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await openFiles(page);
  const invalid = page.waitForEvent('filechooser');
  await page
    .getByTestId('file-panel')
    .getByRole('button', { name: 'Usa selettore standard', exact: true })
    .click();
  await (
    await invalid
  ).setFiles({
    name: 'errato.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('Non è un PDF'),
  });
  await expect(page.getByTestId('status-error')).toBeVisible();
  await expect(page.getByTestId('reading-box')).toBeVisible();
  await openFiles(page);
  const valid = page.waitForEvent('filechooser');
  await page
    .getByTestId('file-panel')
    .getByRole('button', { name: 'Usa selettore standard', exact: true })
    .click();
  await (
    await valid
  ).setFiles({
    name: 'Secondo documento.pdf',
    mimeType: 'application/pdf',
    buffer: makePdf([text('Secondo documento, seconda lettura', 52, 720)]),
  });
  await expect(page.locator('.reader-title h1')).toHaveText('Secondo documento.pdf');
  await expect(page.getByTestId('status-error')).not.toBeVisible();
  await expect(page.getByTestId('reading-box')).toHaveCount(0);
  await expect(page.locator('.flow-prose')).toContainText('Secondo documento');
});
