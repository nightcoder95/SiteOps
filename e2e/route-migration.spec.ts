import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { betterAuthUsers } from '@/lib/db/schema';

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page, { name, email, password }: { name: string; email: string; password: string }) {
  await page.goto('/auth/sign-up');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/app/dashboard');
}

test('forms flow routes render and footer navigation works', async ({ page }) => {
  await signUp(page, {
    name: 'Route Supervisor',
    email: uniqueEmail('supervisor'),
    password: 'Password123!',
  });

  await page.goto('/app/sites');
  await expect(page.getByRole('navigation', { name: /primary app nav/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /active sites/i })).toBeVisible();

  await page.getByRole('link', { name: /quick log/i }).click();
  await expect(page).toHaveURL(/\/app\/forms\/site/);
  await expect(page.getByRole('heading', { name: /select a site/i })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/app\/sites$/);
  await expect(page.getByRole('heading', { name: /active sites/i })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/app\/forms\/site/);
  await expect(page.getByRole('heading', { name: /select a site/i })).toBeVisible();
});

test('notifications and profile routes render after sign up', async ({ page }) => {
  await signUp(page, {
    name: 'Route Supervisor Two',
    email: uniqueEmail('notifications'),
    password: 'Password123!',
  });

  await page.goto('/app/notifications');
  await expect(page.getByRole('heading', { name: /unread alerts and actions/i })).toBeVisible();

  await page.goto('/app/profile');
  await expect(page.getByRole('heading', { name: /session and settings/i })).toBeVisible();
});

test('admin routes render after role promotion', async ({ page }) => {
  const email = uniqueEmail('admin');

  await signUp(page, {
    name: 'Route Admin',
    email,
    password: 'Password123!',
  });

  await db
    .update(betterAuthUsers)
    .set({ role: 'Admin', updatedAt: new Date() })
    .where(eq(betterAuthUsers.email, email));

  await page.goto('/app/admin/approvals');
  await expect(page.getByRole('heading', { name: /review queues/i })).toBeVisible();
  await expect(page.getByRole('navigation', { name: /primary app nav/i })).toBeVisible();

  await page.goto('/app/admin/expenses');
  await expect(page.getByRole('heading', { name: /site spend browser/i })).toBeVisible();
});
