import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import type { InvitePlayerState } from "../actions";
import { GroupDetailView, type GroupDetailViewProps } from "./group-detail-view";
import { GroupInvitationPanel } from "./group-invitation-panel";
import styles from "./group-detail.module.css";

const inviteAction = fn(async (_previous: InvitePlayerState, form: FormData): Promise<InvitePlayerState> => ({ status: "sent", message: "Invitation sent to @" + form.get("handle") + "." }));
const invitation = <GroupInvitationPanel groupId="crew" url="https://booking.example/groups/join/preview-link" active inviteAction={inviteAction} />;
const membership = <section id="leave" className={styles.membership}><h2>Membership settings</h2><p>You can leave this group at any time. You&apos;ll need another invitation to rejoin.</p><Button variant="outline">Leave group</Button></section>;
const settings = <section id="settings" className={styles.settings}><h2>Group settings</h2><p className={styles.settingsIntro}>Manage your group&apos;s identity and lifecycle.</p><div className={styles.settingsSection}><h3>Group details</h3><p>Visible to members.</p></div><div className={styles.archiveSection}><h3>Archive group</h3><Button variant="outline">Archive group</Button></div></section>;
const members = [
  { key: "owner", name: "Rishi R", handle: "rishi_r", joined: "20 Oct 2026", isOwner: true, isYou: false },
  { key: "tester", name: "testingaccount1", handle: "testingaccount1", joined: "30 Oct 2026", isOwner: false, isYou: false },
  { key: "joseph", name: "Joseph", handle: "joseph", joined: "30 Oct 2026", isOwner: false, isYou: false },
  { key: "me", name: "Tian Pok Neoh", handle: "tian_pok_neoh", joined: "30 Oct 2026", isOwner: false, isYou: true },
] as const;
const pendingInvitations = [
  { key: "jamie", name: "Jamie Wong", handle: "jamiewong", invited: "28 Oct 2026" },
  { key: "cheryl", name: "Cheryl Lim", handle: "cheryllim", invited: "27 Oct 2026" },
  { key: "ryan", name: "Ryan Yap", handle: "ryanyap", invited: "25 Oct 2026" },
] as const;
const meta = {
  title: "Groups/Details", component: GroupDetailView,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/groups/crew" } } },
  decorators: [(Story) => <AppShell user={{ name: "Tian Pok Neoh", reliabilityScore: 100 }} logoutAction={fn()}><Story /></AppShell>],
  globals: { viewport: { value: "desktop", isRotated: false } },
  args: { groupId: "crew", name: "2006", ownerName: "Rishi R", isOwner: false, archived: false, members, invitation, membership },
} satisfies Meta<typeof GroupDetailView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Member: Story = {
  play: async ({ canvas, canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("heading", { name: "Members (4)" })).toBeVisible();
    await expect(canvas.getByText("@joseph")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "All groups" })).toHaveAttribute("href", "/groups");
    await userEvent.click(canvas.getByRole("tab", { name: "Settings" }));
    await expect(canvas.getByRole("button", { name: "Leave group" })).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "Members" }));
    await userEvent.click(canvas.getByRole("button", { name: "Invite players" }));
    await userEvent.click(dialog.getByRole("tab", { name: "Invite by user ID" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "User ID" }), "joseph");
    await userEvent.click(dialog.getByRole("button", { name: "Send invitation" }));
    await expect(await dialog.findByText("Invitation sent to @joseph.")).toBeVisible();
    const form = inviteAction.mock.calls.at(-1)?.[1];
    await expect(form?.get("groupId")).toBe("crew");
    await expect(form?.get("handle")).toBe("joseph");
  },
};
export const InvitationTab: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Invitations" }));
    await expect(canvas.getByRole("heading", { name: "No pending invitations" })).toBeVisible();
    await userEvent.click(canvas.getByLabelText("Options for 2006"));
    await userEvent.click(canvas.getByRole("link", { name: "View members" }));
    await expect(canvas.getByRole("heading", { name: "Members (4)" })).toBeVisible();
  },
};
export const PendingInvitations: Story = {
  args: { isOwner: true, membership: undefined, settings, pendingInvitations },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Invitations" }));
    await expect(canvas.getByRole("heading", { name: "Pending invitations" })).toBeVisible();
    await expect(canvas.getAllByText("Pending")).toHaveLength(3);
    await expect(canvas.getByText("Jamie Wong")).toBeVisible();
    await expect(canvas.getByText("@ryanyap")).toBeVisible();
  },
};
export const CopyDenied: Story = {
  play: async ({ canvas, canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } });
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Invite players" }));
      await userEvent.click(dialog.getByRole("button", { name: "Copy link" }));
      await expect(await dialog.findByText("Couldn't copy the link. Select the link above and copy it manually.")).toBeVisible();
      await expect(dialog.getByRole("textbox", { name: "Invitation link" })).toHaveValue("https://booking.example/groups/join/preview-link");
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  },
};
export const Owner: Story = {
  args: { isOwner: true, membership: undefined, settings, members: members.map((member) => ({ ...member, isYou: member.isOwner, removeControl: member.isOwner ? undefined : <Button variant="ghost" aria-label={"Remove " + member.name}>Remove</Button> })) },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("button", { name: /Remove / })).toHaveLength(3);
    await expect(canvas.queryByRole("button", { name: "Leave group" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByLabelText("Options for 2006"));
    await expect(canvas.getByRole("link", { name: "Group settings" })).toHaveAttribute("href", "/groups/crew#settings");
    await userEvent.click(canvas.getByRole("link", { name: "Group settings" }));
    await expect(canvas.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true");
  },
};
export const Archived: Story = {
  args: { archived: true, invitation: undefined, membership: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("This group is archived. Your members and their history are still here.")).toBeVisible();
    await expect(canvas.queryByRole("tab", { name: "Invitations" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Invite players" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Members (4)" })).toBeVisible();
  },
};
export const LinkOff: Story = {
  args: { invitation: <GroupInvitationPanel groupId="crew" url="" active={false} inviteAction={inviteAction} /> },
  play: async ({ canvas, canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Invite players" }));
    await expect(dialog.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("tab", { name: "Invite by user ID" }));
    await expect(dialog.queryByRole("button", { name: "Send invitation" })).not.toBeInTheDocument();
  },
};
function ArchivePreview(props: GroupDetailViewProps) {
  const [archived, setArchived] = useState(false);
  return <GroupDetailView {...props} isOwner archived={archived} invitation={archived ? undefined : props.invitation} membership={undefined}
    settings={archived ? undefined : <section id="settings"><Button onClick={() => setArchived(true)}>Archive group</Button></section>} />;
}
export const ArchiveWhileInviting: Story = {
  render: (args) => <ArchivePreview {...args} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Invitations" }));
    await userEvent.click(canvas.getByRole("tab", { name: "Settings" }));
    await userEvent.click(canvas.getByRole("button", { name: "Archive group" }));
    await expect(canvas.getByRole("heading", { name: "Members (4)" })).toBeVisible();
    await expect(canvas.queryByRole("tab", { name: "Invitations" })).not.toBeInTheDocument();
  },
};
export const DeletedMember: Story = {
  args: { members: [{ ...members[0], key: "deleted", name: "Deleted user", handle: null }] },
  play: async ({ canvas }) => { await expect(within(canvas.getByRole("list")).queryByText(/@/)).not.toBeInTheDocument(); },
};
export const Dark: Story = { globals: { theme: "dark" } };
export const Mobile: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByLabelText("Options for 2006")).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
export const MobileDark: Story = { ...Mobile, globals: { theme: "dark", viewport: { value: "phone", isRotated: false } } };
export const LongNamesMobile: Story = {
  ...Mobile, args: { name: "Weekend tennis players from the North Spine residences club", members: [{ ...members[0], name: "Alexandria Wei Ling Tan with a long display name", handle: "alexandria_wei_ling_tan_1234567890" }] },
  play: async ({ canvasElement }) => { await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth); },
};
