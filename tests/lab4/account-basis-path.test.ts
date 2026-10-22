import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { Money } from "@/domain";
import {
  deleteAccount,
  type AccountStanding,
  type DeleteAccountPorts,
  type ProfileSnapshot,
} from "@/use-cases/accounts/delete-account";
import { ManageGroup } from "@/use-cases/groups/manage-group";
import { inMemoryGroupDependencies } from "../use-cases/support/in-memory-groups";

const observations: object[] = [];

function observe(id: string, input: string, predictedPath: string, expected: object, actual: object) {
  observations.push({ id, input, predictedPath, expected, actual });
  expect(actual).toEqual(expected);
}

// ---------- UC1-04: deleteAccount ----------

const userId = "11111111-1111-4111-8111-111111111111";

function clear(overrides: Partial<AccountStanding> = {}): AccountStanding {
  return {
    walletId: "22222222-2222-4222-8222-222222222222",
    availableBalance: Money.fromCents(0),
    heldBalance: Money.fromCents(0),
    activeCommitments: 0,
    unsettledOwnedSessions: 0,
    pendingPayouts: 0,
    activeOwnedGroups: 0,
    ...overrides,
  };
}

/** Successive loadStanding calls return `standings` in order; the last one repeats. */
function ports(standings: AccountStanding[], failures: { login?: boolean; restore?: boolean } = {}) {
  const steps: string[] = [];
  const profile = { status: "ACTIVE" as "ACTIVE" | "INACTIVE" };
  let loads = 0;
  const value: DeleteAccountPorts = {
    loadStanding: async () => {
      steps.push("check");
      return standings[Math.min(loads++, standings.length - 1)] ?? clear();
    },
    deactivateProfile: async (id): Promise<ProfileSnapshot> => {
      steps.push("deactivate");
      profile.status = "INACTIVE";
      return { userId: id, displayName: "Marcus Lim", preferredSports: ["Tennis"], preferredRegions: ["West"] };
    },
    restoreProfile: async () => {
      steps.push("restore");
      if (failures.restore === true) throw new Error("profile store unavailable");
      profile.status = "ACTIVE";
    },
    deleteLogin: async () => {
      steps.push("delete-login");
      if (failures.login === true) throw new Error("auth service unavailable");
    },
  };
  return { ports: value, steps, profile };
}

async function outcomeOf(attempt: Promise<{ status: string }>): Promise<string> {
  try {
    return (await attempt).status;
  } catch (error) {
    return error instanceof AggregateError ? `AggregateError(${error.errors.length})` : `Error(${(error as Error).message})`;
  }
}

describe("deleteAccount", () => {
  test("deleteAccount_WhenA1FirstCheckFindsCommitment_BlocksWithoutChangingProfile", async () => {
    // Arrange
    const fake = ports([clear({ activeCommitments: 1 })]);

    // Act
    const outcome = await outcomeOf(deleteAccount(fake.ports, { userId }));

    // Assert
    observe("WB-D1", "First check: 1 active commitment", "A0 A1 A2 A11",
      { outcome: "BLOCKED", steps: ["check"], profile: "ACTIVE" },
      { outcome, steps: fake.steps, profile: fake.profile.status });
  });

  test("deleteAccount_WhenA2BothChecksClear_DeletesLogin", async () => {
    // Arrange
    const fake = ports([clear()]);

    // Act
    const outcome = await outcomeOf(deleteAccount(fake.ports, { userId }));

    // Assert
    observe("WB-D2", "Nothing outstanding at either check", "A0 A1 A3 A4 A6 A7 A11",
      { outcome: "DELETED", steps: ["check", "deactivate", "check", "delete-login"], profile: "INACTIVE" },
      { outcome, steps: fake.steps, profile: fake.profile.status });
  });

  test("deleteAccount_WhenA3TopUpArrivesBeforeRecheck_RestoresProfileAndBlocks", async () => {
    // Arrange
    const fake = ports([clear(), clear({ availableBalance: Money.fromCents(100) })]);

    // Act
    const outcome = await outcomeOf(deleteAccount(fake.ports, { userId }));

    // Assert
    observe("WB-D3", "First check clear; re-check finds 100c available", "A0 A1 A3 A4 A5 A11",
      { outcome: "BLOCKED", steps: ["check", "deactivate", "check", "restore"], profile: "ACTIVE" },
      { outcome, steps: fake.steps, profile: fake.profile.status });
  });

  test("deleteAccount_WhenA4LoginRemovalFails_RestoresProfileAndRethrows", async () => {
    // Arrange
    const fake = ports([clear()], { login: true });

    // Act
    const outcome = await outcomeOf(deleteAccount(fake.ports, { userId }));

    // Assert
    observe("WB-D4", "Login removal throws; restore succeeds", "A0 A1 A3 A4 A6 A8 A9 A11",
      { outcome: "Error(auth service unavailable)", steps: ["check", "deactivate", "check", "delete-login", "restore"], profile: "ACTIVE" },
      { outcome, steps: fake.steps, profile: fake.profile.status });
  });

  test("deleteAccount_WhenA5LoginRemovalAndRestoreFail_ReportsBothErrors", async () => {
    // Arrange
    const fake = ports([clear()], { login: true, restore: true });

    // Act
    const outcome = await outcomeOf(deleteAccount(fake.ports, { userId }));

    // Assert
    observe("WB-D5", "Login removal throws; restore also throws", "A0 A1 A3 A4 A6 A8 A10 A11",
      { outcome: "AggregateError(2)", steps: ["check", "deactivate", "check", "delete-login", "restore"], profile: "INACTIVE" },
      { outcome, steps: fake.steps, profile: fake.profile.status });
  });
});

// ---------- UC1-06: joining a group through its invitation link ----------

/** A group "group-1" owned by "owner", with invitation link "token-1". Saves are counted. */
async function groupFixture() {
  const { deps, rows } = inMemoryGroupDependencies();
  let saves = 0;
  const save = deps.groups.save;
  deps.groups.save = async (group) => {
    saves += 1;
    await save(group);
  };
  const manage = new ManageGroup(deps);
  await manage.create({ ownerId: "owner", name: "Friday badminton" });
  saves = 0;
  return { manage, rows, saveCount: () => saves };
}

async function joinOutcome(attempt: Promise<{ result: string }>): Promise<string> {
  try {
    return (await attempt).result;
  } catch (error) {
    return (error as { code?: string }).code ?? "unexpected";
  }
}

function memberIds(rows: Map<string, { memberships: readonly { userId: string }[] }>): string[] {
  return rows.get("group-1")?.memberships.map((member) => member.userId) ?? [];
}

describe("ManageGroup", () => {
  test("join_WhenJ1TokenUnknown_RejectsWithoutSaving", async () => {
    // Arrange
    const fixture = await groupFixture();

    // Act
    const outcome = await joinOutcome(fixture.manage.join({ userId: "newcomer", invitationToken: "token-unknown" }));

    // Assert
    observe("WB-J1", "Token matches no group", "J0 J1 J2 J10",
      { outcome: "INVALID_INVITATION", saves: 0, members: ["owner"] },
      { outcome, saves: fixture.saveCount(), members: memberIds(fixture.rows) });
  });

  test("join_WhenJ2GroupArchived_RejectsWithoutSaving", async () => {
    // Arrange
    const fixture = await groupFixture();
    await fixture.manage.archive({ actorId: "owner", groupId: "group-1" });
    const before = fixture.saveCount();

    // Act
    const outcome = await joinOutcome(fixture.manage.join({ userId: "newcomer", invitationToken: "token-1" }));

    // Assert
    observe("WB-J2", "Old link of an archived group", "J0 J1 J3 J4 J10",
      { outcome: "INVALID_STATE", saves: 0, members: ["owner"] },
      { outcome, saves: fixture.saveCount() - before, members: memberIds(fixture.rows) });
  });

  test("join_WhenJ3LinkTurnedOff_RejectsWithoutSaving", async () => {
    // Arrange
    const fixture = await groupFixture();
    await fixture.manage.revokeInvitation({ actorId: "owner", groupId: "group-1" });
    const before = fixture.saveCount();

    // Act
    const outcome = await joinOutcome(fixture.manage.join({ userId: "newcomer", invitationToken: "token-1" }));

    // Assert
    observe("WB-J3", "Active group whose link was turned off", "J0 J1 J3 J5 J6 J10",
      { outcome: "INVALID_INVITATION", saves: 0, members: ["owner"] },
      { outcome, saves: fixture.saveCount() - before, members: memberIds(fixture.rows) });
  });

  test("join_WhenJ4AlreadyMember_ReturnsAlreadyMemberWithoutSaving", async () => {
    // Arrange
    const fixture = await groupFixture();

    // Act
    const outcome = await joinOutcome(fixture.manage.join({ userId: "owner", invitationToken: "token-1" }));

    // Assert
    observe("WB-J4", "Existing member opens the valid link", "J0 J1 J3 J5 J7 J8 J10",
      { outcome: "ALREADY_MEMBER", saves: 0, members: ["owner"] },
      { outcome, saves: fixture.saveCount(), members: memberIds(fixture.rows) });
  });

  test("join_WhenJ5NewUserWithValidLink_JoinsAndSaves", async () => {
    // Arrange
    const fixture = await groupFixture();

    // Act
    const outcome = await joinOutcome(fixture.manage.join({ userId: "newcomer", invitationToken: "token-1" }));

    // Assert
    observe("WB-J5", "New user opens the valid link", "J0 J1 J3 J5 J7 J9 J10",
      { outcome: "JOINED", saves: 1, members: ["owner", "newcomer"] },
      { outcome, saves: fixture.saveCount(), members: memberIds(fixture.rows) });
  });
});

afterAll(() => {
  if (!process.env.LAB4_EVIDENCE_DIR) return;
  const directory = path.resolve(process.env.LAB4_EVIDENCE_DIR);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "account-basis-path-observations.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), observations }, null, 2) + "\n");
});
