import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import { hostedSessions, joinedSessions, sessionAccountActions, sessionsAsOf } from "./sessions-fixtures";
import { SessionsView } from "./sessions-view";
import { SessionsUiProvider } from "./sessions-ui-provider";

const meta = {
  title: "Sessions/Overview",
  component: SessionsView,
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/sessions" } },
    docs: {
      description: {
        component: "The signed-in sessions overview. Joined sessions use a scroll-driven desktop timeline with one current expanded session. Hosting shows upcoming cards and compact history. Below 768px both views use the simple dated list. All dates and calendar links use Singapore time; artwork is decorative and participant icons represent aggregate counts.",
      },
    },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [(Story, { args }) => <SessionsUiProvider initialTab={args.tab}><AppShell user={{ name: "NTP", reliabilityScore: 96 }}><Story /></AppShell></SessionsUiProvider>],
  beforeEach: () => {
    window.scrollTo({ top: 0, behavior: "instant" });
  },
  args: {
    tab: "joined",
    onTabChange: fn(),
    sessions: joinedSessions,
    asOf: sessionsAsOf,
    upcomingCount: 4,
    pastCount: 6,
    actions: sessionAccountActions,
    onLoadMore: fn(),
    onRetry: fn(),
    onOpenSession: fn(),
  },
} satisfies Meta<typeof SessionsView>;

export default meta;
type Story = StoryObj<typeof meta>;

async function expectNoHorizontalOverflow() {
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
}

function timelineDay(canvasElement: HTMLElement, index: number) {
  const day = canvasElement.querySelector<HTMLElement>(`[data-session-id="${joinedSessions[index]!.sessionId}"] [data-date-control] time strong`);
  if (!day) throw new globalThis.Error("The timeline date was not rendered.");
  return day;
}

async function expectTimelineHierarchy(canvasElement: HTMLElement, activeIndex: number) {
  const activeDay = timelineDay(canvasElement, activeIndex);
  await expect(getComputedStyle(activeDay).fontSize).toBe("48px");
  await expect(getComputedStyle(activeDay).fontWeight).toBe("700");
  for (const [index] of joinedSessions.entries()) {
    if (index !== activeIndex) await expect(getComputedStyle(timelineDay(canvasElement, index)).fontSize).toBe("26px");
  }
  // Wait through the marker's movement, then compare actual centers so padding
  // or font changes cannot leave the dot aligned with an obsolete fixed offset.
  await waitFor(() => {
    const marker = canvasElement.querySelector<HTMLElement>("[data-timeline-marker]");
    if (!marker) throw new globalThis.Error("The current timeline marker was not rendered.");
    const markerBounds = marker.getBoundingClientRect();
    const dayBounds = activeDay.getBoundingClientRect();
    expect(Math.abs(markerBounds.top + markerBounds.height / 2 - dayBounds.top - dayBounds.height / 2)).toBeLessThan(1.5);
  });
}

export const DesktopJoined: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Sessions" })).toBeVisible();
    const views = within(canvas.getByRole("navigation", { name: "Session views" }));
    await expect(views.getByRole("button", { name: /^Joined$/ })).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("heading", { name: "This week" })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Earlier this month" })).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("tab", { name: "Participants (2)" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: /^New session$/ })).toHaveAttribute("href", "/sessions/create");
    await expectTimelineHierarchy(canvasElement, 0);
    await expectNoHorizontalOverflow();
  },
};

/** Matches the reference composition: two quiet rows precede the current session. */
export const DesktopCurrentSessionHierarchy: Story = {
  play: async ({ canvas, canvasElement }) => {
    const third = canvasElement.querySelector<HTMLElement>(`#timeline-card-${joinedSessions[2]!.sessionId}`);
    if (!third) throw new globalThis.Error("The third session card was not rendered.");
    await userEvent.click(within(third).getByRole("button", { name: "Expand Tennis Court Booking at Choa Chu Kang Tennis Centre" }));
    await expect(canvas.getByRole("button", { name: "Show Tennis Court Booking, 24 Oct 2026" })).toHaveAttribute("aria-expanded", "true");
    await expectTimelineHierarchy(canvasElement, 2);
    await expect(getComputedStyle(timelineDay(canvasElement, 0)).color).toBe(getComputedStyle(timelineDay(canvasElement, 1)).color);
    await expect(getComputedStyle(timelineDay(canvasElement, 0)).color).not.toBe(getComputedStyle(timelineDay(canvasElement, 2)).color);
    await expectNoHorizontalOverflow();
  },
};

export const DesktopHosting: Story = {
  args: { tab: "hosting", sessions: hostedSessions },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("heading", { name: "Upcoming (4)" })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Past (6)" })).toBeVisible();
    const upcoming = canvas.getByRole("region", { name: "Upcoming (4)" });
    await expect(within(upcoming).getAllByRole("button", { name: /^Manage / })).toHaveLength(4);
    const past = canvas.getByRole("region", { name: "Past (6)" });
    await expect(within(past).getAllByRole("button", { name: /^View / })).toHaveLength(6);
    await userEvent.click(within(upcoming).getByRole("button", { name: "Manage Tennis Court Booking at Bukit Timah Community Club" }));
    await expect(args.onOpenSession).toHaveBeenCalledWith(hostedSessions[0]);
    await expectNoHorizontalOverflow();
  },
};

export const MobileJoined: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
  play: async ({ canvas, args }) => {
    const navigation = within(canvas.getByRole("navigation", { name: "Main" }));
    await expect(navigation.getByRole("link", { name: /^Sessions$/ })).toHaveAttribute("aria-current", "page");
    const list = within(canvas.getByRole("list", { name: "Joined sessions" }));
    await expect(list.getAllByRole("listitem")).toHaveLength(10);
    const first = list.getByRole("button", { name: "View Tennis Court Booking at Bukit Timah Community Club, 21 Oct 2026" });
    await expect(first.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(first).toHaveTextContent("7:00 PM – 8:00 PM");
    await userEvent.click(first);
    await expect(args.onOpenSession).toHaveBeenCalledWith(joinedSessions[0]);
    await expect(canvas.queryByRole("tab", { name: "Details" })).not.toBeInTheDocument();
    await expectNoHorizontalOverflow();
  },
};

export const MobileHosting: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
  args: { tab: "hosting", sessions: hostedSessions },
  play: async ({ canvas }) => {
    const views = within(canvas.getByRole("navigation", { name: "Session views" }));
    await expect(views.getByRole("button", { name: /^Hosting$/ })).toHaveAttribute("aria-current", "page");
    const list = within(canvas.getByRole("list", { name: "Hosting sessions" }));
    await expect(list.getAllByRole("listitem")).toHaveLength(10);
    await expect(views.getByRole("link", { name: "Groups" })).toHaveAttribute("href", "/groups");
    await expectNoHorizontalOverflow();
  },
};

/** A two-session example preserves the quiet composition of the mobile reference. */
export const MobileReference: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
  args: { sessions: joinedSessions.slice(0, 2), upcomingCount: 2, pastCount: 0 },
  play: async ({ canvas }) => {
    await expect(within(canvas.getByRole("list", { name: "Joined sessions" })).getAllByRole("listitem")).toHaveLength(2);
    await expectNoHorizontalOverflow();
  },
};

export const DesktopDark: Story = {
  ...DesktopJoined,
  globals: { theme: "dark", viewport: { value: "desktop", isRotated: false } },
};

export const MobileDark: Story = {
  ...MobileJoined,
  globals: { theme: "dark", viewport: { value: "phone", isRotated: false } },
};

export const EmptyJoined: Story = {
  args: { sessions: [], upcomingCount: 0, pastCount: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Your next game starts here." })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Find a session" })).toHaveAttribute("href", "/discover?returnTo=%2Fsessions");
    await expectNoHorizontalOverflow();
  },
};

export const EmptyHosting: Story = {
  args: { tab: "hosting", sessions: [], upcomingCount: 0, pastCount: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Make time for a game." })).toBeVisible();
    await expect(canvas.getAllByRole("link", { name: "New session" })).toHaveLength(2);
    await expectNoHorizontalOverflow();
  },
};

export const Loading: Story = {
  args: { sessions: [], loading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading your sessions…");
    await expect(canvas.queryByRole("heading", { name: "Your next game starts here." })).not.toBeInTheDocument();
    await expectNoHorizontalOverflow();
  },
};

export const Error: Story = {
  args: { sessions: [], error: "We couldn’t load your sessions. Please try again." },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("We couldn’t load your sessions.");
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
    await expectNoHorizontalOverflow();
  },
};

export const KeyboardAndParticipantDetails: Story = {
  play: async ({ canvas, canvasElement, args, step }) => {
    await step("The date control expands a session with the keyboard", async () => {
      const date = canvas.getByRole("button", { name: "Show Tennis Court Booking, 23 Oct 2026" });
      date.focus();
      await userEvent.keyboard("{Enter}");
      await expect(date).toHaveAttribute("aria-expanded", "true");
      await expect(canvas.getByRole("button", { name: "Show Tennis Court Booking, 21 Oct 2026" })).toHaveAttribute("aria-expanded", "false");
      await expectTimelineHierarchy(canvasElement, 1);
    });
    await step("The expanded card exposes truthful attendance and calendar details", async () => {
      const expanded = canvasElement.querySelector<HTMLElement>(`#timeline-card-${joinedSessions[1]!.sessionId}`);
      if (!expanded) throw new globalThis.Error("The expanded session card was not rendered.");
      const card = within(expanded);
      await userEvent.click(card.getByRole("tab", { name: "Participants (3)" }));
      await expect(card.getByRole("tabpanel")).toHaveTextContent("3 players have a place in this session.");
      await expect(card.getByRole("tabpanel")).toHaveTextContent("You have a place. See you on court.");
      await userEvent.click(card.getByRole("tab", { name: "Details" }));
      const calendar = card.getByRole("link", { name: /View in calendar/ });
      const destination = new URL(calendar.getAttribute("href")!);
      await expect(destination.searchParams.get("dates")).toBe("20261022T230000Z/20261023T000000Z");
      await expect(destination.searchParams.get("ctz")).toBe("Asia/Singapore");
      await userEvent.click(card.getByRole("button", { name: "View session" }));
      await expect(args.onOpenSession).toHaveBeenCalledWith(joinedSessions[1]);
    });
    await step("The hosting tab delegates the controlled tab change", async () => {
      const views = within(canvas.getByRole("navigation", { name: "Session views" }));
      await userEvent.click(views.getByRole("button", { name: /^Hosting$/ }));
      await expect(args.onTabChange).toHaveBeenCalledWith("hosting");
    });
    await step("A selected historical date stays subdued while gaining the current date size", async () => {
      const pastDay = timelineDay(canvasElement, 4);
      const historicalColor = getComputedStyle(pastDay).color;
      await userEvent.click(canvas.getByRole("button", { name: "Show Tennis Court Booking, 20 Oct 2026" }));
      await expectTimelineHierarchy(canvasElement, 4);
      await expect(getComputedStyle(pastDay).color).toBe(historicalColor);
    });
    await expectNoHorizontalOverflow();
  },
};

export const ScrollAdvancesCurrentSession: Story = {
  play: async ({ canvas, canvasElement }) => {
    const nextDate = canvas.getByRole("button", { name: "Show Tennis Court Booking, 23 Oct 2026" });
    await expect(nextDate).toHaveAttribute("aria-expanded", "false");
    // Exercise the real page scroll. Keep focus outside the timeline: keyboard focus deliberately pauses automatic selection.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const nextRow = canvasElement.querySelector(`[data-session-id="${joinedSessions[1]!.sessionId}"]`);
    if (!nextRow) throw new globalThis.Error("The second timeline row was not rendered.");
    const threshold = Math.min(window.innerHeight * 0.32, 260);
    window.scrollTo({ top: window.scrollY + nextRow.getBoundingClientRect().top - threshold + 8, behavior: "instant" });
    await waitFor(async () => {
      await expect(nextDate).toHaveAttribute("aria-expanded", "true");
      await expect(nextRow).toHaveAttribute("data-current", "true");
    });
    await expect(canvas.getByRole("button", { name: "Show Tennis Court Booking, 21 Oct 2026" })).toHaveAttribute("aria-expanded", "false");
    await expectTimelineHierarchy(canvasElement, 1);
    await expectNoHorizontalOverflow();
  },
};

export const ScrollReturnsToEarlierSessions: Story = {
  play: async ({ canvas, canvasElement }) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    for (const index of [1, 2]) {
      const next = canvasElement.querySelector(`[data-session-id="${joinedSessions[index]!.sessionId}"]`);
      if (!next) throw new globalThis.Error("The next timeline row was not rendered.");
      window.scrollTo({ top: window.scrollY + next.getBoundingClientRect().top - Math.min(window.innerHeight * 0.45, 650) + 8, behavior: "instant" });
      await waitFor(() => expect(next).toHaveAttribute("data-current", "true"));
      await expectTimelineHierarchy(canvasElement, index);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
    for (const [index, date] of [[1, "23 Oct 2026"], [0, "21 Oct 2026"]] as const) {
      const previous = canvas.getByRole("button", { name: `Show Tennis Court Booking, ${date}` });
      window.scrollBy({ top: -window.innerHeight, behavior: "instant" });
      // A native wheel still reports upward intent when card folding has reached scrollY=0.
      await waitFor(() => {
        if (previous.getAttribute("aria-expanded") !== "true") window.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
        expect(previous).toHaveAttribute("aria-expanded", "true");
      });
      await expectTimelineHierarchy(canvasElement, index);
    }
    await expectNoHorizontalOverflow();
  },
};

export const InfiniteScrollRequestsNextPage: Story = {
  args: { hasMore: true },
  play: async ({ canvas, args }) => {
    const more = canvas.getByRole("button", { name: "Load more sessions" });
    await expect(args.onLoadMore).not.toHaveBeenCalled();
    // Keyboard focus pauses timeline folding, so this check measures the feed's
    // intersection trigger without moving the sentinel during the same scroll.
    canvas.getByRole("button", { name: "Show Tennis Court Booking, 21 Oct 2026" }).focus();
    more.scrollIntoView({ block: "center", behavior: "instant" });
    await waitFor(() => expect(args.onLoadMore).toHaveBeenCalled());
    await expectNoHorizontalOverflow();
  },
};

export const LoadingMore: Story = {
  args: { hasMore: true, loadingMore: true },
  play: async ({ canvas, args }) => {
    const loading = canvas.getByRole("button", { name: "Loading sessions…" });
    loading.scrollIntoView({ block: "center", behavior: "instant" });
    await expect(loading).toBeDisabled();
    await expect(args.onLoadMore).not.toHaveBeenCalled();
  },
};

export const NextPageError: Story = {
  args: { hasMore: true, error: "We couldn’t load more sessions. Please try again." },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("heading", { name: "This week" })).toBeVisible();
    await expect(canvas.getByRole("alert")).toHaveTextContent("We couldn’t load more sessions.");
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
    await expect(args.onLoadMore).not.toHaveBeenCalled();
  },
};
