import { test, expect } from '@playwright/test';

test('la shell si carica e mostra lo stato di libreria vuota', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'La libreria è vuota' })).toBeVisible();
  await expect(page.getByText('Fluido · lettore PDF')).toBeVisible();
});

test('la shell funziona offline grazie al service worker', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'La libreria è vuota' })).toBeVisible();

  // Attende che il service worker sia attivo, poi ricarica: dalla seconda
  // navigazione la pagina è servita e controllata dal service worker.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'La libreria è vuota' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'La libreria è vuota' })).toBeVisible();
  await expect(page.getByText('Fase 0')).toBeVisible();
});

test('il cambio tema è immediato e non ricarica la pagina', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  // Il tema iniziale segue la preferenza di sistema.
  await expect(html).toHaveAttribute('data-theme', /light|dark/);
  const before = await html.getAttribute('data-theme');
  await page.getByRole('button', { name: /tema/ }).click();
  // Attesa con retry: l'aggiornamento dell'attributo avviene in modo asincrono.
  await expect(html).not.toHaveAttribute('data-theme', before ?? '');
});
