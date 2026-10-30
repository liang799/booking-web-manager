import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { FindPlayerState } from "@/app/users/find-player-action";
import type { InvitePlayerState } from "../actions";
import { GroupFindPlayer } from "./group-find-player";

/** Stands in for findPlayer: every search finds `player`. */
function finding(player: Extract<FindPlayerState, { status: "found" }>["player"]) {
  return fn<(previous: FindPlayerState, formData: FormData) => Promise<FindPlayerState>>(async () => ({ status: "found", player }));
}

/** Stands in for invitePlayer: every invitation gets `result`. */
function inviting(result: InvitePlayerState) {
  return fn<(previous: InvitePlayerState, formData: FormData) => Promise<InvitePlayerState>>(async () => result);
}

const aisha = { handle: "aisha_tan", displayName: "Aisha Tan", reliabilityScore: 92, isSelf: false };
const groups = [
  { groupId: "6f1c2a7e-4b8d-4c1e-9a3f-2d5b7c9e1f03", name: "Weekend Tennis Club" },
  { groupId: "7a2d3b8f-5c9e-4d2f-8b4a-3e6c8d0f2a14", name: "Hall 16 Badminton" },
];

const meta = {
  title: "Groups/InvitePlayer",
  component: GroupFindPlayer,
  parameters: {
    docs: {
      description: {
        component:
          "Find a player on the Groups page with Invite beside the result (ADR-0022). The player joins only by accepting; your own user ID shows no Invite button.",
      },
    },
  },
  args: {
    findAction: finding(aisha),
    inviteAction: inviting({ status: "sent", message: "Invitation sent. Aisha Tan will see it on their Groups page." }),
    inviteGroups: groups,
  },
} satisfies Meta<typeof GroupFindPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

async function search(canvas: ReturnType<typeof within>, handle: string) {
  await userEvent.type(canvas.getByRole("textbox", { name: "User ID" }), handle);
  await userEvent.click(canvas.getByRole("button", { name: "Find" }));
}

export const Invite: Story = {
  play: async ({ args, canvas, canvasElement }) => {
    await search(canvas, "aisha_tan");
    await userEvent.click(await canvas.findByRole("button", { name: "Invite Aisha Tan" }));

    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Invite Aisha Tan" });
    await expect(within(dialog).getByRole("radio", { name: "Weekend Tennis Club" })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("radio", { name: "Hall 16 Badminton" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    await expect(await within(dialog).findByRole("status")).toHaveTextContent("Invitation sent. Aisha Tan will see it on their Groups page.");
    await expect(within(dialog).getByRole("button", { name: "Done" })).toBeVisible();
    const formData = args.inviteAction.mock.calls[0]?.[1];
    await expect(formData?.get("handle")).toBe("aisha_tan");
    await expect(formData?.get("groupId")).toBe(groups[1]?.groupId);
  },
};

/** Searching your own user ID shows who you are, with nothing to invite. */
export const OwnId: Story = {
  args: { findAction: finding({ ...aisha, isSelf: true }) },
  play: async ({ canvas }) => {
    await search(canvas, "aisha_tan");

    await expect(await canvas.findByText("This is you.")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /Invite/ })).not.toBeInTheDocument();
  },
};

export const Refused: Story = {
  args: { inviteAction: inviting({ status: "error", message: "They're already a member of this group." }) },
  play: async ({ canvas, canvasElement }) => {
    await search(canvas, "aisha_tan");
    await userEvent.click(await canvas.findByRole("button", { name: "Invite Aisha Tan" }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    await expect(await within(dialog).findByRole("alert")).toHaveTextContent("They're already a member of this group.");
  },
};

/** No active group with its link on: explain what to do instead of offering a choice. */
export const NoGroupToInviteTo: Story = {
  args: { inviteGroups: [] },
  play: async ({ args, canvas, canvasElement }) => {
    await search(canvas, "aisha_tan");
    await userEvent.click(await canvas.findByRole("button", { name: "Invite Aisha Tan" }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog");

    // The dialog fades in, so wait until its text is visible.
    await waitFor(() => expect(within(dialog).getByText(/Create a group first, or turn its link on/)).toBeVisible());
    await expect(within(dialog).queryByRole("button", { name: "Send invitation" })).not.toBeInTheDocument();
    await expect(args.inviteAction).not.toHaveBeenCalled();
  },
};

export const Phone: Story = {
  ...Invite,
  globals: { viewport: { value: "phone", isRotated: false } },
  play: async (context) => {
    await Invite.play?.(context);
    const { canvasElement } = context;
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog");
    await waitFor(() => expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(window.innerWidth));
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
