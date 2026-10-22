import { beforeEach, describe, expect, test, vi } from "vitest";
import { SessionManagementUnavailableError } from "@/app/sessions/session-management-unavailable";

const mocks = vi.hoisted(() => ({
  dependencies: vi.fn(),
  authenticate: vi.fn(),
  joined: vi.fn(),
  invitations: vi.fn(),
}));
vi.mock("@/app/commit/player-sessions-server-dependencies", () => ({
  getPlayerSessionsDependencies: mocks.dependencies,
}));
import { GET as getJoined } from "@/app/api/sessions/joined/route";
import { GET as getInvitations } from "@/app/api/sessions/replacements/route";
import {
  joinedSessionsResponseSchema,
  replacementInvitationsResponseSchema,
} from "@/app/commit/player-sessions-response";
import { openApiDocument } from "@/app/openapi";
import { createPlayerSessionsDependencies } from "@/use-case-config/player-sessions";

const userId = "10000000-0000-4000-8000-000000000001";
const sessionId = "20000000-0000-4000-8000-000000000001";
const startAt = new Date("2026-11-01T10:00:00Z");
const endAt = new Date("2026-11-01T12:00:00Z");
const summary = { sessionId, venueName: "Court", sport: "Badminton", region: "North", startAt, endAt };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticate.mockResolvedValue(userId);
  mocks.joined.mockResolvedValue([{ ...summary, status: "COMMITTED", bookingShareCents: 500 }]);
  mocks.invitations.mockResolvedValue([{ ...summary, bookingShareCents: 500 }]);
  mocks.dependencies.mockResolvedValue({
    authenticate: mocks.authenticate,
    listJoinedSessions: { forParticipant: mocks.joined },
    listReplacementInvitations: { forInvitee: mocks.invitations },
  });
});

/** Any client-supplied user ID is ignored; only the bearer identity counts. */
function request(path: string) {
  return new Request(`http://localhost${path}?userId=forged`, {
    headers: { Authorization: "Bearer trusted" },
  });
}

const routes = [
  { path: "/api/sessions/joined", get: getJoined, list: () => mocks.joined },
  { path: "/api/sessions/replacements", get: getInvitations, list: () => mocks.invitations },
] as const;

describe("GET /api/sessions/joined", () => {
  test("returns the authenticated player's places with ISO times, uncached", async () => {
    const response = await getJoined(request("/api/sessions/joined"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      sessions: [{
        sessionId, venueName: "Court", sport: "Badminton", region: "North",
        startAt: "2026-11-01T10:00:00.000Z", endAt: "2026-11-01T12:00:00.000Z",
        status: "COMMITTED", bookingShareCents: 500,
      }],
    });
    expect(joinedSessionsResponseSchema.parse(body)).toEqual(body);
    expect(mocks.joined).toHaveBeenCalledExactlyOnceWith(userId);
  });
});

describe("GET /api/sessions/replacements", () => {
  test("returns the authenticated player's pending invitations with ISO times, uncached", async () => {
    const response = await getInvitations(request("/api/sessions/replacements"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      invitations: [{
        sessionId, venueName: "Court", sport: "Badminton", region: "North",
        startAt: "2026-11-01T10:00:00.000Z", endAt: "2026-11-01T12:00:00.000Z",
        bookingShareCents: 500,
      }],
    });
    expect(replacementInvitationsResponseSchema.parse(body)).toEqual(body);
    expect(mocks.invitations).toHaveBeenCalledExactlyOnceWith(userId);
  });
});

describe.each(routes)("$path", ({ path, get, list }) => {
  test("returns an empty list when the player has none", async () => {
    list().mockResolvedValue([]);

    const response = await get(request(path));

    expect(response.status).toBe(200);
    expect(Object.values(await response.json())).toEqual([[]]);
  });

  test("requires authentication", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await get(request(path));

    expect(response.status).toBe(401);
    expect(list()).not.toHaveBeenCalled();
  });

  test("keeps infrastructure failures opaque", async () => {
    list().mockRejectedValue(new Error("connection refused at 10.0.0.1"));

    const response = await get(request(path));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });

  test("reports unavailable server settings as 503", async () => {
    mocks.authenticate.mockRejectedValue(new SessionManagementUnavailableError());

    const response = await get(request(path));

    expect(response.status).toBe(503);
  });

  test("without server settings, configuration reports 503 rather than failing", async () => {
    const original = { ...process.env };
    delete process.env.DATABASE_URL;
    try {
      mocks.dependencies.mockResolvedValue(createPlayerSessionsDependencies());

      const response = await get(request(path));

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "SESSION_MANAGEMENT_UNAVAILABLE" },
      });
    } finally {
      process.env = original;
    }
  });

  test("is documented as an authenticated GET", () => {
    const operation = openApiDocument.paths?.[path]?.get;

    expect(operation?.security).toEqual([{ bearerAuth: [] }]);
    expect(Object.keys(operation?.responses ?? {})).toEqual(["200", "401", "500", "503"]);
  });
});
