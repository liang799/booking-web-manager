import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { DomainError } from "@/domain";
import type { ProfileChanges } from "@/domain/accounts/profile";
import type { AccountStatus } from "@/domain/shared/statuses";
import { UpdateProfile, type ProfileStore } from "@/use-cases/accounts/update-profile";

const userId = "11111111-1111-4111-8111-111111111111";
const SIXTY = "A".repeat(60);
const ALL_SPORTS = ["Badminton", "Basketball", "Football", "Futsal", "Tennis", "Volleyball"];
const ALL_REGIONS = ["Central", "East", "North", "North-East", "West"];

interface Case {
  readonly id: string;
  readonly name: string;
  readonly technique: string;
  readonly input?: Partial<ProfileChanges>;
  readonly account?: AccountStatus | "missing";
  /** The saved changes, or the rejection code. */
  readonly saved?: ProfileChanges;
  readonly error?: string;
}

const nominal: ProfileChanges = { displayName: "Marcus Lim", preferredSports: ["Badminton"], preferredRegions: ["West"] };

// One-variable-at-a-time selection. P01 is the shared nominal case.
export const updateProfileCases: readonly Case[] = [
  { id: "P01", name: "nominal profile", technique: "valid EP / shared nominal", saved: nominal },
  { id: "P02", name: "name of one character", technique: "BVA name min", input: { displayName: "A" }, saved: { ...nominal, displayName: "A" } },
  { id: "P03", name: "empty name", technique: "BVA name min-1", input: { displayName: "" }, error: "INVALID_INPUT" },
  { id: "P04", name: "name of spaces only", technique: "invalid EP / trimmed to empty", input: { displayName: "   " }, error: "INVALID_INPUT" },
  { id: "P05", name: "name of 59 characters", technique: "BVA name max-1", input: { displayName: SIXTY.slice(1) }, saved: { ...nominal, displayName: SIXTY.slice(1) } },
  { id: "P06", name: "name of 60 characters", technique: "BVA name max", input: { displayName: SIXTY }, saved: { ...nominal, displayName: SIXTY } },
  { id: "P07", name: "name of 61 characters", technique: "BVA name max+1", input: { displayName: `${SIXTY}A` }, error: "INVALID_INPUT" },
  { id: "P08", name: "60 characters inside surrounding spaces", technique: "valid EP / trimmed to max", input: { displayName: `  ${SIXTY}  ` }, saved: { ...nominal, displayName: SIXTY } },
  { id: "P09", name: "no sports", technique: "BVA sports min-1", input: { preferredSports: [] }, error: "INVALID_INPUT" },
  { id: "P10", name: "every supported sport", technique: "BVA sports max", input: { preferredSports: ALL_SPORTS }, saved: { ...nominal, preferredSports: ALL_SPORTS } },
  { id: "P11", name: "unsupported sport", technique: "invalid EP / not in list", input: { preferredSports: ["Golf"] }, error: "INVALID_INPUT" },
  { id: "P12", name: "sport in the wrong case", technique: "invalid EP / exact match", input: { preferredSports: ["tennis"] }, error: "INVALID_INPUT" },
  { id: "P13", name: "repeated sport", technique: "valid EP / duplicates removed", input: { preferredSports: ["Tennis", "Tennis"] }, saved: { ...nominal, preferredSports: ["Tennis"] } },
  { id: "P14", name: "no regions", technique: "BVA regions min-1", input: { preferredRegions: [] }, error: "INVALID_INPUT" },
  { id: "P15", name: "every supported region", technique: "BVA regions max", input: { preferredRegions: ALL_REGIONS }, saved: { ...nominal, preferredRegions: ALL_REGIONS } },
  { id: "P16", name: "unsupported region", technique: "invalid EP / not in list", input: { preferredRegions: ["South"] }, error: "INVALID_INPUT" },
  { id: "P17", name: "blank region", technique: "invalid EP / blank value", input: { preferredRegions: [" "] }, error: "INVALID_INPUT" },
  { id: "P18", name: "inactive account", technique: "invalid account EP", account: "INACTIVE", error: "INACTIVE_ACCOUNT" },
  { id: "P19", name: "profile not found", technique: "invalid account EP", account: "missing", error: "NOT_FOUND" },
];

/** Records what UpdateProfile asks the store to save. */
function recordingStore(account: AccountStatus | "missing") {
  const saves: ProfileChanges[] = [];
  const store: ProfileStore = {
    getAccountStatus: async () => (account === "missing" ? null : account),
    saveForActiveUser: async (_id, changes) => {
      saves.push(changes);
    },
  };
  return { store, saves };
}

const observations: unknown[] = [];

describe("Lab 4 / UC1-03 / UpdateProfile black-box EP and BVA", () => {
  for (const row of updateProfileCases) {
    test(`${row.id} ${row.name}`, async () => {
      // Arrange
      const { store, saves } = recordingStore(row.account ?? "ACTIVE");
      const input: ProfileChanges = { ...nominal, ...row.input };
      const expected = row.error === undefined
        ? { outcome: "SAVED", saved: row.saved, saveCalls: 1 }
        : { outcome: row.error, saved: null, saveCalls: 0 };

      // Act
      let outcome: string;
      try {
        await new UpdateProfile(store).forUser(userId, input);
        outcome = "SAVED";
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        outcome = error.code;
      }
      const actual = { outcome, saved: saves[0] ?? null, saveCalls: saves.length };

      // Assert
      observations.push({ id: row.id, name: row.name, technique: row.technique,
        input: { account: row.account ?? "ACTIVE", ...input }, expected, actual });
      expect(actual).toEqual(expected);
    });
  }
});

afterAll(() => {
  if (!process.env.LAB4_EVIDENCE_DIR) return;
  const directory = path.resolve(process.env.LAB4_EVIDENCE_DIR);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "update-profile-black-box-observations.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), observations }, null, 2) + "\n");
});
