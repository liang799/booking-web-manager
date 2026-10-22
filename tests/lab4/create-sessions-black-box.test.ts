import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { DomainError } from "@/domain";
import {
  CreateSessions,
  type SessionBooking,
  type SessionConfig,
} from "@/use-cases/sessions/CreateSessions";
import { RequestSessionCreationTransaction } from "@/lib/sessions/request-session-creation-transaction";
import { createTestUser, readyBookerUser } from "../domain/accounts/user-fixtures";
import { CreateSessionUnitOfWork } from "../use-cases/support/create-session-unit-of-work";

const bookerId = "lab4-booker";
const startAt = new Date("2026-11-01T10:00:00.000Z");
const endAt = new Date("2026-11-01T12:00:00.000Z");
const baselineNow = new Date("2026-10-30T10:00:00.000Z");

interface Case {
  readonly id: string;
  readonly name: string;
  readonly technique: string;
  readonly booking?: Partial<SessionBooking>;
  readonly config?: Partial<SessionConfig>;
  readonly now?: Date;
  readonly actor?: "missing" | "inactive" | "no-payout" | "no-email";
  readonly error?: string;
  readonly share?: number;
}

// One-variable-at-a-time robust boundary selection. BB01 is the shared nominal
// representative, so it is not duplicated for every input dimension.
export const blackBoxCases: readonly Case[] = [
  { id: "BB01", name: "nominal defaults and floor division", technique: "valid EP / shared nominal", share: 333 },
  { id: "BB02", name: "capacity just below minimum", technique: "BVA slots min-1", config: { totalSlots: 1 }, error: "INVALID_INPUT" },
  { id: "BB03", name: "capacity at minimum", technique: "BVA slots min", config: { totalSlots: 2 }, share: 500 },
  { id: "BB04", name: "capacity just below maximum", technique: "BVA slots max-1", config: { totalSlots: 29 }, share: 34 },
  { id: "BB05", name: "capacity at maximum", technique: "BVA slots max", config: { totalSlots: 30 }, share: 33 },
  { id: "BB06", name: "capacity just above maximum", technique: "BVA slots max+1", config: { totalSlots: 31 }, error: "INVALID_INPUT" },
  { id: "BB07", name: "capacity is fractional", technique: "invalid numeric EP", config: { totalSlots: 2.5 }, error: "INVALID_INPUT" },
  { id: "BB08", name: "minimum headcount below two", technique: "BVA headcount min-1", config: { minimumHeadcount: 1 }, error: "INVALID_INPUT" },
  { id: "BB09", name: "minimum headcount equals capacity", technique: "BVA headcount min+1/max", config: { minimumHeadcount: 3 }, share: 333 },
  { id: "BB10", name: "minimum headcount exceeds capacity", technique: "BVA headcount max+1", config: { minimumHeadcount: 4 }, error: "INVALID_INPUT" },
  { id: "BB11", name: "minimum headcount is fractional", technique: "invalid numeric EP", config: { minimumHeadcount: 2.5 }, error: "INVALID_INPUT" },
  { id: "BB12", name: "price just below permitted minimum", technique: "BVA price min-1", config: { pricePerSlotCents: 166 }, error: "INVALID_INPUT" },
  { id: "BB13", name: "price at permitted minimum", technique: "BVA price min", config: { pricePerSlotCents: 167 }, share: 167 },
  { id: "BB14", name: "price just above permitted minimum", technique: "BVA price min+1", config: { pricePerSlotCents: 168 }, share: 168 },
  { id: "BB15", name: "price just below permitted maximum", technique: "BVA price max-1", config: { pricePerSlotCents: 665 }, share: 665 },
  { id: "BB16", name: "price at permitted maximum", technique: "BVA price max", config: { pricePerSlotCents: 666 }, share: 666 },
  { id: "BB17", name: "price just above permitted maximum", technique: "BVA price max+1", config: { pricePerSlotCents: 667 }, error: "INVALID_INPUT" },
  { id: "BB18", name: "price has fractional cents", technique: "invalid money EP", config: { pricePerSlotCents: 333.5 }, error: "INVALID_INPUT" },
  { id: "BB19", name: "cost is negative", technique: "invalid money EP", booking: { totalCostCents: -1 }, error: "INVALID_INPUT" },
  { id: "BB20", name: "cost is zero", technique: "BVA cost zero", booking: { totalCostCents: 0 }, error: "INVALID_INPUT" },
  { id: "BB21", name: "cost produces zero share", technique: "BVA effective cost min-1", booking: { totalCostCents: 2 }, error: "INVALID_INPUT" },
  { id: "BB22", name: "cost produces first positive share", technique: "BVA effective cost min", booking: { totalCostCents: 3 }, share: 1 },
  { id: "BB23", name: "cost is just above effective minimum", technique: "BVA effective cost min+1", booking: { totalCostCents: 4 }, share: 1 },
  { id: "BB24", name: "cost is maximum safe integer", technique: "BVA cost max", booking: { totalCostCents: 9007199254740991 }, share: 3002399751580330 },
  { id: "BB25", name: "cost exceeds maximum safe integer", technique: "BVA cost max+1", booking: { totalCostCents: 9007199254740992 }, error: "INVALID_INPUT" },
  { id: "BB26", name: "cost has fractional cents", technique: "invalid money EP", booking: { totalCostCents: 1001.5 }, error: "INVALID_INPUT" },
  { id: "BB27", name: "reliability below zero", technique: "BVA reliability min-1", config: { minimumReliability: -1 }, error: "INVALID_INPUT" },
  { id: "BB28", name: "reliability at zero", technique: "BVA reliability min", config: { minimumReliability: 0 }, share: 333 },
  { id: "BB29", name: "reliability just above zero", technique: "BVA reliability min+1", config: { minimumReliability: 1 }, share: 333 },
  { id: "BB30", name: "reliability just below maximum", technique: "BVA reliability max-1", config: { minimumReliability: 99 }, share: 333 },
  { id: "BB31", name: "reliability at maximum", technique: "BVA reliability max", config: { minimumReliability: 100 }, share: 333 },
  { id: "BB32", name: "reliability above maximum", technique: "BVA reliability max+1", config: { minimumReliability: 101 }, error: "INVALID_INPUT" },
  { id: "BB33", name: "reliability accepts finite fractional scores", technique: "valid fractional EP", config: { minimumReliability: 50.5 }, share: 333 },
  { id: "BB34", name: "reliability is nonfinite", technique: "invalid nonfinite EP", config: { minimumReliability: Number.NaN }, error: "INVALID_INPUT" },
  { id: "BB35", name: "session starts one millisecond in future", technique: "BVA start now+1ms", now: new Date(startAt.getTime() - 1), share: 333 },
  { id: "BB36", name: "session starts now", technique: "BVA start now", now: startAt, error: "SESSION_STARTED" },
  { id: "BB37", name: "session started one millisecond ago", technique: "BVA start now-1ms", now: new Date(startAt.getTime() + 1), error: "SESSION_STARTED" },
  { id: "BB38", name: "booking ends before start", technique: "BVA duration -1ms", booking: { endAt: new Date(startAt.getTime() - 1) }, error: "INVALID_INPUT" },
  { id: "BB39", name: "booking ends at start", technique: "BVA duration zero", booking: { endAt: startAt }, error: "INVALID_INPUT" },
  { id: "BB40", name: "booking lasts one millisecond", technique: "BVA duration +1ms", booking: { endAt: new Date(startAt.getTime() + 1) }, share: 333 },
  { id: "BB41", name: "venue is blank", technique: "invalid text EP", booking: { venueName: " " }, error: "INVALID_INPUT" },
  { id: "BB42", name: "booker is missing", technique: "invalid actor EP", actor: "missing", error: "NOT_FOUND" },
  { id: "BB43", name: "booker is inactive", technique: "invalid account EP", actor: "inactive", error: "INACTIVE_ACCOUNT" },
  { id: "BB44", name: "payout account is missing", technique: "invalid payout EP", actor: "no-payout", error: "PAYOUT_ACCOUNT_NOT_READY" },
  { id: "BB45", name: "booker email is missing", technique: "invalid account EP", actor: "no-email", error: "EMAIL_REQUIRED" },
  { id: "BB46", name: "optional public group and reliability are retained", technique: "valid optional-settings EP", config: { visibility: "PUBLIC", invitedGroupId: "lab4-group", minimumReliability: 75 }, share: 333 },
];

const observations: unknown[] = [];

describe("Lab 4 / UC2-02 / CreateSessions black-box EP and BVA", () => {
  for (const row of blackBoxCases) {
    test(`${row.id} ${row.name}`, async () => {
      // Arrange
      const user = row.actor === "inactive"
        ? createTestUser({ userId: bookerId, accountStatus: "INACTIVE" })
        : row.actor === "no-payout"
          ? createTestUser({ userId: bookerId })
          : row.actor === "no-email"
            ? createTestUser({ userId: bookerId, email: null })
            : readyBookerUser(bookerId);
      const unitOfWork = new CreateSessionUnitOfWork(row.actor === "missing" ? [] : [user]);
      let sequence = 0;
      const subject = new CreateSessions({
        transaction: new RequestSessionCreationTransaction(unitOfWork, { idempotencyKey: row.id }),
        clock: { now: () => row.now ?? baselineNow },
        ids: { next: () => `lab4-generated-${++sequence}` },
        holdingAccountId: "lab4-platform",
      });
      const booking: SessionBooking = {
        venueName: "Jurong East Sports Hall", region: "West", sport: "Badminton",
        startAt, endAt, totalCostCents: 1001, ...row.booking,
      };
      const config: SessionConfig = { totalSlots: 3, minimumHeadcount: 2, ...row.config };
      const expected = row.error
        ? { outcome: "rejected", error: row.error, persistedSessions: 0 }
        : { outcome: "created", shareCents: row.share, persistedSessions: 1 };

      // Act: capture the public response for the lab's expected/actual evidence.
      let actual: object;
      try {
        const result = await subject.forBooker(bookerId, booking, config);
        actual = { outcome: "created", shareCents: result.bookingShareCents, persistedSessions: unitOfWork.sessions.size };
        const session = unitOfWork.requireSession(result.sessionId);
        expect(session.totalSlots).toBe(config.totalSlots);
        expect(session.minimumHeadcount).toBe(config.minimumHeadcount);
        expect(session.visibility).toBe(config.visibility ?? "PRIVATE");
        expect(session.minimumReliability?.toNumber()).toBe(config.minimumReliability);
        expect(session.invitedGroupId).toBe(config.invitedGroupId);
        expect(result.sessionId).toBe("lab4-generated-1");
        expect(result.roomToken).toBe("lab4-generated-2");
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        actual = { outcome: "rejected", error: error.code, persistedSessions: unitOfWork.sessions.size };
      }

      // Assert
      observations.push({ id: row.id, name: row.name, technique: row.technique,
        input: { bookerId, actor: row.actor ?? "ready", booking, config, now: row.now ?? baselineNow },
        expected, actual });
      expect(actual).toEqual(expected);
      expect(unitOfWork.ledgerInstructions).toEqual([]);
      expect(unitOfWork.payoutRequests).toEqual([]);
    });
  }
});

afterAll(() => {
  if (!process.env.LAB4_EVIDENCE_DIR) return;
  const directory = path.resolve(process.env.LAB4_EVIDENCE_DIR);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "testing-black-box-observations.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), observations }, (_key, value) =>
      typeof value === "number" && !Number.isFinite(value) ? String(value) : value, 2) + "\n");
});
