import { expect, test } from '@playwright/test';

test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SiteOps/);
});

test('sign-in page loads', async ({ page }) => {
  await page.goto('/auth/sign-in');
  // Assert the form, not the copy. This previously looked for a /sign in/i
  // heading, which the redesign replaced with the "SITEOPS" wordmark — so the
  // test broke on a wording change while the page worked fine. The controls a
  // user must actually find are the real contract, and querying them by label
  // doubles as a check that the inputs stay properly associated.
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /authorize access/i })).toBeVisible();
});

test('app redirects to sign-in when not authenticated', async ({ page }) => {
  await page.goto('/app/dashboard');
  await page.waitForURL(/auth\/sign-in/);
});
