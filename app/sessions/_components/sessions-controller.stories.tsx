import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import type { HostedSessionsResponse } from "../hosted-sessions-contract";
import { toHostedSessionActions } from "../session-actions";
import type { SessionFeedItem, SessionFeedResponse } from "../session-feed-contract";
import { SessionFeedLoadError, type LoadSessionFeed } from "../session-feed-transport";
import { SessionsController, sessionFeedQueryKey } from "./sessions-controller";
import { hostedSessions, joinedSessions, sessionAccountActions, sessionsAsOf } from "./sessions-fixtures";

function response(sessions: readonly SessionFeedItem[], nextCursor: string | null = null): SessionFeedResponse {
  return { sessions: [...sessions], nextCursor, asOf: sessionsAsOf, upcomingCount: 4, pastCount: 6 };
}

type FeedRequest = Parameters<LoadSessionFeed>[0];
let requests: FeedRequest[] = [];
let reply: LoadSessionFeed = async ({ tab }) => response(tab === "hosting" ? hostedSessions : joinedSessions);
let client: QueryClient;
let hostedCalls = 0;
let accountRequests: { readonly userId: string; readonly tab: FeedRequest["tab"] }[] = [];

const loadFeed: LoadSessionFeed = async (input) => {
  requests.push(input);
  return reply(input);
};

async function loadHosted(): Promise<HostedSessionsResponse> {
  hostedCalls += 1;
  const session = hostedSessions[0]!;
  return {
    sessions: [{
      sessionId: session.sessionId,
      venueName: session.venueName,
      sport: session.sport,
      region: session.region,
      startAt: session.startAt,
      endAt: session.endAt,
      visibility: "PUBLIC",
      availableSlots: 2,
      actions: [...toHostedSessionActions(session.sessionId, [
        { name: "set-visibility", visibility: "PRIVATE" },
        { name: "preview-cancellation" },
      ])],
    }],
    awaitingAttendance: [],
  };
}

function AccountsHarness(props: ComponentProps<typeof SessionsController>) {
  const [userId, setUserId] = useState("first-account");
  return <>
    <div className="flex gap-3 px-10 pt-4">
      <button type="button" className="min-h-11 rounded border px-3" onClick={() => setUserId("first-account")}>Use first account</button>
      <button type="button" className="min-h-11 rounded border px-3" onClick={() => setUserId("second-account")}>Use second account</button>
    </div>
    <SessionsController {...props} userId={userId} loadFeed={async ({ tab }) => {
      accountRequests.push({ userId, tab });
      const source = tab === "hosting" ? hostedSessions : joinedSessions;
      return response(source.slice(userId === "first-account" ? 0 : 1, userId === "first-account" ? 1 : 2));
    }} />
  </>;
}

const meta = {
  title: "Sessions/Overview loading",
  component: SessionsController,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/sessions" } },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [(Story) => (
    <QueryClientProvider client={client}>
      <AppShell user={{ name: "NTP", reliabilityScore: 96 }}><Story /></AppShell>
    </QueryClientProvider>
  )],
  args: { userId: "player", actions: sessionAccountActions, loadFeed, loadHosted },
  beforeEach: () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
    requests = [];
    accountRequests = [];
    hostedCalls = 0;
    reply = async ({ tab }) => response(tab === "hosting" ? hostedSessions : joinedSessions);
    window.scrollTo({ top: 0, behavior: "instant" });
    getRouter().replace.mockClear();
    return () => client.clear();
  },
} satisfies Meta<typeof SessionsController>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CursorPagination: Story = {
  beforeEach: () => {
    reply = async ({ cursor }) => cursor ? response(joinedSessions.slice(5)) : response(joinedSessions.slice(0, 6), "next-six");
  },
  play: async ({ canvas }) => {
    const timeline = within(await canvas.findByRole("region", { name: "Joined session timeline" }));
    await expect(timeline.getAllByRole("article")).toHaveLength(6);
    await expect(requests).toHaveLength(1);
    await expect(requests[0]).toMatchObject({ tab: "joined", cursor: null });
    await expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
    await userEvent.click(canvas.getByRole("button", { name: "Load more sessions" }));
    await waitFor(() => expect(timeline.getAllByRole("article")).toHaveLength(10));
    await expect(requests).toHaveLength(2);
    await expect(requests[1]).toMatchObject({ tab: "joined", cursor: "next-six" });
    const cached = client.getQueryData<InfiniteData<SessionFeedResponse>>([...sessionFeedQueryKey, "player", "joined"]);
    await expect(cached?.pageParams).toEqual([null, "next-six"]);
    await expect(cached?.pages).toHaveLength(2);
    await expect(canvas.queryByRole("button", { name: "Load more sessions" })).not.toBeInTheDocument();
  },
};

export const AccountAndTabCaches: Story = {
  render: (args) => <AccountsHarness {...args} />,
  play: async ({ canvas }) => {
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" });
    await userEvent.click(canvas.getByRole("button", { name: "Use second account" }));
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bishan Tennis Centre" });
    await expect(canvas.queryByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" })).not.toBeInTheDocument();
    const navigation = within(canvas.getByRole("navigation", { name: "Session views" }));
    await userEvent.click(navigation.getByRole("button", { name: "Hosting" }));
    await canvas.findByRole("button", { name: "Manage Tennis Court Booking at Bishan Tennis Centre" });
    await expect(getRouter().replace).toHaveBeenCalledWith("/sessions?tab=hosting", { scroll: false });
    await userEvent.click(navigation.getByRole("button", { name: "Joined" }));
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bishan Tennis Centre" });
    await userEvent.click(canvas.getByRole("button", { name: "Use first account" }));
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" });
    await expect(accountRequests).toEqual([
      { userId: "first-account", tab: "joined" },
      { userId: "second-account", tab: "joined" },
      { userId: "second-account", tab: "hosting" },
    ]);
    await expect(client.getQueryData([...sessionFeedQueryKey, "first-account", "joined"])).toBeDefined();
    await expect(client.getQueryData([...sessionFeedQueryKey, "second-account", "joined"])).toBeDefined();
    await expect(client.getQueryData([...sessionFeedQueryKey, "second-account", "hosting"])).toBeDefined();
  },
};

export const NextPageFailureAndRetry: Story = {
  beforeEach: () => {
    let nextAttempts = 0;
    reply = async ({ cursor }) => {
      if (!cursor) return response(joinedSessions.slice(0, 6), "retry-six");
      nextAttempts += 1;
      if (nextAttempts === 1) throw new SessionFeedLoadError("NETWORK_ERROR", "unexpected", false);
      return response(joinedSessions.slice(6));
    };
  },
  play: async ({ canvas }) => {
    const timeline = within(await canvas.findByRole("region", { name: "Joined session timeline" }));
    await userEvent.click(canvas.getByRole("button", { name: "Load more sessions" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("We couldn’t load your sessions.");
    await expect(timeline.getAllByRole("article")).toHaveLength(6);
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(timeline.getAllByRole("article")).toHaveLength(10));
    await expect(requests.map(({ cursor }) => cursor)).toEqual([null, "retry-six", "retry-six"]);
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};

export const ExpiredSignIn: Story = {
  beforeEach: () => {
    reply = async () => { throw new SessionFeedLoadError("UNAUTHENTICATED", "unexpected", true); };
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(getRouter().replace).toHaveBeenCalledWith("/login?next=%2Fsessions"));
    await expect(canvas.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("region", { name: "Joined session timeline" })).not.toBeInTheDocument();
  },
};

export const CreatedSessionOpensHosting: Story = {
  parameters: { nextjs: { navigation: { pathname: "/sessions", query: { created: "1" } } } },
  play: async ({ canvas }) => {
    await canvas.findByRole("button", { name: "Manage Tennis Court Booking at Bukit Timah Community Club" });
    await expect(canvas.getByRole("status")).toHaveTextContent("Your session was created successfully.");
    await expect(requests[0]).toMatchObject({ tab: "hosting", cursor: null });
    const navigation = within(canvas.getByRole("navigation", { name: "Session views" }));
    await expect(navigation.getByRole("button", { name: "Hosting" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(navigation.getByRole("button", { name: "Joined" }));
    await expect(getRouter().replace).toHaveBeenCalledWith("/sessions?tab=joined", { scroll: false });
  },
};

export const HostedManagementDialog: Story = {
  parameters: { nextjs: { navigation: { pathname: "/sessions", query: { tab: "hosting" } } } },
  play: async ({ canvas }) => {
    const trigger = await canvas.findByRole("button", { name: "Manage Tennis Court Booking at Bukit Timah Community Club" });
    await userEvent.click(trigger);
    const dialog = within(await screen.findByRole("dialog", { name: "Tennis Court Booking" }));
    const participants = await dialog.findByRole("link", { name: "Manage participants" });
    await expect(participants).toHaveAttribute("href", `/sessions/${hostedSessions[0]!.sessionId}/participants`);
    await waitFor(() => expect(dialog.getByRole("button", { name: "Make private" })).toBeVisible());
    await expect(dialog.getByRole("button", { name: "Cancel session" })).toBeVisible();
    await expect(hostedCalls).toBe(1);
    await userEvent.click(dialog.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toBeVisible();
  },
};
