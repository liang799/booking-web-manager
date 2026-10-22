import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { DomainError, Money } from "@/domain";
import {
  deleteAccount,
  type AccountStanding,
  type DeleteAccountPorts,
  type ProfileSnapshot,
} from "@/use-cases/accounts/delete-account";

const userId = "11111111-1111-4111-8111-111111111111";
const MAX = Number.MAX_SAFE_INTEGER;

type Obligation = "availableBalance" | "heldBalance" | "activeCommitments" | "unsettledOwnedSessions" | "pendingPayouts" | "activeOwnedGroups";

interface Case {
  readonly id: string;
  readonly name: string;
  readonly technique: string;
  /** Money obligations are given in integer cents; counts are plain numbers. */
  readonly standing?: Partial<Record<Obligation, number>>;
  readonly noWallet?: true;
  readonly outcome: "DELETED" | "BLOCKED" | "INVALID_INPUT";
}

// One-variable-at-a-time selection around each obligation's zero boundary. D01 is the
// shared nominal case (nothing outstanding), so it is not repeated for every input.
export const deleteAccountCases: readonly Case[] = [
  { id: "D01", name: "nothing outstanding", technique: "valid EP / shared nominal", outcome: "DELETED" },
  { id: "D02", name: "available balance one cent", technique: "BVA available min+1", standing: { availableBalance: 1 }, outcome: "BLOCKED" },
  { id: "D03", name: "available balance negative", technique: "BVA available min-1", standing: { availableBalance: -1 }, outcome: "INVALID_INPUT" },
  { id: "D04", name: "available balance maximum safe cents", technique: "BVA available max", standing: { availableBalance: MAX }, outcome: "BLOCKED" },
  { id: "D05", name: "held balance one cent", technique: "BVA held min+1", standing: { heldBalance: 1 }, outcome: "BLOCKED" },
  { id: "D06", name: "held balance negative", technique: "BVA held min-1", standing: { heldBalance: -1 }, outcome: "INVALID_INPUT" },
  { id: "D07", name: "one active commitment", technique: "BVA commitments min+1", standing: { activeCommitments: 1 }, outcome: "BLOCKED" },
  { id: "D08", name: "negative commitments", technique: "BVA commitments min-1", standing: { activeCommitments: -1 }, outcome: "INVALID_INPUT" },
  { id: "D09", name: "fractional commitments", technique: "invalid numeric EP", standing: { activeCommitments: 1.5 }, outcome: "INVALID_INPUT" },
  { id: "D10", name: "commitments at maximum safe integer", technique: "BVA commitments max", standing: { activeCommitments: MAX }, outcome: "BLOCKED" },
  { id: "D11", name: "commitments above maximum safe integer", technique: "BVA commitments max+1", standing: { activeCommitments: MAX + 1 }, outcome: "INVALID_INPUT" },
  { id: "D12", name: "one unsettled hosted session", technique: "BVA hosted min+1", standing: { unsettledOwnedSessions: 1 }, outcome: "BLOCKED" },
  { id: "D13", name: "negative unsettled hosted sessions", technique: "BVA hosted min-1", standing: { unsettledOwnedSessions: -1 }, outcome: "INVALID_INPUT" },
  { id: "D14", name: "one pending payout", technique: "BVA payouts min+1", standing: { pendingPayouts: 1 }, outcome: "BLOCKED" },
  { id: "D15", name: "negative pending payouts", technique: "BVA payouts min-1", standing: { pendingPayouts: -1 }, outcome: "INVALID_INPUT" },
  { id: "D16", name: "one unarchived owned group", technique: "BVA groups min+1", standing: { activeOwnedGroups: 1 }, outcome: "BLOCKED" },
  { id: "D17", name: "negative owned groups", technique: "BVA groups min-1", standing: { activeOwnedGroups: -1 }, outcome: "INVALID_INPUT" },
  { id: "D18", name: "owned groups is not a number", technique: "invalid nonfinite EP", standing: { activeOwnedGroups: Number.NaN }, outcome: "INVALID_INPUT" },
  {
    id: "D19", name: "every obligation outstanding", technique: "invalid EP / combined",
    standing: { availableBalance: 500, heldBalance: 900, activeCommitments: 2, unsettledOwnedSessions: 1, pendingPayouts: 1, activeOwnedGroups: 3 },
    outcome: "BLOCKED",
  },
  { id: "D20", name: "invalid fact alongside an outstanding one", technique: "invalid EP / validation precedes blocking", standing: { availableBalance: 500, activeCommitments: -1 }, outcome: "INVALID_INPUT" },
  { id: "D21", name: "wallet never created and nothing outstanding", technique: "valid EP / no wallet", noWallet: true, outcome: "DELETED" },
];

function standingFor(row: Case): AccountStanding {
  const facts = row.standing ?? {};
  return {
    walletId: row.noWallet === true ? null : "22222222-2222-4222-8222-222222222222",
    availableBalance: Money.fromCents(facts.availableBalance ?? 0),
    heldBalance: Money.fromCents(facts.heldBalance ?? 0),
    activeCommitments: facts.activeCommitments ?? 0,
    unsettledOwnedSessions: facts.unsettledOwnedSessions ?? 0,
    pendingPayouts: facts.pendingPayouts ?? 0,
    activeOwnedGroups: facts.activeOwnedGroups ?? 0,
  };
}

/** In-memory ports that record each step and the profile's resulting status. */
function recordingPorts(standing: AccountStanding) {
  const steps: string[] = [];
  const profile = { status: "ACTIVE" as "ACTIVE" | "INACTIVE" };
  const ports: DeleteAccountPorts = {
    loadStanding: async () => {
      steps.push("check");
      return standing;
    },
    deactivateProfile: async (id): Promise<ProfileSnapshot> => {
      steps.push("deactivate");
      profile.status = "INACTIVE";
      return { userId: id, displayName: "Marcus Lim", preferredSports: ["Tennis"], preferredRegions: ["West"] };
    },
    restoreProfile: async () => {
      steps.push("restore");
      profile.status = "ACTIVE";
    },
    deleteLogin: async () => {
      steps.push("delete-login");
    },
  };
  return { ports, steps, profile };
}

const STEPS = {
  DELETED: ["check", "deactivate", "check", "delete-login"],
  BLOCKED: ["check"],
  INVALID_INPUT: ["check"],
} as const;

const observations: unknown[] = [];

describe("Lab 4 / UC1-04 / deleteAccount black-box EP and BVA", () => {
  for (const row of deleteAccountCases) {
    test(`${row.id} ${row.name}`, async () => {
      // Arrange
      const standing = standingFor(row);
      const { ports, steps, profile } = recordingPorts(standing);
      const expected = {
        outcome: row.outcome,
        steps: [...STEPS[row.outcome]],
        profileStatus: row.outcome === "DELETED" ? "INACTIVE" : "ACTIVE",
      };

      // Act
      let outcome: string;
      try {
        const result = await deleteAccount(ports, { userId });
        outcome = result.status;
        if (result.status === "BLOCKED") expect(result.standing).toBe(standing);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        outcome = error.code;
      }
      const actual = { outcome, steps, profileStatus: profile.status };

      // Assert
      observations.push({ id: row.id, name: row.name, technique: row.technique,
        input: { walletId: standing.walletId, ...row.standing }, expected, actual });
      expect(actual).toEqual(expected);
    });
  }
});

afterAll(() => {
  if (!process.env.LAB4_EVIDENCE_DIR) return;
  const directory = path.resolve(process.env.LAB4_EVIDENCE_DIR);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "delete-account-black-box-observations.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), observations }, (_key, value) =>
      typeof value === "number" && !Number.isFinite(value) ? String(value) : value, 2) + "\n");
});
