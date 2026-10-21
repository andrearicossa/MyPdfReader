import { test, expect } from '@playwright/test';

test('la schermata spiega la prova e i limiti prima dell’apertura (AC-30)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Il tuo PDF, i tuoi file' })).toBeVisible();
  await expect(page.getByTestId('status-capability')).toBeVisible();
});

test('la schermata funziona offline dopo la prima visita', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Il tuo PDF, i tuoi file' })).toBeVisible();
  await expect(page.getByText('Fase 4', { exact: false }).last()).toBeVisible();
});

test('il cambio tema è immediato e non ricarica la pagina', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', /light|dark/);
  const before = await html.getAttribute('data-theme');
  await page.getByRole('button', { name: /tema/ }).click();
  await expect(html).not.toHaveAttribute('data-theme', before ?? '');
});
