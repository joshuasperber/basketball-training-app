import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type TestSession = {
  accessToken: string;
  refreshToken: string;
  userId: string;
};

async function createTestSession(): Promise<TestSession> {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey!,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    user?: { id?: string };
  };
  expect(response.ok, "Supabase test login succeeds").toBe(true);
  expect(payload.access_token).toBeTruthy();
  expect(payload.refresh_token).toBeTruthy();
  expect(payload.user?.id).toBeTruthy();
  return {
    accessToken: payload.access_token!,
    refreshToken: payload.refresh_token!,
    userId: payload.user!.id!,
  };
}

async function prepareContext(context: BrowserContext, session: TestSession) {
  await context.addCookies([
    {
      name: "sb-access-token",
      value: session.accessToken,
      url: "http://127.0.0.1:3011",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "sb-refresh-token",
      value: session.refreshToken,
      url: "http://127.0.0.1:3011",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(({ activeEmail, userId }) => {
    window.localStorage.setItem("bt.consent.ui-decided.v1", "1");
    window.localStorage.setItem("bt.active-auth-email.v1", activeEmail);
    window.localStorage.setItem("bt.sync-user-id.v1", userId);
  }, { activeEmail: email!, userId: session.userId });
}

async function openAuthenticatedApp(page: Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(
    () => page.evaluate(() => window.localStorage.getItem("bt.cloud-base-snapshot.v1") != null),
    { timeout: 20_000 },
  ).toBe(true);
}

function gameEntry(id: string, points: number) {
  return {
    id,
    date: "2026-09-17",
    context: "game",
    opponentLabel: id,
    minutes: 20,
    points,
    assists: 1,
    rebounds: 2,
    steals: 0,
    createdAt: new Date().toISOString(),
  };
}

async function saveLocalGameStats(page: Page, entries: ReturnType<typeof gameEntry>[]) {
  await page.evaluate((nextEntries) => {
    window.localStorage.setItem("bt.game-stats.v1", JSON.stringify(nextEntries));
    window.dispatchEvent(new Event("bt:game-stats-updated"));
  }, entries);
}

async function readRemoteGameIds(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return [];
    const payload = await response.json() as { gameStats?: string | null };
    try {
      const entries = JSON.parse(payload.gameStats ?? "[]") as Array<{ id?: string }>;
      return entries.flatMap((entry) => typeof entry.id === "string" ? [entry.id] : []);
    } catch {
      return [];
    }
  });
}

test("parallel device changes are merged silently", async ({ browser, page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== "chromium", "Cross-device merge is covered once with two isolated Chromium contexts");
  test.skip(
    !email || !password || !supabaseUrl || !supabaseAnonKey,
    "Set Supabase and E2E credentials for the live authenticated sync test",
  );

  const session = await createTestSession();
  await prepareContext(page.context(), session);
  await openAuthenticatedApp(page);

  const seed = gameEntry("sync-seed", 1);
  await saveLocalGameStats(page, [seed]);
  await expect.poll(() => readRemoteGameIds(page), { timeout: 20_000 }).toContain(seed.id);

  const secondContext = await browser.newContext({ baseURL: "http://127.0.0.1:3011" });
  await prepareContext(secondContext, session);
  const secondPage = await secondContext.newPage();
  try {
    await openAuthenticatedApp(secondPage);
    await expect.poll(async () => secondPage.evaluate(() => {
      const entries = JSON.parse(window.localStorage.getItem("bt.game-stats.v1") ?? "[]") as Array<{ id?: string }>;
      return entries.some((entry) => entry.id === "sync-seed");
    }), { timeout: 15_000 }).toBe(true);

    const laptop = gameEntry("sync-laptop", 12);
    const mobile = gameEntry("sync-mobile", 14);
    // Both devices write from the same base at the same time. The atomic
    // server compare-and-swap lets exactly one write win; the other receives a
    // 409 and transparently retries with the three-way merged snapshot.
    await Promise.all([
      saveLocalGameStats(page, [laptop, seed]),
      saveLocalGameStats(secondPage, [mobile, seed]),
    ]);

    await expect.poll(() => readRemoteGameIds(page), { timeout: 30_000 }).toEqual(
      expect.arrayContaining([seed.id, laptop.id, mobile.id]),
    );
    await expect(page.getByText(/Sync-Konflikt|Sync conflict/i)).toHaveCount(0);
    await expect(secondPage.getByText(/Sync-Konflikt|Sync conflict/i)).toHaveCount(0);
  } finally {
    await secondContext.close();
  }
});
