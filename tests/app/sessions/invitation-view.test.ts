import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { SessionInvitationView } from "@/app/sessions/_components/session-invitation-view";

const joinButton = vi.hoisted(() => vi.fn(() => null));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/commit/_components/join-session-button", () => ({ JoinSessionButton: joinButton }));

test("an invitation supplies the same return destination to login and missing-email recovery", () => {
  const sessionId = "20000000-0000-4000-8000-000000000001";
  const roomToken = "exact + token";
  const invitationPath = `/sessions/${sessionId}/join?${new URLSearchParams({ token: roomToken })}`;
  renderToStaticMarkup(createElement(SessionInvitationView, { outcome: {
    status: "ready", viewerId: "viewer", roomToken, invitationPath,
    session: { sessionId, venueName: "Bishan Sports Hall", sport: "Badminton", region: "Central",
      startAt: "2035-05-12T10:00:00Z", endAt: "2035-05-12T12:00:00Z", totalSlots: 8, bookingShareCents: 750 },
  } }));
  expect(joinButton).toHaveBeenCalledWith(expect.objectContaining({
    roomToken,
    loginHref: `/login?${new URLSearchParams({ next: invitationPath })}`,
    emailHref: `/profile/email?${new URLSearchParams({ next: invitationPath })}`,
  }), undefined);
});
