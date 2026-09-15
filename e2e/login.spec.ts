import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bt.consent.ui-decided.v1", "1"));
});

async function settleLogin(page: import("@playwright/test").Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('main[data-client-ready="true"]')).toBeVisible();
}

test("login offers clear inline validation without layout overflow", async ({ page }) => {
  await page.goto("/login");
  await settleLogin(page);

  const email = page.locator("#login-email");
  await email.fill("not-an-email");
  await page.locator("#login-password").click();
  await expect(page.getByText("Bitte prüfe das Format deiner E-Mail-Adresse.")).toBeVisible();

  await email.fill("player@example.com");
  await page.locator("#login-password").click();
  await expect(page.getByText("E-Mail-Adresse sieht gut aus.")).toBeVisible();

  const password = page.locator("#login-password");
  await password.fill("123");
  await email.click();
  await expect(page.getByText("Das Passwort muss mindestens 6 Zeichen lang sein.")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("login page has no serious automatic accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await settleLogin(page);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
});

test("protected pages return users to login and preserve the destination", async ({ page }) => {
  await page.goto("/liga");
  await expect(page).toHaveURL(/\/login\?.*next=%2Fliga/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("primary mobile controls have comfortable touch height", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile-only assertion");
  await page.goto("/login");
  await settleLogin(page);
  const undersized = await page.locator("button.btn").evaluateAll((buttons) => buttons
    .map((button) => ({ label: button.textContent?.trim(), height: button.getBoundingClientRect().height, className: button.className }))
    .filter((button) => button.height < 40));
  expect(undersized, JSON.stringify(undersized, null, 2)).toEqual([]);
});

test("wrong login details show a clear generic message", async ({ page }) => {
  await page.route("**/api/auth/sign-in", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: "invalid_credentials" }),
  }));
  await page.goto("/login");
  await settleLogin(page);
  await page.locator("#login-email").fill("player@example.com");
  await page.locator("#login-password").fill("not-the-password");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByText("Passwort oder E-Mail-Adresse sind falsch.")).toBeVisible();
});

test("new accounts continue directly with email confirmation", async ({ page }) => {
  await page.route("**/api/auth/signup", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ needsEmailConfirmation: true }),
  }));
  await page.goto("/login");
  await settleLogin(page);
  await page.locator("#login-email").fill("new-player@example.com");
  await page.locator("#login-password").fill("strong-password");
  await page.locator("#login-email").click();
  await expect(page.getByText("Passwortlänge passt.")).toBeVisible();
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Konto anlegen (Passwort)", exact: true }).click();
  await expect(page.getByText(/Account angelegt!/)).toBeVisible();
  await expect(page.getByPlaceholder("123456 oder 12345678")).toBeVisible();
});
