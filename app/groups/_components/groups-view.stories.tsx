import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FindPlayerState } from "@/app/users/find-player-action";
import { FindPlayer } from "@/app/users/_components/find-player";
import { GroupsView, type GroupOverview } from "./groups-view";

const members = ["Marcus Lim", "Aisha Tan", "Daniel Wong", "Jo Lee"];
const groups = [
  { groupId: "weekend", name: "Weekend Tennis Club", ownerName: "Tian Pok Neoh", isOwner: true, archived: false, memberCount: 8, memberNames: members },
  { groupId: "north-spine", name: "North Spine Players", ownerName: "Marcus Lim", isOwner: false, archived: false, memberCount: 15, memberNames: members },
  { groupId: "hall-16", name: "Hall 16 Tennis", ownerName: "Aisha Tan", isOwner: false, archived: false, memberCount: 6, memberNames: members },
  { groupId: "fusion", name: "Fusion Sports Crew", ownerName: "Daniel Wong", isOwner: false, archived: false, memberCount: 10, memberNames: members },
  { groupId: "friends", name: "Tennis & Friends", ownerName: "Jo Lee", isOwner: false, archived: true, memberCount: 4, memberNames: members },
  { groupId: "old-club", name: "Old Weekend Club", ownerName: "Tian Pok Neoh", isOwner: true, archived: true, memberCount: 1, memberNames: ["Tian Pok Neoh"] },
] as const satisfies readonly GroupOverview[];

const meta = {
  title: "Groups/Overview",
  component: GroupsView,
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/groups" } },
    docs: { description: { component: "UC1-06 group overview. All includes archived groups; Owned and Joined show active groups. Initials and organiser names come from real profiles in production. Court photography is decorative. This fixture form demonstrates the dialog; production injects the existing CreateGroupForm and server action." } },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [(Story) => <AppShell user={{ name: "Tian Pok Neoh", reliabilityScore: 100 }} logoutAction={fn()}><Story /></AppShell>],
  args: {
    groups,
    createForm: <form onSubmit={(event) => event.preventDefault()} className="space-y-3">
      <Label htmlFor="preview-group-name">New group name</Label>
      <Input id="preview-group-name" name="name" placeholder="e.g. Weekend Tennis Crew" maxLength={60} />
      <Button type="submit">Create group</Button>
    </form>,
  },
} satisfies Meta<typeof GroupsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Your groups" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Open Weekend Tennis Club" })).toHaveAttribute("href", "/groups/weekend");
    await expect(within(canvas.getByRole("list", { name: "All groups" })).getAllByRole("listitem")).toHaveLength(6);
    await expect(canvas.getByText("1 member", { exact: true })).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "Owned" }));
    await expect(canvas.getByRole("link", { name: "Open Weekend Tennis Club" })).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Open Old Weekend Club" })).not.toBeInTheDocument();
    await expect(within(canvas.getByRole("list", { name: "Owned groups" })).getAllByRole("listitem")).toHaveLength(1);

    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Joined" })).toHaveAttribute("aria-selected", "true");
    await expect(within(canvas.getByRole("list", { name: "Joined groups" })).getAllByRole("listitem")).toHaveLength(3);
    await expect(canvas.queryByRole("link", { name: "Open Weekend Tennis Club" })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("tab", { name: "Archived" }));
    await expect(within(canvas.getByRole("list", { name: "Archived groups" })).getAllByRole("listitem")).toHaveLength(2);
    await expect(canvas.getByRole("link", { name: "Open Old Weekend Club" })).toHaveTextContent("Owner");
    await userEvent.click(canvas.getByLabelText("Options for Tennis & Friends"));
    await expect(canvas.getByRole("link", { name: "View members" })).toHaveAttribute("href", "/groups/friends#members");
    await expect(canvas.queryByRole("link", { name: "Invitation link" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Group settings" })).not.toBeInTheDocument();
  },
};

export const Options: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByLabelText("Options for Weekend Tennis Club");
    await userEvent.click(trigger);
    await expect(canvas.getByRole("link", { name: "Group settings" })).toHaveAttribute("href", "/groups/weekend#settings");
    await expect(canvas.getByRole("link", { name: "Invitation link" })).toHaveAttribute("href", "/groups/weekend#invite");
    await userEvent.tab();
    await userEvent.keyboard("{Escape}");
    await expect(trigger).toHaveFocus();
    await expect(canvas.queryByRole("link", { name: "Group settings" })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByLabelText("Options for North Spine Players"));
    await expect(canvas.getByRole("link", { name: "Membership settings" })).toHaveAttribute("href", "/groups/north-spine#leave");
    await expect(canvas.queryByRole("link", { name: "Group settings" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("heading", { name: "Your groups" }));
    await expect(canvas.queryByRole("link", { name: "Membership settings" })).not.toBeInTheDocument();
  },
};

export const CreateDialog: Story = {
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole("button", { name: "Create group" });
    await userEvent.click(trigger);
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog", { name: "Create a group" }));
    const input = dialog.getByRole("textbox", { name: "New group name" });
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.type(input, "Friday players");
    await expect(input).toHaveValue("Friday players");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};

export const Empty: Story = {
  args: { groups: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "No groups yet" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Create group" })).toBeEnabled();
  },
};

export const EmptyFilter: Story = {
  args: { groups: [groups[0]] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Joined" }));
    await expect(canvas.getByRole("heading", { name: "No joined groups" })).toBeVisible();
    await expect(canvas.getByText("Ask a group owner for an invitation link to join their players.")).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "All" }));
    await expect(canvas.getByRole("link", { name: "Open Weekend Tennis Club" })).toBeVisible();
  },
};

export const LeftGroup: Story = { args: { leftGroup: true } };
export const Mobile: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const views = within(canvas.getByRole("navigation", { name: "Session views" }));
    await expect(views.getByRole("link", { name: "Groups" })).toHaveAttribute("aria-current", "page");
    await expect(views.getByRole("link", { name: "Joined" })).toHaveAttribute("href", "/sessions");
    await expect(views.getByRole("link", { name: "Hosting" })).toHaveAttribute("href", "/sessions?tab=hosting");
    await expect(canvas.queryByRole("button", { name: "Create group" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("tablist", { name: "Filter groups" })).not.toBeInTheDocument();
    await expect(within(canvas.getByRole("list", { name: "All groups" })).getAllByRole("listitem")).toHaveLength(6);
    const row = canvas.getByRole("link", { name: "Open Weekend Tennis Club" });
    await expect(row).toHaveTextContent("8 members");
    await expect(row).toHaveTextContent("Owner");
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
export const Dark: Story = { globals: { theme: "dark" } };
export const MobileDark: Story = { ...Mobile, globals: { theme: "dark", viewport: { value: "phone", isRotated: false } } };
export const LongNames: Story = {
  args: { groups: [{ ...groups[0], name: "Weekend tennis players from the North Spine residences club", ownerName: "Alexandria Wei Ling Tan", memberCount: 1234 }] },
};
export const LongNamesMobile: Story = { ...LongNames, globals: { viewport: { value: "phone", isRotated: false } } };

const foundPlayer = fn<(previous: FindPlayerState, formData: FormData) => Promise<FindPlayerState>>(async () => ({
  status: "found",
  player: { handle: "marcus_lim", displayName: "Marcus Lim", reliabilityScore: 92 },
}));

/** Production passes the FindPlayer search (ADR-0021); this stand-in action always finds Marcus. */
export const WithFindPlayer: Story = {
  args: { findPlayer: <FindPlayer action={foundPlayer} /> },
  play: async ({ canvas }) => {
    const search = canvas.getByRole("search", { name: "Find a player" });
    await expect(canvas.getByRole("heading", { name: "Find a player" })).toBeVisible();
    await userEvent.type(within(search).getByRole("textbox", { name: "User ID" }), "marcus_lim");
    await userEvent.click(within(search).getByRole("button", { name: "Find" }));
    await expect(await canvas.findByText("@marcus_lim")).toBeVisible();
    await expect(canvas.getByRole("tab", { name: "All" })).toBeVisible();
  },
};
export const WithFindPlayerMobile: Story = {
  ...WithFindPlayer,
  globals: { viewport: { value: "phone", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("search", { name: "Find a player" })).toBeVisible();
    await expect(within(canvas.getByRole("list", { name: "All groups" })).getAllByRole("listitem")).toHaveLength(6);
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
