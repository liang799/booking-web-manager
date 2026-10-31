import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useMemo } from "react";
import { expect, userEvent, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import { NotificationsClient } from "./notifications-client";
import type { InboxPage, NotificationItem } from "../transport";
import type { NotificationFilter } from "@/use-cases/notifications/notification-inbox";

const fixtures: NotificationItem[] = [
  [
    "You're in!",
    "A place opened up and your share is now held for this session.",
    "2026-10-29T08:25:00Z",
    null,
    "/sessions/joined",
  ],
  [
    "You've been invited to take a place",
    "A participant has named you as their replacement. Accept before the session starts.",
    "2026-10-29T07:20:00Z",
    null,
    "/sessions/joined",
  ],
  [
    "Verify attendance",
    "Your session has ended. Mark who attended; unverified participants are marked attended automatically 72 hours after the end.",
    "2026-10-29T05:30:00Z",
    null,
    "/sessions/example/participants",
  ],
  [
    "Your share is still held",
    "You withdrew less than 30 hours before the start. Your share is forfeited to the booker unless someone replaces you before the session starts.",
    "2026-10-28T03:19:00Z",
    "2026-10-28T04:00:00Z",
    "/wallet",
  ],
  [
    "You missed a place",
    "A place opened up, but your wallet couldn't cover your share, so you left the waitlist. Top up and join again if places remain.",
    "2026-10-28T01:02:00Z",
    "2026-10-28T04:00:00Z",
    "/wallet",
  ],
  [
    "Your share was forfeited",
    "The session started without a replacement, so your held share goes to the booker.",
    "2026-10-27T10:14:00Z",
    "2026-10-28T04:00:00Z",
    "/wallet",
  ],
].map(([title, body, createdAt, , url], index) => ({
  id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  category: "bookings",
  title: title!,
  body: body!,
  createdAt: createdAt!,
  url: url!,
}));

function Demo({
  empty = false,
  unavailable = false,
  slow = false,
}: {
  empty?: boolean;
  unavailable?: boolean;
  slow?: boolean;
}) {
  const transport = useMemo(() => {
    try {
      localStorage.removeItem("notifications:v1:notification-preview");
    } catch {
      /* Deterministic fixture without requiring browser storage. */
    }
    const items = empty ? [] : fixtures.map((item) => ({ ...item }));
    return {
      readPage: async (filter: NotificationFilter): Promise<InboxPage> => {
        if (slow && filter === "all")
          await new Promise((resolve) => setTimeout(resolve, 200));
        if (unavailable)
          throw new Error(
            "We couldn't load your notifications. Please try again.",
          );
        return {
          items: items.filter(
            (item) => filter === "all" || filter === item.category,
          ),
          retentionCutoff: "2026-09-29T00:00:00.000Z",
          nextCursor: null,
        };
      },
    };
  }, [empty, unavailable, slow]);
  return <NotificationsClient {...transport} />;
}

const meta = {
  title: "Notifications/Inbox",
  component: Demo,
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/notifications" } },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [
    (Story) => (
      <AppShell user={{ name: "Tian Pok Neoh", reliabilityScore: 100 }}>
        <Story />
      </AppShell>
    ),
  ],
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"));
    await expect(await page.findByText("You're in!")).toBeVisible();
    await expect(page.queryByText(/\d+ unread/)).not.toBeInTheDocument();
  },
};
export const Dark: Story = { globals: { theme: "dark" } };
export const Phone: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await within(canvas.getByRole("main")).findByText("You're in!"),
    ).toBeVisible();
    await expect(
      canvasElement.ownerDocument.documentElement.scrollWidth,
    ).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth,
    );
    await expect(
      canvas.getByRole("link", { name: "Notifications" }),
    ).toBeVisible();
  },
};
export const ReadAndFilter: Story = {
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"));
    await page.findByText("You're in!");
    await userEvent.click(
      await page.findByRole("button", { name: "Mark as read: You're in!" }),
    );
    await expect(
      page.queryByRole("button", { name: "Mark as read: You're in!" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      page.getByRole("button", { name: "Mark all as read" }),
    );
    await userEvent.click(page.getByRole("button", { name: "groups" }));
    await expect(
      await page.findByText("No group notifications yet"),
    ).toBeVisible();
  },
};
export const Empty: Story = {
  args: { empty: true },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No notifications yet")).toBeVisible();
  },
};
export const Unavailable: Story = {
  args: { unavailable: true },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "couldn't load",
    );
  },
};
export const RapidFilterChanges: Story = {
  args: { slow: true },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"));
    await userEvent.click(page.getByRole("button", { name: "groups" }));
    await expect(
      await page.findByText("No group notifications yet"),
    ).toBeVisible();
    // Wait past the intentionally late first response to establish that it is ignored.
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(page.queryByText("You're in!")).not.toBeInTheDocument();
    await expect(page.getByRole("button", { name: "groups" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
};
