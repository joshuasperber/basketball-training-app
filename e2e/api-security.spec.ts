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

test("team video library requires a session for reads and uploads", async ({ request }) => {
  const teamId = "00000000-0000-4000-8000-000000000001";
  const readResponse = await request.get(`/api/team/videos?teamId=${teamId}`);
  const uploadResponse = await request.post("/api/team/videos", {
    data: {
      action: "prepare",
      teamId,
      title: "Horns",
      category: "offense",
      mimeType: "video/mp4",
      fileSize: 1024,
    },
  });
  expect(readResponse.status()).toBe(401);
  expect(uploadResponse.status()).toBe(401);
});
