import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import type { FindPlayerState } from "@/app/users/find-player-action";
import type { CreateGroupState } from "../create-group-action";
import { CreateGroupWizard } from "./group-create";

const draftKey = "group-draft:storybook";
const findAction = fn(async (_previous: FindPlayerState, form: FormData): Promise<FindPlayerState> => {
  const handle = String(form.get("handle"));
  if (handle === "missing_player") return { status: "not-found", handle };
  return { status: "found", player: { handle, displayName: handle === "joseph" ? "Joseph" : "Rishi R", isSelf: handle === "myself", reliabilityScore: 100 } };
});
type CreateAction = (previous: CreateGroupState, form: FormData) => Promise<CreateGroupState>;
const createAction = fn<CreateAction>(async () => ({ status: "created", groupId: "new-crew", failedInvites: [] }));
const meta = {
  title: "Groups/Create", component: CreateGroupWizard,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/groups/new" } } },
  decorators: [(Story) => <AppShell user={{ name: "Tian Pok Neoh", reliabilityScore: 100 }} logoutAction={fn()}><Story /></AppShell>],
  globals: { viewport: { value: "desktop", isRotated: false } },
  args: { draftKey, findAction, createAction },
  beforeEach: () => { sessionStorage.removeItem(draftKey); getRouter().push.mockClear(); },
} satisfies Meta<typeof CreateGroupWizard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Details: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByRole("textbox", { name: "Group name" })).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(canvas.getByRole("textbox", { name: "Group name" }), "Weekend Tennis Crew");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByRole("heading", { name: "Who’s joining your group?" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(canvas.getByRole("textbox", { name: "Group name" })).toHaveValue("Weekend Tennis Crew");
  },
};
export const InvitePlayers: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Group name" }), "Weekend Tennis Crew");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    const input = canvas.getByRole("textbox", { name: "Find players" });
    await userEvent.type(input, "@Joseph");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    const list = await canvas.findByRole("list", { name: "Players to invite" });
    await expect(within(list).getByText("@joseph")).toBeVisible();
    await userEvent.type(input, "joseph");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await expect(canvas.getByText("This player is already on your list.")).toBeVisible();
    await expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: "Remove Joseph" }));
    await expect(canvas.queryByRole("list", { name: "Players to invite" })).not.toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "missing_player");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await expect(await canvas.findByText("No player has the user ID @missing_player.")).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "myself");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await expect(await canvas.findByText("You're already the owner. Add another player.")).toBeVisible();
  },
};
export const Draft: Story = {
  beforeEach: () => { sessionStorage.setItem(draftKey, JSON.stringify({ name: "Friday players", players: [{ handle: "joseph", displayName: "Joseph" }] })); },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Group name" })).toHaveValue("Friday players"));
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByText("@joseph")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await expect(canvas.getByText("Draft saved for this browser session.")).toBeVisible();
    await expect(JSON.parse(sessionStorage.getItem(draftKey) ?? "null")).toEqual({ name: "Friday players", players: [{ handle: "joseph", displayName: "Joseph" }] });
  },
};
export const InvalidDraft: Story = {
  beforeEach: () => { sessionStorage.setItem(draftKey, '{"name":"old","players":[{"handle":"bad"}]}'); },
  play: async ({ canvas }) => { await expect(canvas.getByRole("textbox", { name: "Group name" })).toHaveValue(""); },
};
export const CreateAndOpen: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Group name" }), "Weekend players");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Find players" }), "joseph");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await canvas.findByText("@joseph");
    await userEvent.click(canvas.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/groups/new-crew"));
    await expect(args.createAction).toHaveBeenCalled();
    const form = createAction.mock.calls.at(-1)?.[1];
    await expect(form?.get("name")).toBe("Weekend players");
    await expect(form?.getAll("players")).toEqual(["joseph"]);
    await expect(sessionStorage.getItem(draftKey)).toBeNull();
  },
};
export const PartialInvitationFailure: Story = {
  args: { createAction: fn<CreateAction>(async (): Promise<CreateGroupState> => ({ status: "created", groupId: "saved-crew", failedInvites: [{ handle: "joseph", message: "That player's account is no longer active." }] })) },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Group name" }), "Friday players");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(canvas.getByRole("button", { name: "Create group" }));
    await expect(await canvas.findByRole("heading", { name: "Your group is ready." })).toBeVisible();
    await expect(canvas.getByText("@joseph")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Open group" })).toHaveAttribute("href", "/groups/saved-crew");
    await expect(canvas.queryByRole("button", { name: "Create group" })).not.toBeInTheDocument();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};
export const CreationError: Story = {
  args: { createAction: fn<CreateAction>(async (): Promise<CreateGroupState> => ({ status: "error", message: "Please log in again." })) },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Group name" }), "Friday players");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(canvas.getByRole("button", { name: "Create group" }));
    await expect(await canvas.findByText("Please log in again.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(canvas.getByRole("textbox", { name: "Group name" })).toHaveValue("Friday players");
  },
};
export const LookupInProgress: Story = {
  args: { findAction: fn<(previous: FindPlayerState, form: FormData) => Promise<FindPlayerState>>(async (): Promise<FindPlayerState> => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { status: "found", player: { handle: "joseph", displayName: "Joseph", isSelf: false, reliabilityScore: 100 } };
  }) },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Group name" }), "Friday players");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Find players" }), "joseph");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await expect(canvas.getByRole("button", { name: "Create group" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Back" })).toBeDisabled();
    await expect(await canvas.findByText("@joseph")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Create group" })).toBeEnabled();
  },
};
export const Dark: Story = { globals: { theme: "dark" } };
export const InviteDark: Story = {
  globals: { theme: "dark" },
  beforeEach: () => { sessionStorage.setItem(draftKey, JSON.stringify({ name: "Weekend Tennis Crew", players: [{ handle: "joseph", displayName: "Joseph" }, { handle: "testingaccount1", displayName: "testingaccount1" }, { handle: "rishir", displayName: "Rishi R" }] })); },
  play: async ({ canvas }) => { await userEvent.click(canvas.getByRole("button", { name: "Continue" })); },
};
export const Mobile: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
  play: async ({ canvasElement }) => { await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth); },
};
export const MobileDark: Story = { ...Mobile, globals: { theme: "dark", viewport: { value: "phone", isRotated: false } } };
