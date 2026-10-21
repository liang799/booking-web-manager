import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { useEffect, useState, type ComponentProps } from "react";
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
let changeAccount: ((userId: string) => void) | undefined;

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
  useEffect(() => {
    changeAccount = setUserId;
    return () => { changeAccount = undefined; };
  }, []);
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
  beforeEach: ({ parameters }) => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
    requests = [];
    accountRequests = [];
    changeAccount = undefined;
    hostedCalls = 0;
    reply = async ({ tab }) => response(tab === "hosting" ? hostedSessions : joinedSessions);
    // Next's Storybook navigation mock does not update the iframe's native URL.
    const originalUrl = window.location.href;
    const url = new URL(originalUrl);
    for (const key of ["tab", "session", "panel", "created"]) {
      url.searchParams.delete(key);
      const value = parameters.nextjs?.navigation?.query?.[key];
      if (typeof value === "string") url.searchParams.set(key, value);
    }
    window.history.replaceState(window.history.state, "", url);
    window.scrollTo({ top: 0, behavior: "instant" });
    getRouter().replace.mockClear();
    return () => {
      client.clear();
      window.history.replaceState(window.history.state, "", originalUrl);
    };
  },
} satisfies Meta<typeof SessionsController>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openSessionDetails(trigger: HTMLElement) {
  await userEvent.click(trigger);
  return within(await screen.findByRole("dialog", { name: "Tennis Court Booking" }));
}

async function closeSessionDetails() {
  await userEvent.click(within(screen.getByRole("dialog", { name: "Tennis Court Booking" })).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

export const CursorPagination: Story = {
  beforeEach: () => {
    reply = async ({ cursor }) => cursor ? response(joinedSessions.slice(5)) : response(joinedSessions.slice(0, 6), "next-six");
  },
  play: async ({ canvas }) => {
    const region = await canvas.findByRole("region", { name: "Joined session timeline" });
    const timeline = within(region);
    await waitFor(() => expect(region).toHaveAttribute("data-timeline-entrance", "complete"), { timeout: 3000 });
    await expect(timeline.getAllByRole("article")).toHaveLength(6);
    await expect(requests).toHaveLength(1);
    await expect(requests[0]).toMatchObject({ tab: "joined", cursor: null });
    await expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
    await userEvent.click(canvas.getByRole("button", { name: "Load more sessions" }));
    await waitFor(() => expect(timeline.getAllByRole("article")).toHaveLength(10));
    await expect(region).toHaveAttribute("data-timeline-entrance", "complete");
    await expect(requests).toHaveLength(2);
    await expect(requests[1]).toMatchObject({ tab: "joined", cursor: "next-six" });
    const cached = client.getQueryData<InfiniteData<SessionFeedResponse>>([...sessionFeedQueryKey, "player", "joined"]);
    await expect(cached?.pageParams).toEqual([null, "next-six"]);
    await expect(cached?.pages).toHaveLength(2);
    await expect(canvas.queryByRole("button", { name: "Load more sessions" })).not.toBeInTheDocument();
  },
};

export const EntranceDoesNotReplayAfterHosting: Story = {
  play: async ({ canvas }) => {
    const firstTimeline = await canvas.findByRole("region", { name: "Joined session timeline" });
    await waitFor(() => expect(firstTimeline).toHaveAttribute("data-timeline-entrance", "complete"), { timeout: 3000 });
    const navigation = within(canvas.getByRole("navigation", { name: "Session views" }));
    await userEvent.click(navigation.getByRole("button", { name: "Hosting" }));
    await canvas.findByRole("button", { name: "Manage Tennis Court Booking at Bukit Timah Community Club" });
    await expect(canvas.queryByRole("region", { name: "Joined session timeline" })).not.toBeInTheDocument();
    await userEvent.click(navigation.getByRole("button", { name: "Joined" }));
    await expect(await canvas.findByRole("region", { name: "Joined session timeline" })).toHaveAttribute("data-timeline-entrance", "complete");
  },
};

export const NewAccountGetsFreshEntrance: Story = {
  render: (args) => <AccountsHarness {...args} />,
  play: async ({ canvas }) => {
    const firstTimeline = await canvas.findByRole("region", { name: "Joined session timeline" });
    await waitFor(() => expect(firstTimeline).toHaveAttribute("data-timeline-entrance", "complete"), { timeout: 3000 });
    if (!changeAccount) throw new Error("The account harness has not mounted.");
    changeAccount("second-account");
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bishan Tennis Centre" });
    const secondTimeline = canvas.getByRole("region", { name: "Joined session timeline" });
    await expect(secondTimeline).not.toBe(firstTimeline);
    await expect(secondTimeline).not.toHaveAttribute("data-timeline-entrance", "complete");
    await waitFor(() => expect(secondTimeline).toHaveAttribute("data-timeline-entrance", "complete"), { timeout: 3000 });
  },
};

export const AccountAndTabCaches: Story = {
  render: (args) => <AccountsHarness {...args} />,
  play: async ({ canvas }) => {
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" });
    const firstDialog = await openSessionDetails(canvas.getByRole("button", { name: "View details" }));
    await userEvent.click(firstDialog.getByRole("tab", { name: "Participants (2)" }));
    await expect(firstDialog.getByRole("tab", { name: "Participants (2)" })).toHaveAttribute("aria-selected", "true");
    await closeSessionDetails();
    await userEvent.click(canvas.getByRole("button", { name: "Use second account" }));
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bishan Tennis Centre" });
    await expect(canvas.queryByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" })).not.toBeInTheDocument();
    const secondDialog = await openSessionDetails(canvas.getByRole("button", { name: "View details" }));
    await expect(secondDialog.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    await closeSessionDetails();
    const navigation = within(canvas.getByRole("navigation", { name: "Session views" }));
    await userEvent.click(navigation.getByRole("button", { name: "Hosting" }));
    await canvas.findByRole("button", { name: "Manage Tennis Court Booking at Bishan Tennis Centre" });
    await expect(new URL(window.location.href).searchParams.get("tab")).toBe("hosting");
    await userEvent.click(navigation.getByRole("button", { name: "Joined" }));
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bishan Tennis Centre" });
    await userEvent.click(canvas.getByRole("button", { name: "Use first account" }));
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" });
    const resetDialog = await openSessionDetails(canvas.getByRole("button", { name: "View details" }));
    await expect(resetDialog.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    await closeSessionDetails();
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

export const TimelineSelectionSurvivesTabChanges: Story = {
  play: async ({ canvas }) => {
    const second = await canvas.findByRole("button", { name: "Show Tennis Court Booking, 23 Oct 2026" });
    await userEvent.click(second);
    const dialog = await openSessionDetails(canvas.getByRole("button", { name: "View details" }));
    await userEvent.click(dialog.getByRole("tab", { name: "Participants (3)" }));
    await closeSessionDetails();
    const navigation = within(canvas.getByRole("navigation", { name: "Session views" }));
    await userEvent.click(navigation.getByRole("button", { name: "Hosting" }));
    await canvas.findByRole("button", { name: "Manage Tennis Court Booking at Bishan Tennis Centre" });
    await userEvent.click(navigation.getByRole("button", { name: "Joined" }));
    await expect(await canvas.findByRole("button", { name: "Show Tennis Court Booking, 23 Oct 2026" })).toHaveAttribute("aria-expanded", "true");
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const restoredDialog = await openSessionDetails(canvas.getByRole("button", { name: "View details" }));
    await expect(restoredDialog.getByRole("tab", { name: "Participants (3)" })).toHaveAttribute("aria-selected", "true");
    await expect(restoredDialog.getByRole("tabpanel")).toHaveTextContent("3 players have a place in this session.");
    await closeSessionDetails();
    await expect(requests.map(({ tab }) => tab)).toEqual(["joined", "hosting"]);
  },
};

export const UrlRestoresSessionAndPanelAcrossPages: Story = {
  parameters: { nextjs: { navigation: { query: { tab: "joined", session: joinedSessions[7]!.sessionId, panel: "participants" } } } },
  beforeEach: () => {
    reply = async ({ cursor }) => cursor ? response(joinedSessions.slice(6)) : response(joinedSessions.slice(0, 6), "restore-more");
  },
  play: async ({ canvas }) => {
    const selected = await canvas.findByRole("button", { name: "Show Tennis Court Booking, 10 Oct 2026" });
    await waitFor(() => expect(selected).toHaveAttribute("aria-expanded", "true"));
    await expect(requests.map(({ cursor }) => cursor)).toEqual([null, "restore-more"]);
    await expect(new URL(window.location.href).searchParams.get("session")).toBe(joinedSessions[7]!.sessionId);
    await expect(new URL(window.location.href).searchParams.get("panel")).toBe("participants");
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("tablist")).not.toBeInTheDocument();
    const dialog = await openSessionDetails(canvas.getByRole("button", { name: "View details" }));
    await expect(dialog.getByRole("tab", { name: "Participants (3)" })).toHaveAttribute("aria-selected", "true");
    await closeSessionDetails();
  },
};

export const MissingUrlSessionClearsAfterFinalPage: Story = {
  parameters: { nextjs: { navigation: { query: { tab: "joined", session: "54000000-0000-4000-8000-000000000999", panel: "participants" } } } },
  beforeEach: () => {
    reply = async ({ cursor }) => cursor ? response(joinedSessions.slice(6)) : response(joinedSessions.slice(0, 6), "restore-more");
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(new URL(window.location.href).searchParams.has("session")).toBe(false));
    await expect(new URL(window.location.href).searchParams.has("panel")).toBe(false);
    await expect(requests.map(({ cursor }) => cursor)).toEqual([null, "restore-more"]);
    await expect(canvas.getByRole("status")).toHaveTextContent("This session is no longer available in your joined sessions.");
    await expect(canvas.getByRole("button", { name: "Show Tennis Court Booking, 21 Oct 2026" })).toHaveAttribute("aria-expanded", "true");
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

export const UrlRestorationRetriesFailedPage: Story = {
  parameters: { nextjs: { navigation: { query: { tab: "joined", session: joinedSessions[7]!.sessionId, panel: "participants" } } } },
  beforeEach: () => {
    let nextAttempts = 0;
    reply = async ({ cursor }) => {
      if (!cursor) return response(joinedSessions.slice(0, 6), "restore-more");
      nextAttempts += 1;
      if (nextAttempts === 1) throw new SessionFeedLoadError("NETWORK_ERROR", "unexpected", false);
      return response(joinedSessions.slice(6));
    };
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("alert");
    await expect(new URL(window.location.href).searchParams.get("session")).toBe(joinedSessions[7]!.sessionId);
    await expect(new URL(window.location.href).searchParams.get("panel")).toBe("participants");
    await expect(requests.map(({ cursor }) => cursor)).toEqual([null, "restore-more"]);
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    const selected = await canvas.findByRole("button", { name: "Show Tennis Court Booking, 10 Oct 2026" });
    await waitFor(() => expect(selected).toHaveAttribute("aria-expanded", "true"));
    await expect(requests.map(({ cursor }) => cursor)).toEqual([null, "restore-more", "restore-more"]);
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const dialog = await openSessionDetails(canvas.getByRole("button", { name: "View details" }));
    await expect(dialog.getByRole("tab", { name: "Participants (3)" })).toHaveAttribute("aria-selected", "true");
    await closeSessionDetails();
  },
};

export const AccountChangeClearsUrlSelection: Story = {
  parameters: { nextjs: { navigation: { query: { tab: "joined", session: joinedSessions[0]!.sessionId, panel: "participants" } } } },
  render: (args) => <AccountsHarness {...args} />,
  play: async ({ canvas }) => {
    const firstDialog = await openSessionDetails(await canvas.findByRole("button", { name: "View details" }));
    await expect(firstDialog.getByRole("tab", { name: "Participants (2)" })).toHaveAttribute("aria-selected", "true");
    await closeSessionDetails();
    await expect(new URL(window.location.href).searchParams.get("session")).toBe(joinedSessions[0]!.sessionId);
    await userEvent.click(canvas.getByRole("button", { name: "Use second account" }));
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bishan Tennis Centre" });
    await expect(new URL(window.location.href).searchParams.has("session")).toBe(false);
    await expect(new URL(window.location.href).searchParams.has("panel")).toBe(false);
    const secondDialog = await openSessionDetails(canvas.getByRole("button", { name: "View details" }));
    await expect(secondDialog.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    await closeSessionDetails();
    await userEvent.click(canvas.getByRole("button", { name: "Use first account" }));
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" });
    await expect(new URL(window.location.href).searchParams.has("session")).toBe(false);
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const restoredDialog = await openSessionDetails(canvas.getByRole("button", { name: "View details" }));
    await expect(restoredDialog.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    await closeSessionDetails();
  },
};

export const AccountChangeClosesOpenSession: Story = {
  render: (args) => <AccountsHarness {...args} />,
  play: async ({ canvas }) => {
    const first = within(await canvas.findByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" }));
    await userEvent.click(first.getByRole("button", { name: "View details" }));
    await screen.findByRole("dialog", { name: "Tennis Court Booking" });
    // Authentication can change while a modal is open, without using inert background controls.
    if (!changeAccount) throw new Error("The account harness has not mounted.");
    changeAccount("second-account");
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bishan Tennis Centre" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole("button", { name: "Use first account" }));
    await canvas.findByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" });
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "View details" }));
    await screen.findByRole("dialog", { name: "Tennis Court Booking" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
};

export const JoinedSessionDetailsDialog: Story = {
  play: async ({ canvas }) => {
    const second = await canvas.findByRole("button", { name: "Show Tennis Court Booking, 23 Oct 2026" });
    second.focus();
    await userEvent.keyboard("{Enter}");
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.queryByRole("tablist")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: /View in calendar/ })).not.toBeInTheDocument();
    const trigger = canvas.getByRole("button", { name: "View details" });
    const dialog = await openSessionDetails(trigger);
    const details = dialog.getByRole("tab", { name: "Details" });
    details.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(dialog.getByRole("tab", { name: "Participants (3)" })).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("tabpanel")).toHaveTextContent("3 players have a place in this session.");
    await expect(dialog.getByRole("tabpanel")).toHaveTextContent("You have a place. See you on court.");
    await userEvent.keyboard("{Home}");
    await expect(details).toHaveAttribute("aria-selected", "true");
    const destination = new URL(dialog.getByRole("link", { name: /View in calendar/ }).getAttribute("href")!);
    await expect(destination.searchParams.get("dates")).toBe("20261022T230000Z/20261023T000000Z");
    await expect(destination.searchParams.get("ctz")).toBe("Asia/Singapore");
    await closeSessionDetails();
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(canvas.queryByRole("tablist")).not.toBeInTheDocument();
  },
};

export const ViewedSessionSurvivesPendingAndFailedRefresh: Story = {
  beforeEach: () => { reply = async () => response(joinedSessions.slice(0, 2)); },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Show Tennis Court Booking, 21 Oct 2026" }));
    const first = within(await canvas.findByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" }));
    await userEvent.click(first.getByRole("button", { name: "View details" }));
    const dialog = await screen.findByRole("dialog", { name: "Tennis Court Booking" });
    // Finding the dialog can precede its opening animation becoming visible.
    await waitFor(() => expect(dialog).toBeVisible());
    const queryKey = [...sessionFeedQueryKey, "player", "joined"];
    let rejectRefresh: ((reason: unknown) => void) | undefined;
    reply = () => new Promise((_resolve, reject) => { rejectRefresh = reject; });
    const refresh = client.refetchQueries({ queryKey, exact: true });
    await waitFor(() => expect(client.getQueryState(queryKey)?.fetchStatus).toBe("fetching"));
    await expect(dialog).toBeVisible();
    if (!rejectRefresh) throw new Error("The refresh request has not started.");
    rejectRefresh(new SessionFeedLoadError("NETWORK_ERROR", "unexpected", false));
    await refresh;
    await waitFor(() => expect(client.getQueryState(queryKey)?.status).toBe("error"));
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    reply = async () => response(joinedSessions);
    await client.refetchQueries({ queryKey, exact: true });
    await expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
};

export const SuccessfulRefreshClosesMissingViewedSession: Story = {
  beforeEach: () => { reply = async () => response(joinedSessions.slice(0, 2)); },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Show Tennis Court Booking, 21 Oct 2026" }));
    const first = within(await canvas.findByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" }));
    await userEvent.click(first.getByRole("button", { name: "View details" }));
    await screen.findByRole("dialog", { name: "Tennis Court Booking" });
    const queryKey = [...sessionFeedQueryKey, "player", "joined"];
    reply = async () => response(joinedSessions.slice(1, 2));
    await client.refetchQueries({ queryKey, exact: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(canvas.queryByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" })).not.toBeInTheDocument();
    // Restoring the record must not restore its old viewing mode.
    reply = async () => response(joinedSessions.slice(0, 2));
    await client.refetchQueries({ queryKey, exact: true });
    const restored = within(await canvas.findByRole("article", { name: "Tennis Court Booking at Bukit Timah Community Club" }));
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Show Tennis Court Booking, 21 Oct 2026" }));
    await userEvent.click(restored.getByRole("button", { name: "View details" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Tennis Court Booking" }));
    await userEvent.click(dialog.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
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
    await expect(new URL(window.location.href).searchParams.get("tab")).toBe("joined");
    await expect(new URL(window.location.href).searchParams.has("created")).toBe(false);
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

export const HostedManagementLoadingCanClose: Story = {
  parameters: { nextjs: { navigation: { pathname: "/sessions", query: { tab: "hosting" } } } },
  args: { loadHosted: () => new Promise<HostedSessionsResponse>(() => {}) },
  play: async ({ canvas }) => {
    const trigger = await canvas.findByRole("button", { name: "Manage Tennis Court Booking at Bukit Timah Community Club" });
    await userEvent.click(trigger);
    const dialogElement = await screen.findByRole("dialog", { name: "Tennis Court Booking" });
    const dialog = within(dialogElement);
    await expect(dialog.getByRole("status")).toHaveTextContent("Loading session controls…");
    const skeleton = dialogElement.querySelector<HTMLElement>("[data-session-controls-skeleton]");
    if (!skeleton) throw new Error("The session controls skeleton was not rendered.");
    await waitFor(() => expect(skeleton).toBeVisible());
    await expect(skeleton.querySelector('[aria-hidden="true"]')).toHaveAttribute("inert");
    await expect(skeleton.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).toHaveLength(0);
    await expect(dialogElement.querySelector('[class*="animate-spin"]')).toBeNull();
    await expect(dialog.queryByRole("button", { name: "Cancel session" })).not.toBeInTheDocument();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeEnabled();
    await userEvent.click(dialog.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
