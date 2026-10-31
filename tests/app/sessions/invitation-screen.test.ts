import { beforeEach, expect, test, vi } from "vitest";
import { loadInvitationScreen } from "@/app/sessions/invitation-screen";
import { getSessionInvitationPreviewDependencies } from "@/app/sessions/invitation-preview-server-dependencies";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { isAuthenticationConfigured } from "@/lib/supabase/is-configured";
import { GetInvitedSession, type InvitedSessionReader } from "@/use-cases/sessions/GetInvitedSession";
import { metadata, dynamic } from "@/app/sessions/(invitation)/[sessionId]/join/page";

vi.mock("@/app/sessions/invitation-preview-server-dependencies", () => ({ getSessionInvitationPreviewDependencies: vi.fn() }));
vi.mock("@/lib/supabase/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/supabase/is-configured", () => ({ isAuthenticationConfigured: vi.fn() }));
vi.mock("@/app/sessions/_components/session-invitation-view", () => ({ SessionInvitationView: () => null }));

const sessionId = "20000000-0000-4000-8000-000000000001";
const now = new Date("2035-05-01T00:00:00Z");
const findByToken = vi.fn<InvitedSessionReader["findByToken"]>();
const session = { sessionId, venueName: "Bishan Sports Hall", sport: "Badminton" as const, region: "Central" as const,
  startAt: new Date("2035-05-12T10:00:00Z"), endAt: new Date("2035-05-12T12:00:00Z"), totalSlots: 6, bookingShareCents: 750 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isAuthenticationConfigured).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  findByToken.mockResolvedValue(session);
  vi.mocked(getSessionInvitationPreviewDependencies).mockResolvedValue({ preview: new GetInvitedSession({ reader: { findByToken }, clock: { now: () => now } }) });
});

test("token preview is dynamic and not indexable, and preserves the exact token", async () => {
  const token = "exact + token";
  const result = await loadInvitationScreen(sessionId, token);
  expect(findByToken).toHaveBeenCalledExactlyOnceWith(sessionId, token, now);
  expect(result).toEqual({ status: "ready", viewerId: null, roomToken: token,
    invitationPath: `/sessions/${sessionId}/join?token=exact+%2B+token`,
    session: { ...session, startAt: session.startAt.toISOString(), endAt: session.endAt.toISOString() } });
  expect(dynamic).toBe("force-dynamic");
  expect(metadata).toMatchObject({ robots: { index: false, follow: false }, referrer: "no-referrer" });
});

test.each([undefined, "", ["one", "two"]])("missing or repeated tokens are unavailable without database access", async (token) => {
  expect(await loadInvitationScreen(sessionId, token)).toEqual({ status: "unavailable" });
  expect(getSessionInvitationPreviewDependencies).not.toHaveBeenCalled();
});

test("unknown, wrong-token and closed sessions share the same unavailable screen", async () => {
  findByToken.mockResolvedValue(null);
  expect(await loadInvitationScreen(sessionId, "wrong")).toEqual({ status: "unavailable" });
  expect(getCurrentUser).not.toHaveBeenCalled();
});

test("invalid IDs do not reach the database", async () => {
  expect(await loadInvitationScreen("not-an-id", "token")).toEqual({ status: "unavailable" });
  expect(getSessionInvitationPreviewDependencies).not.toHaveBeenCalled();
});

test("authentication failure does not hide a valid invitation", async () => {
  vi.mocked(getCurrentUser).mockRejectedValue(new Error("auth offline"));
  expect(await loadInvitationScreen(sessionId, "token")).toMatchObject({ status: "ready", viewerId: null });
});

test("unconfigured authentication is not initialized", async () => {
  vi.mocked(isAuthenticationConfigured).mockReturnValue(false);
  expect(await loadInvitationScreen(sessionId, "token")).toMatchObject({ status: "ready", viewerId: null });
  expect(getCurrentUser).not.toHaveBeenCalled();
});

test("database failure renders an opaque retry state", async () => {
  findByToken.mockRejectedValue(new Error("database credentials and private token"));
  expect(await loadInvitationScreen(sessionId, "token")).toEqual({ status: "error" });
});

test("tokenless group preview requires an active identity and exposes no room token", async () => {
 const userId = "10000000-0000-4000-8000-000000000001";
 vi.mocked(getCurrentUser).mockResolvedValue({id:userId,email:null,emailVerified:false,pendingEmail:null,accountStatus:"ACTIVE",displayName:"Player",profileName:"Player",preferredSports:[],preferredRegions:[],reliabilityScore:100});
 const findForGroupMember=vi.fn().mockResolvedValue(session);
 vi.mocked(getSessionInvitationPreviewDependencies).mockResolvedValue({preview:new GetInvitedSession({reader:{findByToken,findForGroupMember},clock:{now:()=>now}})});
 const result=await loadInvitationScreen(sessionId,undefined);
 expect(findForGroupMember).toHaveBeenCalledExactlyOnceWith(sessionId,userId,now);
 expect(findByToken).not.toHaveBeenCalled();
 expect(result).toMatchObject({status:"ready",viewerId:userId,invitationPath:`/sessions/${sessionId}/join`});
 expect(result).not.toHaveProperty("roomToken");
});
