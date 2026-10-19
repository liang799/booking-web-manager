import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";
import type { LoadSessionInvitation } from "../invitation-transport";
import { SessionInvitationShare } from "./session-invitation-share";

const sessionId = "20000000-0000-4000-8000-000000000001";
const invitationPath = `/sessions/${sessionId}/join?token=story-token`;
const meta = {
  title: "Sessions/Invitation sharing", component: SessionInvitationShare,
  parameters: { layout: "padded" },
  args: { sessionId, loadInvitation: fn<LoadSessionInvitation>(async () => ({ status: "ready", invitationPath })), copyText: fn<(value: string) => Promise<void>>(async () => {}) },
} satisfies Meta<typeof SessionInvitationShare>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Copied: Story = {
  play: async ({ canvas, args }) => {
    await expect(args.loadInvitation).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Copy invitation link" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Invitation link copied.");
    await expect(canvas.getByLabelText("Invitation link")).toHaveValue(`${window.location.origin}${invitationPath}`);
    await expect(args.loadInvitation).toHaveBeenCalledTimes(1);
    await expect(args.loadInvitation).toHaveBeenCalledWith(sessionId);
    await expect(args.copyText).toHaveBeenCalledTimes(1);
    await expect(args.copyText).toHaveBeenCalledWith(`${window.location.origin}${invitationPath}`);
  },
};

export const ClipboardUnavailable: Story = {
  args: { copyText: fn<(value: string) => Promise<void>>(async () => { throw new Error("Clipboard denied"); }) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Copy invitation link" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Copy the invitation link below.");
    await expect(canvas.getByLabelText("Invitation link")).toHaveAttribute("readonly");
    await expect(canvas.getByRole("button", { name: "Copy invitation link" })).toBeEnabled();
  },
};

export const Loading: Story = {
  args: { loadInvitation: fn<LoadSessionInvitation>(() => new Promise(() => {})) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Copy invitation link" }));
    await expect(canvas.getByRole("button", { name: "Loading invitation…" })).toBeDisabled();
    await expect(canvas.queryByLabelText("Invitation link")).not.toBeInTheDocument();
  },
};

export const RetryableFailure: Story = {
  args: { loadInvitation: fn<LoadSessionInvitation>(async () => ({ status: "error", signIn: false, message: "We couldn't load the invitation link. Please try again." })) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Copy invitation link" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent("Please try again.");
    await expect(canvas.getByRole("button", { name: "Copy invitation link" })).toBeEnabled();
    await expect(canvas.queryByLabelText("Invitation link")).not.toBeInTheDocument();
  },
};
