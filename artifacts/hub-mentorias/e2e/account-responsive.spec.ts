import { expect, test } from '@playwright/test';

test('authenticated account settings fit on a narrow screen, including nested Clerk routes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.sessionStorage.setItem('hub-mentorias-browser-test-session', 'signed-in');
  });

  await page.goto('/account/security');

  await expect(page.getByRole('heading', { name: 'Minha conta e segurança' })).toBeVisible();
  await expect(page.getByTestId('clerk-user-profile')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar ao painel' })).toHaveAttribute(
    'href',
    '/user-portal',
  );

  const viewport = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(viewport.documentWidth).toBeLessThanOrEqual(viewport.viewportWidth);
});