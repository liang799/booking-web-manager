import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useMemo } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import { NotificationsClient } from "./notifications-client";
import type { InboxPage, NotificationItem } from "../transport";
import type { NotificationFilter } from "@/use-cases/notifications/notification-inbox";

const fixtures: NotificationItem[] = [
  ["You're in!", "A place opened up and your share is now held for this session.", "2026-10-29T08:25:00Z", null, "/sessions/joined"],
  ["You've been invited to take a place", "A participant has named you as their replacement. Accept before the session starts.", "2026-10-29T07:20:00Z", null, "/sessions/joined"],
  ["Verify attendance", "Your session has ended. Mark who attended; unverified participants are marked attended automatically 72 hours after the end.", "2026-10-29T05:30:00Z", null, "/sessions/example/participants"],
  ["Your share is still held", "You withdrew less than 30 hours before the start. Your share is forfeited to the booker unless someone replaces you before the session starts.", "2026-10-28T03:19:00Z", "2026-10-28T04:00:00Z", "/wallet"],
  ["You missed a place", "A place opened up, but your wallet couldn't cover your share, so you left the waitlist. Top up and join again if places remain.", "2026-10-28T01:02:00Z", "2026-10-28T04:00:00Z", "/wallet"],
  ["Your share was forfeited", "The session started without a replacement, so your held share goes to the booker.", "2026-10-27T10:14:00Z", "2026-10-28T04:00:00Z", "/wallet"],
].map(([title, body, createdAt, readAt, url], index) => ({
  id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, category: "bookings", title: title!, body: body!, createdAt: createdAt!, readAt: readAt ?? null, url: url!,
}));

function Demo({ empty = false, unavailable = false, saveFails = false, slow = false }: { empty?: boolean; unavailable?: boolean; saveFails?: boolean; slow?: boolean }) {
  const transport = useMemo(() => {
    let items = empty ? [] : fixtures.map((item) => ({ ...item }));
    return {
      readPage: async (filter: NotificationFilter): Promise<InboxPage> => {
        if (slow && filter === "all") await new Promise((resolve) => setTimeout(resolve, 200));
        if (unavailable) throw new Error("We couldn't load your notifications. Please try again.");
        return { items: items.filter((item) => filter === "all" || filter === item.category || (filter === "unread" && !item.readAt)), unreadCount: items.filter((item) => !item.readAt).length, nextCursor: null };
      },
      saveRead: async (id: string) => {
        if (saveFails) throw new Error("We couldn't save your read status. Please try again.");
        items = items.map((item) => id === "all" || item.id === id ? { ...item, readAt: new Date().toISOString() } : item);
      },
    };
  }, [empty, unavailable, saveFails, slow]);
  return <NotificationsClient {...transport} />;
}

const meta = {
  title: "Notifications/Inbox", component: Demo,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/notifications" } } },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [(Story) => <AppShell user={{ name: "Tian Pok Neoh", reliabilityScore: 100 }}><Story /></AppShell>],
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"));
    await expect(await page.findByText("You're in!")).toBeVisible();
    await expect(page.getByText("3 unread")).toBeVisible();
  },
};
export const Dark: Story = { globals: { theme: "dark" } };
export const Phone: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(await within(canvas.getByRole("main")).findByText("You're in!")).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth);
    await expect(canvas.getByRole("link", { name: "Notifications" })).toBeVisible();
  },
};
export const ReadAndFilter: Story = {
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"));
    await page.findByText("3 unread");
    await userEvent.click(page.getByRole("button", { name: "unread" }));
    await waitFor(() => expect(page.queryByText("Your share is still held")).not.toBeInTheDocument());
    await userEvent.click(await page.findByRole("button", { name: "Mark as read: You're in!" }));
    await page.findByText("2 unread");
    await userEvent.click(page.getByRole("button", { name: "Mark all as read" }));
    await expect(await page.findByText("You're all caught up")).toBeVisible();
    await expect(page.getByText("0 unread")).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "groups" }));
    await expect(await page.findByText("No group notifications yet")).toBeVisible();
  },
};
export const Empty: Story = { args: { empty: true }, play: async ({ canvas }) => { await expect(await canvas.findByText("No notifications yet")).toBeVisible(); } };
export const Unavailable: Story = { args: { unavailable: true }, play: async ({ canvas }) => { await expect(await canvas.findByRole("alert")).toHaveTextContent("couldn't load"); } };
export const SaveFailure: Story = {
  args: { saveFails: true },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"));
    await page.findByText("3 unread");
    await userEvent.click(page.getByRole("button", { name: "Mark all as read" }));
    await expect(await page.findByRole("alert")).toHaveTextContent("couldn't save");
    await expect(page.getByText("3 unread")).toBeVisible();
    await expect(page.getByText("You're in!")).toBeVisible();
  },
};
export const RapidFilterChanges: Story = {
  args: { slow: true },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"));
    await userEvent.click(page.getByRole("button", { name: "groups" }));
    await expect(await page.findByText("No group notifications yet")).toBeVisible();
    // Wait past the intentionally late first response to establish that it is ignored.
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(page.queryByText("You're in!")).not.toBeInTheDocument();
    await expect(page.getByRole("button", { name: "groups" })).toHaveAttribute("aria-pressed", "true");
  },
};
