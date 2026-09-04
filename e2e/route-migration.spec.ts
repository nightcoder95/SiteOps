import { expect, test } from '@playwright/test';

// QUARANTINED (2026-09-04, phase 7 follow-up). These specs do not run.
//
// Two independent reasons, both of which need fixing before they can:
//
// 1. They test a REMOVED feature. Every test here starts with self-service
//    sign-up, which SiteOps deliberately disabled — /api/auth/create-profile
//    always returns 410 ("closed / invite-only"); accounts are provisioned by an
//    admin via POST /api/admin/users. The signUp() helper below can never
//    succeed again as written.
//
// 2. They write to the production database. The admin test promoted a user with
//    a direct `db.update(betterAuthUsers)`, and sign-up itself creates real rows
//    in Supabase auth. Playwright's webServer runs `npm run dev`, which loads
//    .env.local — the production connection. There is no non-prod environment in
//    this repo, so no browser test may create or mutate a user until one exists.
//
// The `betterAuthUsers` import was also stale: the app moved from Better Auth to
// Supabase auth + user_profiles, and that export no longer exists. It was a
// module-load error, so it failed the WHOLE e2e run at collection time — which is
// why `npm run test:e2e` has been unusable since phase 3, taking the smoke specs
// down with it. Removing the import is what makes the rest of the suite runnable.
//
// To restore these: seed a dedicated Supervisor and Admin account against a
// non-prod database, load them via a Playwright storageState fixture, and delete
// signUp() rather than repairing it. The assertions below are still correct and
// worth keeping — only the way they obtain a session is wrong.
test.describe('route migration', () => {
  test.skip(
    true,
    'Depends on removed self-service sign-up, and would write to the production database. Needs an auth fixture on a non-prod environment.',
  );

  async function signUp(page, { name, email, password }: { name: string; email: string; password: string }) {
    await page.goto('/auth/sign-up');
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /create account/i }).click();
    await page.waitForURL('/app/dashboard');
  }

  test('logs new route renders and footer navigation works', async ({ page }) => {
    await signUp(page, {
      name: 'Route Supervisor',
      email: 'fixture-supervisor@example.com',
      password: 'Password123!',
    });

    await page.goto('/app/sites');
    await expect(page.getByRole('navigation', { name: /primary app nav/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /active sites/i })).toBeVisible();

    await page.getByRole('link', { name: /quick log/i }).click();
    await expect(page).toHaveURL(/\/app\/logs\/new/);
    await expect(page.getByRole('heading', { name: /pick a category/i })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/app\/sites$/);
    await expect(page.getByRole('heading', { name: /active sites/i })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/app\/logs\/new/);
    await expect(page.getByRole('heading', { name: /pick a category/i })).toBeVisible();
  });

  test('notifications and profile routes render after sign in', async ({ page }) => {
    await signUp(page, {
      name: 'Route Supervisor Two',
      email: 'fixture-supervisor-2@example.com',
      password: 'Password123!',
    });

    await page.goto('/app/notifications');
    await expect(page.getByRole('heading', { name: /unread alerts and actions/i })).toBeVisible();

    await page.goto('/app/profile');
    await expect(page.getByRole('heading', { name: /session and settings/i })).toBeVisible();
  });

  test('admin routes render for an Admin session', async ({ page }) => {
    // Previously promoted the freshly signed-up user with a direct
    // `db.update(betterAuthUsers).set({ role: 'Admin' })`. That write is the
    // single most dangerous line in the suite — it ran against whatever
    // .env.local points at, i.e. production. The replacement is an Admin
    // storageState fixture, NOT a database write from a test.
    await signUp(page, {
      name: 'Route Admin',
      email: 'fixture-admin@example.com',
      password: 'Password123!',
    });

    await page.goto('/app/admin/approvals');
    await expect(page.getByRole('heading', { name: /review queues/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /primary app nav/i })).toBeVisible();

    await page.goto('/app/admin/expenses');
    await expect(page.getByRole('heading', { name: /site spend browser/i })).toBeVisible();
  });
});
