import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bt.consent.ui-decided.v1", "1"));
});

test("authenticated user can reach the cached core navigation", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD for the live authenticated smoke test");
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('main[data-client-ready="true"]')).toBeVisible();
  await page.locator("#login-email").fill(email!);
  await page.locator("#login-password").fill(password!);
  await page.getByRole("button", { name: /anmelden/i }).click();
  const outcome = await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 }).then(() => null),
    page
      .getByTestId("auth-message")
      .filter({ hasText: /falsch|fehlgeschlagen|ungültig|nicht bestätigt/i })
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(async () => page.getByTestId("auth-message").innerText()),
  ]);
  expect(outcome, outcome ? `Live-Anmeldung fehlgeschlagen: ${outcome}` : undefined).toBeNull();
  for (const path of ["/dashboard", "/weekly-workout", "/team", "/liga", "/stats"]) {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toHaveAttribute("data-app-booting", "true");
  }
});
