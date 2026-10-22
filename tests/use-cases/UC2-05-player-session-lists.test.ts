import { describe, expect, test, vi } from "vitest";
import { ListJoinedSessions } from "@/use-cases/sessions/ListJoinedSessions";
import { ListReplacementInvitations } from "@/use-cases/sessions/ListReplacementInvitations";
import { hoursBeforeSessionStart } from "../domain/sessions/session/session-fixtures";

const now = hoursBeforeSessionStart(48);
const clock = { now: () => now };

// Owner: Yajie (Wyjessie) — /app/commit
describe("UC2-05 the player's session lists", () => {
  test("joined sessions are read for the caller at the current time", async () => {
    const reader = { list: vi.fn().mockResolvedValue([]) };

    const sessions = await new ListJoinedSessions({ reader, clock }).forParticipant("alice");

    expect(sessions).toEqual([]);
    expect(reader.list).toHaveBeenCalledExactlyOnceWith("alice", now);
  });

  test("replacement invitations are read for the caller at the current time", async () => {
    const reader = { list: vi.fn().mockResolvedValue([]) };

    const invitations = await new ListReplacementInvitations({ reader, clock }).forInvitee("dave");

    expect(invitations).toEqual([]);
    expect(reader.list).toHaveBeenCalledExactlyOnceWith("dave", now);
  });
});
