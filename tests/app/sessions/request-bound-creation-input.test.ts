import { describe, expect, test } from "vitest";
import { parseRequestBoundCreateSessionInput } from "@/app/sessions/request-bound-creation-input";
import { sessionCreationErrorResponse } from "@/app/sessions/create-session-response";
import { fingerprintOf } from "@/lib/money/idempotency";
import { LedgerError } from "@/lib/money/errors";

const bookerId = "11111111-1111-4111-8111-111111111111";

function body() {
  return {
    idempotencyKey: "submission",
    booking: {
      venueName: "Jurong East Sports Hall", region: "West", sport: "Badminton",
      startAt: "2030-01-01T10:00:00Z", endAt: "2030-01-01T12:00:00Z", totalCostCents: 1000,
    },
    config: { totalSlots: 4, },
  };
}

describe("UC2-02 API-owned request binding", () => {
  test("keeps submission metadata out of business input", () => {
    const parsed = parseRequestBoundCreateSessionInput(bookerId, body());
    expect(parsed.submission).toEqual({ idempotencyKey: "submission", request: parsed.input });
    expect(parsed.input).not.toHaveProperty("idempotencyKey");
    expect(parsed.input).not.toHaveProperty("request");
    expect(parsed.input.booking.startAt).toEqual(new Date("2030-01-01T10:00:00Z"));
  });

  test("binds authenticated identity and parsed fields, never client-supplied metadata", () => {
    const original = body();
    const forged = {
      ...original, bookerId: "22222222-2222-4222-8222-222222222222",
      request: { bookerId: "attacker" }, fingerprint: "forged",
      submission: { idempotencyKey: "forged", request: {} },
      booking: { ...original.booking, unexpected: "ignored" },
      config: { ...original.config, bookingShareCents: 1 },
    };
    const trusted = parseRequestBoundCreateSessionInput(bookerId, original);
    const parsed = parseRequestBoundCreateSessionInput(bookerId, forged);
    expect(parsed.submission).toEqual(trusted.submission);
    expect(parsed.submission.request.bookerId).toBe(bookerId);
  });

  test("equivalent timestamp offsets and property ordering have the same fingerprint", () => {
    const original = body();
    const equivalent = {
      config: { totalSlots: 4 },
      booking: { ...original.booking, startAt: "2030-01-01T18:00:00+08:00", endAt: "2030-01-01T20:00:00+08:00" },
      idempotencyKey: original.idempotencyKey,
    };
    const first = parseRequestBoundCreateSessionInput(bookerId, original);
    const retry = parseRequestBoundCreateSessionInput(bookerId, equivalent);
    expect(fingerprintOf(retry.submission.request)).toBe(fingerprintOf(first.submission.request));
  });

  test("changing an accepted booking choice changes the fingerprint, not the key", () => {
    const original = body();
    const first = parseRequestBoundCreateSessionInput(bookerId, original);
    const changed = parseRequestBoundCreateSessionInput(bookerId, {
      ...original, config: { ...original.config, pricePerSlotCents: 300 },
    });
    expect(changed.submission.idempotencyKey).toBe(first.submission.idempotencyKey);
    expect(fingerprintOf(changed.submission.request)).not.toBe(fingerprintOf(first.submission.request));
  });

  test.each(["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_IN_FLIGHT"] as const)(
    "maps %s to a safe 409 response", async (code) => {
      const response = sessionCreationErrorResponse(new LedgerError(code, "private-key-and-payload"));
      expect(response.status).toBe(409);
      const result = await response.json();
      expect(result.error.code).toBe(code);
      expect(JSON.stringify(result)).not.toContain("private-key-and-payload");
    },
  );

  test("does not misclassify other persistence failures as request conflicts", async () => {
    const response = sessionCreationErrorResponse(new LedgerError("INVARIANT_VIOLATED", "private-details"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });
});
