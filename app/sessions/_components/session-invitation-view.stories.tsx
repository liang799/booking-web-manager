import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";
import type { InvitationScreen } from "../invitation-screen";
import { SessionInvitationView } from "./session-invitation-view";

const sessionId = "20000000-0000-4000-8000-000000000001";
const invitationPath = `/sessions/${sessionId}/join?token=story-token`;
const ready = {
  status: "ready", viewerId: null, roomToken: "story-token", invitationPath,
  session: { sessionId, venueName: "Bishan Sports Hall", sport: "Badminton", region: "Central",
    startAt: "2035-05-12T10:00:00Z", endAt: "2035-05-12T12:00:00Z", totalSlots: 8, bookingShareCents: 750 },
} satisfies InvitationScreen;

const meta = {
  title: "Sessions/Invitation preview", component: SessionInvitationView,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: `/sessions/${sessionId}/join` } } },
  globals: { viewport: { value: "phone", isRotated: false } },
  args: { outcome: ready },
} satisfies Meta<typeof SessionInvitationView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Guest: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Bishan Sports Hall" })).toBeVisible();
    const login = canvas.getByRole("link", { name: "Log in to join" });
    await expect(login).toHaveAttribute("href", `/login?${new URLSearchParams({ next: invitationPath })}`);
    await expect(canvas.getByRole("link", { name: "Create account" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /^Join / })).not.toBeInTheDocument();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const SignedIn: Story = {
  args: { outcome: { ...ready, viewerId: "viewer" } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Log in to join" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Join Badminton session at Bishan Sports Hall" }));
    // The existing join dialog requires another explicit confirmation before any mutation.
    await expect(document.querySelector('[role="dialog"]')).toHaveTextContent("Join this session?");
  },
};

export const Unavailable: Story = { args: { outcome: { status: "unavailable" } } };
export const Retry: Story = { args: { outcome: { status: "error" } } };
