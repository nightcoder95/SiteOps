import { expect, test } from '@playwright/test';

test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SiteOps/);
});

test('sign-in page loads', async ({ page }) => {
  await page.goto('/auth/sign-in');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});

test('app redirects to sign-in when not authenticated', async ({ page }) => {
  await page.goto('/app/dashboard');
  await page.waitForURL(/auth\/sign-in/);
});
