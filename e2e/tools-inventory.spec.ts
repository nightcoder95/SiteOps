import { expect, test } from "@playwright/test";

// Tools Inventory is Admin-only in v1. New sign-ups are Supervisors, so the
// runnable coverage here is the negative gate (Supervisor must not reach the
// hub, RLS/authz). The Admin happy-path specs below require an Admin auth
// fixture (a user whose JWT carries user_role=Admin — provisioned + token
// refreshed); they are skipped until that fixture exists in the e2e harness.

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUpSupervisor(page: import("@playwright/test").Page) {
  await page.goto("/auth/sign-up");
  await page.getByLabel("Name").fill("Tools Supervisor");
  await page.getByLabel("Email").fill(uniqueEmail("supervisor"));
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("/app/dashboard");
}

test.describe("Tools Inventory — authz gate (Supervisor)", () => {
  test("Supervisor is 404'd from the Company Tools hub", async ({ page }) => {
    await signUpSupervisor(page);
    const res = await page.goto("/app/tools");
    expect(res?.status()).toBe(404);
  });

  test("Supervisor does not see the Company Tools tile on the dashboard", async ({ page }) => {
    await signUpSupervisor(page);
    await page.goto("/app/dashboard");
    await expect(page.getByText(/company tools/i)).toHaveCount(0);
  });

  test("Supervisor GET /api/tools is forbidden (403)", async ({ page }) => {
    await signUpSupervisor(page);
    const res = await page.request.get("/api/tools");
    expect(res.status()).toBe(403);
  });
});

// ── Admin happy-path (requires an Admin auth fixture — see file header) ───────
test.describe("Tools Inventory — Admin flows", () => {
  test.skip(true, "Requires an Admin auth fixture (JWT user_role=Admin).");

  test("assign flow: deploy a tool to a site and see free decrease", async () => {
    // 1. Sign in as Admin, go to /app/tools.
    // 2. Expand a tool row, add a site with qty 3, Save Changes.
    // 3. Expect the free badge to decrease by 3 and a success toast.
  });

  test("over-assign is blocked with an inline message", async () => {
    // Set a site qty above total → panel shows "Over-assigned"; Save is guarded.
  });

  test("stale save shows a conflict banner and refreshes values", async () => {
    // Two contexts edit the same tool at the same version; the second save
    // returns status:conflict and the row shows the amber "changed by someone
    // else" banner with server values.
  });

  test("catalog CTA deep-links to the Tools sub-tab", async ({ page }) => {
    await page.goto("/app/admin/catalog?tab=tools");
    await expect(page.getByRole("button", { name: "Tools" })).toHaveClass(/bg-primary/);
  });

  test("ledger drawer shows movements", async () => {
    // Open a tool's History → drawer lists opening/assign/return movements.
  });

  test("Home tile navigates to the hub", async ({ page }) => {
    await page.goto("/app/dashboard");
    await page.getByText(/company tools/i).click();
    await expect(page).toHaveURL(/\/app\/tools/);
  });
});
