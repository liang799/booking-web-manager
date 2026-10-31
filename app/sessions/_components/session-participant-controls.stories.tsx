import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { SessionParticipantControls } from "./session-participant-controls";
import { joinedSessions } from "./sessions-fixtures";
import type { LoadJoinedSessions } from "@/app/commit/withdrawal-ports";

const session = joinedSessions[0]!;
let client: QueryClient;
const meta = {
  title: "Sessions/Participant details actions", component: SessionParticipantControls,
  decorators: [(Story) => <QueryClientProvider client={client}><Story /></QueryClientProvider>],
  args: {
    userId: "participant-details", session, onRefresh: fn(),
    transport: {
      loadJoinedSessions: fn<LoadJoinedSessions>(async () => [{ ...session, status: "COMMITTED" }]),
      previewWithdrawal: fn(async () => ({ status: "ready" as const, preview: { kind: "REFUNDED" as const, refundCents: 500, heldCents: 0 } })),
      withdrawFromSession: fn(async () => ({ status: "withdrawn" as const, kind: "REFUNDED" as const, refundedCents: 500 })),
      leaveWaitlist: fn(async () => ({ status: "left" as const })),
      findReplacementCandidate: fn(async () => ({ status: "found" as const, candidate: { userId: "replacement-details", handle: "replacement_player", displayName: "Replacement Player" } })),
    },
  },
  beforeEach: () => {
    localStorage.clear();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
    return () => client.clear();
  },
} satisfies Meta<typeof SessionParticipantControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReviewRefund: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Leave session" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Withdraw from this session?" }));
    await waitFor(() => expect(dialog.getByText("Who gets your place?")).toBeVisible());
    await expect(args.transport?.withdrawFromSession).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole("radio", { name: /Open it to the waitlist/ }));
    await userEvent.click(dialog.getByRole("button", { name: "Withdraw" }));
    await expect(await screen.findByRole("dialog", { name: "You've withdrawn" })).toHaveTextContent("5.00");
    await expect(args.transport?.withdrawFromSession).toHaveBeenCalledOnce();
    await expect(args.onRefresh).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("dialog", { name: "You've withdrawn" })).getByRole("button", { name: "Done" }));
    await expect(args.onRefresh).toHaveBeenCalledOnce();
  },
};

export const LeaveWaitlist: Story = {
  args: { session: { ...session, participationStatus: "WAITLISTED" } },
  beforeEach: () => { meta.args.transport.loadJoinedSessions.mockResolvedValue([{ ...session, status: "WAITLISTED" }]); },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Leave waitlist" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Leave the waitlist?" }));
    await expect(args.transport?.leaveWaitlist).not.toHaveBeenCalled();
    await expect(args.transport?.previewWithdrawal).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole("button", { name: "Leave waitlist" }));
    await expect(args.transport?.leaveWaitlist).toHaveBeenCalledOnce();
    await expect(args.onRefresh).toHaveBeenCalledOnce();
  },
};

export const InviteReplacementByUserId: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Leave session" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Withdraw from this session?" }));
    await userEvent.click(dialog.getByRole("radio", { name: /Invite one person/ }));
    const withdraw = dialog.getByRole("button", { name: "Withdraw" });
    await expect(withdraw).toBeDisabled();
    await userEvent.type(dialog.getByLabelText("Their user ID"), "replacement_player");
    await userEvent.click(dialog.getByRole("button", { name: "Find" }));
    await expect(await dialog.findByText("Replacement Player")).toBeVisible();
    await expect(withdraw).toBeEnabled();
    await userEvent.click(withdraw);
    await expect(await screen.findByRole("dialog", { name: "You've withdrawn" })).toHaveTextContent("5.00");
    await expect(args.transport?.withdrawFromSession).toHaveBeenCalledWith(expect.objectContaining({
      replacement: { mode: "DIRECT_INVITE", inviteeId: "replacement-details" },
    }));
  },
};

export const ChangedPlace: Story = {
  beforeEach: () => { meta.args.transport.loadJoinedSessions.mockResolvedValue([]); },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Leave session" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Your place has changed");
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(args.transport?.withdrawFromSession).not.toHaveBeenCalled();
  },
};

export const KeepPlaceRestoresFocus: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Leave session" });
    await userEvent.click(trigger);
    const dialog = within(await screen.findByRole("dialog", { name: "Withdraw from this session?" }));
    await userEvent.click(dialog.getByRole("button", { name: "Keep my place" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
