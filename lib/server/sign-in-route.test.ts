import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { passwordGrant } from "@/lib/server/auth-password-grant";
import { POST } from "@/app/api/auth/sign-in/route";

vi.mock("@/lib/server/auth-password-grant", () => ({ passwordGrant: vi.fn() }));

describe("POST /api/auth/sign-in", () => {
  beforeEach(() => {
    vi.mocked(passwordGrant).mockReset();
  });

  it("does not clear an existing session when credentials are rejected", async () => {
    vi.mocked(passwordGrant).mockResolvedValue({ error: "Invalid login credentials" });
    const request = new NextRequest("https://app.example.com/api/auth/sign-in", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "sb-access-token=still-valid; sb-refresh-token=still-valid-too",
      },
      body: JSON.stringify({ email: "player@example.com", password: "wrong-password" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
