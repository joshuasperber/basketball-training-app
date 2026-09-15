import { expect, test } from "@playwright/test";

test("private calendar feed management requires a session", async ({ request }) => {
  const response = await request.post("/api/calendar/feed", { data: { teamId: "00000000-0000-4000-8000-000000000001" } });
  expect(response.status()).toBe(401);
});

test("push subscription management requires a session", async ({ request }) => {
  const response = await request.get("/api/notifications/subscription");
  expect(response.status()).toBe(401);
});

test("notification dispatch requires the cron secret", async ({ request }) => {
  const response = await request.get("/api/notifications/dispatch");
  expect(response.status()).toBe(401);
});
