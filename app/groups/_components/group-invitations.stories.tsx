import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";
import type { GroupActionResult } from "../actions";
import { GroupInvitations } from "./group-invitations";

const answer = () => fn<(groupId: string) => Promise<GroupActionResult>>(async () => ({}));

const meta = {
  title: "Groups/Invitations",
  component: GroupInvitations,
  parameters: {
    docs: {
      description: {
        component:
          "Invitations by user ID waiting for the signed-in player's answer (ADR-0022). Join opens the group; Decline removes the invitation.",
      },
    },
  },
  args: {
    invitations: [
      {
        groupId: "6f1c2a7e-4b8d-4c1e-9a3f-2d5b7c9e1f03",
        groupName: "Friday Futsal",
        inviterName: "Dana Ong",
        inviterHandle: "dana_ong",
        invitedAt: "2026-10-27T04:00:00.000Z",
      },
      {
        groupId: "7a2d3b8f-5c9e-4d2f-8b4a-3e6c8d0f2a14",
        groupName: "Weekend tennis players from the North Spine residences club",
        inviterName: "Deleted user",
        inviterHandle: null,
        invitedAt: "2026-10-20T10:00:00.000Z",
      },
    ],
    accept: answer(),
    decline: answer(),
  },
} satisfies Meta<typeof GroupInvitations>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Invitations" })).toBeVisible();
    await expect(canvas.getByText("@dana_ong")).toBeVisible();
    await expect(canvas.getByText("27 Oct")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Join Friday Futsal" }));
    await expect(args.accept).toHaveBeenCalledWith("6f1c2a7e-4b8d-4c1e-9a3f-2d5b7c9e1f03");

    await userEvent.click(canvas.getByRole("button", { name: /Decline the invitation to Weekend tennis/ }));
    await expect(args.decline).toHaveBeenCalledWith("7a2d3b8f-5c9e-4d2f-8b4a-3e6c8d0f2a14");
  },
};

export const Ended: Story = {
  args: {
    accept: fn<(groupId: string) => Promise<GroupActionResult>>(async () => ({
      error: "This invitation is no longer available. Ask a member for a new one.",
    })),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Join Friday Futsal" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent("This invitation is no longer available.");
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const join = canvas.getByRole("button", { name: "Join Friday Futsal" });
    await expect(join.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
