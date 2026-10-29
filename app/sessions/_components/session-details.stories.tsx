import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import { SessionsController } from "./sessions-controller";
import { hostedSessions, sessionAccountActions } from "./sessions-fixtures";
import { toHostedSessionActions } from "../session-actions";
import type { SessionFeedItem } from "../session-feed-contract";

const session: SessionFeedItem = {
  ...hostedSessions[0]!, venueName: "PCF SPARKLETOTS PRESCHOOL @ CHUA CHU KANG BLK 123 (KN)", region: "West",
  startAt: "2026-11-06T09:50:00+08:00", endAt: "2026-11-06T11:20:00+08:00", capacity: 8, participantCount: 0,
};
let client: QueryClient;
const meta = {
  title: "Sessions/Session details", component: SessionsController,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/sessions", query: { tab: "hosting" } } } },
  decorators: [(Story) => <QueryClientProvider client={client}><AppShell user={{ name: "Tian Pok Neoh", reliabilityScore: 96 }}><Story /></AppShell></QueryClientProvider>],
  args: {
    userId: "details-preview", actions: sessionAccountActions,
    loadFeed: async () => ({ sessions: [session], nextCursor: null, asOf: "2026-10-29T08:00:00+08:00", upcomingCount: 1, pastCount: 0 }),
    loadHosted: async () => ({ sessions: [{ ...session, availableSlots: 8, actions: [...toHostedSessionActions(session.sessionId, [{ name: "set-visibility", visibility: "PRIVATE" }, { name: "preview-cancellation" }])] }], awaitingAttendance: [] }),
  },
  beforeEach: ({ parameters }) => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
    const originalUrl = window.location.href;
    const url = new URL(originalUrl);
    url.searchParams.set("tab", parameters.nextjs?.navigation?.query?.tab ?? "hosting");
    window.history.replaceState(window.history.state, "", url);
    return () => { client.clear(); window.history.replaceState(window.history.state, "", originalUrl); };
  },
  play: async ({ canvas, parameters }) => {
    if (parameters.themes?.themeOverride === "dark") await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    await userEvent.click(await canvas.findByRole("button", { name: window.innerWidth < 768 ? `View Tennis Court Booking at ${session.venueName}, 6 Nov 2026` : `Manage Tennis Court Booking at ${session.venueName}` }));
    const element = await screen.findByRole("dialog", { name: "Tennis session" });
    const dialog = within(element);
    await waitFor(() => expect(dialog.getByRole("button", { name: "Copy link" })).toBeVisible());
    await expect(dialog.getByText("Friday, 6 November 2026")).toBeVisible();
    await expect(dialog.getByText("0 of 8 players joined")).toBeVisible();
    await expect(dialog.getByText("1 hr 30 min", { exact: false })).toBeVisible();
    await expect(dialog.getAllByText(session.venueName, { exact: false })).toHaveLength(1);
    await expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
    await waitFor(() => expect(element.getBoundingClientRect().width).toBeLessThanOrEqual(620));
  },
} satisfies Meta<typeof SessionsController>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Hosting: Story = {};
export const HostingDark: Story = { parameters: { themes: { themeOverride: "dark" } }, globals: { theme: "dark" } };
export const HostingMobile: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const HostingMobileDark: Story = { parameters: { themes: { themeOverride: "dark" } }, globals: { theme: "dark", viewport: { value: "phone", isRotated: false } } };

export const CancelledHistory: Story = {
  args: {
    loadFeed: async () => ({ sessions: [{ ...session, status: "CANCELLED", section: "past" }], nextCursor: null, asOf: "2026-10-29T08:00:00+08:00", upcomingCount: 0, pastCount: 1 }),
    loadHosted: async () => ({ sessions: [], awaitingAttendance: [] }),
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: `View Tennis Court Booking at ${session.venueName}, 6 Nov 2026` }));
    const dialog = within(await screen.findByRole("dialog", { name: "Tennis session" }));
    await waitFor(() => expect(dialog.getByRole("link", { name: "View participants" })).toBeVisible());
    await expect(dialog.queryByRole("button", { name: "Cancel session" })).not.toBeInTheDocument();
    await expect(dialog.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
  },
};

export const Joined: Story = {
  parameters: { nextjs: { navigation: { query: { tab: "joined" } } } },
  args: { loadFeed: async () => ({ sessions: [{ ...session, role: "PARTICIPANT", participationStatus: "COMMITTED", participantCount: 3 }], nextCursor: null, asOf: "2026-10-29T08:00:00+08:00", upcomingCount: 1, pastCount: 0 }) },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: window.innerWidth < 768 ? `View Tennis Court Booking at ${session.venueName}, 6 Nov 2026` : "View details" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Tennis session" }));
    await waitFor(() => expect(dialog.getByRole("button", { name: "Leave session" })).toBeVisible());
    await expect(dialog.getByText("Joined", { exact: true })).toBeVisible();
    await expect(dialog.queryByRole("button", { name: "Cancel session" })).not.toBeInTheDocument();
    await expect(dialog.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
  },
};

export const InProgress: Story = {
  ...Joined,
  args: { loadFeed: async () => ({ sessions: [{ ...session, role: "PARTICIPANT", participationStatus: "COMMITTED", participantCount: 3 }], nextCursor: null, asOf: "2026-11-06T10:15:00+08:00", upcomingCount: 1, pastCount: 0 }) },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "View details" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Tennis session" }));
    await waitFor(() => expect(dialog.getByText("Friday, 6 November 2026")).toBeVisible());
    await expect(dialog.queryByRole("button", { name: "Leave session" })).not.toBeInTheDocument();
  },
};
