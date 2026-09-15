import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bt.consent.ui-decided.v1", "1"));
});

test("authenticated user can reach the cached core navigation", async ({ page }) => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD for the live authenticated smoke test");
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('main[data-client-ready="true"]')).toBeVisible();
  await page.locator("#login-email").fill(email!);
  await page.locator("#login-password").fill(password!);
  await page.getByRole("button", { name: /anmelden/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.goto("/liga");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/stats");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
