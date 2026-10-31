import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  FIND_REPLACEMENT_ERROR_MESSAGES, FIND_REPLACEMENT_FAILED_MESSAGE, findReplacementCandidate, JOINED_SESSIONS_LOAD_MESSAGE, JOINED_SESSIONS_URL,
  leaveWaitlist, loadJoinedSessions, previewWithdrawal, UNCONFIRMED_LEAVE_MESSAGE, UNCONFIRMED_WITHDRAWAL_MESSAGE, userLookupUrl,
  WITHDRAWAL_ERROR_MESSAGES, withdrawalPreviewUrl, withdrawFromSession,
} from "@/app/commit/withdrawal-transport";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const getSession = vi.fn();
const fetcher = vi.fn<typeof fetch>();
const sessionId = "11111111-1111-4111-8111-111111111111";
const participationId = "22222222-2222-4222-8222-222222222222";
const withdrawRequest = { sessionId, idempotencyKey: "withdraw-key", replacement: { mode: "OPEN_SLOT" } as const };

describe("UC2-05 withdrawal transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: { access_token: "player-token" } }, error: null });
    vi.mocked(createClient).mockReturnValue({ auth: { getSession } } as unknown as ReturnType<typeof createClient>);
    vi.stubGlobal("fetch", fetcher);
  });
  afterEach(() => vi.unstubAllGlobals());

  test("maps the preview reply to the screen's preview and drops fields it does not show", async () => {
    // Arrange
    fetcher.mockResolvedValueOnce(Response.json({ sessionId, participationId, kind: "AWAITING_REPLACEMENT", refundCents: 0, heldCents: 1250 }));

    // Act
    const result = await previewWithdrawal(sessionId);

    // Assert
    expect(result).toEqual({ status: "ready", preview: { kind: "AWAITING_REPLACEMENT", refundCents: 0, heldCents: 1250 } });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(withdrawalPreviewUrl(sessionId));
    expect(init).toMatchObject({ method: "GET", cache: "no-store", headers: { Authorization: "Bearer player-token" } });
  });

  test.each([
    ["a fractional amount", { sessionId, participationId, kind: "REFUNDED", refundCents: 12.5, heldCents: 1250 }],
    ["an unknown kind", { sessionId, participationId, kind: "FREE", refundCents: 0, heldCents: 0 }],
  ])("rejects a preview with %s instead of showing a wrong refund", async (_name, body) => {
    // Arrange
    fetcher.mockResolvedValueOnce(Response.json(body));

    // Act & Assert
    expect(await previewWithdrawal(sessionId)).toEqual({ status: "error", message: "We couldn't check your refund. Please try again." });
  });

  test("reports a place that has already changed with a player-facing message", async () => {
    // Arrange
    fetcher.mockResolvedValueOnce(Response.json({ error: { code: "INVALID_STATE", message: "Only a committed participant can withdraw" } }, { status: 409 }));

    // Act & Assert
    expect(await previewWithdrawal(sessionId)).toMatchObject({ status: "error", message: expect.stringContaining("already changed") });
  });

  test("sends the withdrawal with its key and choice, and maps the reply", async () => {
    // Arrange
    fetcher.mockResolvedValueOnce(Response.json({ kind: "REFUNDED", sessionId, participationId, refundedCents: 1250, promotion: { status: "NOT_NEEDED" } }));

    // Act
    const result = await withdrawFromSession(withdrawRequest);

    // Assert
    expect(result).toEqual({ status: "withdrawn", kind: "REFUNDED", refundedCents: 1250 });
    const [, init] = fetcher.mock.calls[0]!;
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Bearer player-token", "Content-Type": "application/json" } });
    expect(JSON.parse(init!.body as string)).toEqual(withdrawRequest);
  });

  test.each([
    ["a network failure", () => fetcher.mockRejectedValueOnce(new TypeError("Failed to fetch"))],
    ["a server failure", () => fetcher.mockResolvedValueOnce(Response.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, { status: 500 }))],
    ["an unreadable success", () => fetcher.mockResolvedValueOnce(new Response("<html>", { status: 200 }))],
    ["a success in an unexpected shape", () => fetcher.mockResolvedValueOnce(Response.json({ kind: "REFUNDED" }))],
    ["a gateway timeout (408)", () => fetcher.mockResolvedValueOnce(new Response("Request Timeout", { status: 408 }))],
    ["a rate limit (429)", () => fetcher.mockResolvedValueOnce(Response.json({ error: { code: "RATE_LIMITED", message: "Slow down" } }, { status: 429 }))],
  ])("treats %s as an unconfirmed withdrawal, to be retried with the same request", async (_name, arrange) => {
    // Arrange
    arrange();

    // Act & Assert
    expect(await withdrawFromSession(withdrawRequest)).toEqual({ status: "error", code: expect.any(String), message: UNCONFIRMED_WITHDRAWAL_MESSAGE, unconfirmed: true });
  });

  test.each([
    [409, { error: { code: "SESSION_STARTED", message: "Started" } }, "SESSION_STARTED"],
    [400, "<html>Bad request</html>", "UNEXPECTED_ERROR"],
  ])("treats a %s as a definite rejection", async (status, body, code) => {
    // Arrange
    fetcher.mockResolvedValueOnce(typeof body === "string" ? new Response(body, { status }) : Response.json(body, { status }));

    // Act & Assert
    expect(await withdrawFromSession(withdrawRequest)).toMatchObject({ status: "error", code, unconfirmed: false });
  });

  test("leaves the waitlist with its key and maps the reply", async () => {
    // Arrange
    fetcher.mockResolvedValueOnce(Response.json({ sessionId, participationId, promotion: { status: "DEFERRED" } }));

    // Act & Assert
    expect(await leaveWaitlist({ sessionId, idempotencyKey: "leave-key" })).toEqual({ status: "left" });
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ sessionId, idempotencyKey: "leave-key" });
  });

  test("treats a lost waitlist departure as unconfirmed", async () => {
    // Arrange
    fetcher.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    // Act & Assert
    expect(await leaveWaitlist({ sessionId, idempotencyKey: "leave-key" })).toMatchObject({ message: UNCONFIRMED_LEAVE_MESSAGE, unconfirmed: true });
  });

  test("sends nothing for a signed-out player", async () => {
    // Arrange
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    // Act & Assert
    expect(await withdrawFromSession(withdrawRequest)).toMatchObject({ code: "UNAUTHENTICATED", unconfirmed: false });
    expect(await leaveWaitlist({ sessionId, idempotencyKey: "leave-key" })).toMatchObject({ code: "UNAUTHENTICATED", unconfirmed: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  describe("joined sessions", () => {
    const joined = {
      sessionId, venueName: "Court 3", sport: "Badminton", region: "East",
      startAt: "2026-11-01T10:00:00.000Z", endAt: "2026-11-01T12:00:00.000Z", status: "WAITLISTED", bookingShareCents: 1250,
    };

    test("loads the list as the signed-in player and maps each place", async () => {
      // Arrange
      fetcher.mockResolvedValueOnce(Response.json({ sessions: [{ ...joined, extra: "dropped" }] }));

      // Act
      const sessions = await loadJoinedSessions();

      // Assert
      expect(sessions).toEqual([joined]);
      const [url, init] = fetcher.mock.calls[0]!;
      expect(url).toBe(JOINED_SESSIONS_URL);
      expect(init).toMatchObject({ method: "GET", cache: "no-store", headers: { Authorization: "Bearer player-token" } });
    });

    test.each([
      ["a fractional share", { sessions: [{ ...joined, bookingShareCents: 12.5 }] }],
      ["an unknown status", { sessions: [{ ...joined, status: "WITHDRAWN" }] }],
      ["no list", {}],
    ])("throws on a reply with %s instead of showing a wrong list", async (_name, body) => {
      // Arrange
      fetcher.mockResolvedValueOnce(Response.json(body));

      // Act & Assert
      await expect(loadJoinedSessions()).rejects.toThrow(JOINED_SESSIONS_LOAD_MESSAGE);
    });

    test("throws a player-facing message for a rejection", async () => {
      // Arrange
      fetcher.mockResolvedValueOnce(Response.json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required" } }, { status: 401 }));

      // Act & Assert
      await expect(loadJoinedSessions()).rejects.toThrow(WITHDRAWAL_ERROR_MESSAGES.UNAUTHENTICATED);
    });

    test("throws when the request fails, so a place is never treated as gone", async () => {
      // Arrange
      fetcher.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      // Act & Assert
      await expect(loadJoinedSessions()).rejects.toThrow(JOINED_SESSIONS_LOAD_MESSAGE);
    });
  });

  describe("finding the person to invite by user ID (ADR-0021)", () => {
    const priya = { userId: "55555555-5555-4555-8555-555555555555", handle: "priya_lim", displayName: "Priya Lim" };

    test("looks up the exact user ID as the signed-in player and maps the found player", async () => {
      // Arrange
      fetcher.mockResolvedValueOnce(Response.json({ user: priya }));

      // Act
      const result = await findReplacementCandidate("priya_lim");

      // Assert
      expect(result).toEqual({ status: "found", candidate: priya });
      const [url, init] = fetcher.mock.calls[0]!;
      expect(url).toBe("/api/users/priya_lim");
      expect(init).toMatchObject({ method: "GET", cache: "no-store", headers: { Authorization: "Bearer player-token" } });
    });

    test("reports nobody holding the user ID as not found", async () => {
      // Arrange
      fetcher.mockResolvedValueOnce(Response.json({ error: { code: "NOT_FOUND", message: "No player has this user ID" } }, { status: 404 }));

      // Act & Assert
      expect(await findReplacementCandidate("nobody_here")).toEqual({ status: "not-found" });
    });

    test.each([
      ["lookup unavailable", 503, "USER_IDS_UNAVAILABLE", FIND_REPLACEMENT_ERROR_MESSAGES.USER_IDS_UNAVAILABLE],
      ["a malformed user ID", 400, "INVALID_INPUT", FIND_REPLACEMENT_ERROR_MESSAGES.INVALID_INPUT],
      ["a signed-out player", 401, "UNAUTHENTICATED", WITHDRAWAL_ERROR_MESSAGES.UNAUTHENTICATED],
      ["a server failure", 500, "INTERNAL_ERROR", FIND_REPLACEMENT_FAILED_MESSAGE],
    ])("explains %s", async (_case, status, code, message) => {
      // Arrange
      fetcher.mockResolvedValueOnce(Response.json({ error: { code, message: "server text" } }, { status }));

      // Act & Assert
      expect(await findReplacementCandidate("priya_lim")).toEqual({ status: "error", message });
    });

    test.each([
      ["no player", {}],
      ["an ID that isn't a UUID", { user: { ...priya, userId: "priya" } }],
    ])("never names someone from a reply with %s", async (_case, body) => {
      // Arrange
      fetcher.mockResolvedValueOnce(Response.json(body));

      // Act & Assert
      expect(await findReplacementCandidate("priya_lim")).toEqual({ status: "error", message: FIND_REPLACEMENT_FAILED_MESSAGE });
    });

    test("reports a network failure without naming anyone", async () => {
      // Arrange
      fetcher.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      // Act & Assert
      expect(await findReplacementCandidate("priya_lim")).toEqual({ status: "error", message: FIND_REPLACEMENT_FAILED_MESSAGE });
    });

    test("encodes the user ID in the path", () => {
      expect(userLookupUrl("a/b")).toBe("/api/users/a%2Fb");
    });
  });
});
