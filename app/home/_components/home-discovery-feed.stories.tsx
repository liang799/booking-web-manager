import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { MobileHomeDiscovery } from "./home-discovery-feed";
import { HomeView } from "./home-view";
import { exampleBookings } from "./home-fixtures";
import { discoverySample, firstDiscoveryPage, readDiscoveryFixture, secondDiscoveryPage } from "./home-discovery-fixtures";
import type { HomeDiscoveryPage, ReadHomeDiscoveryPage } from "../discovery-feed";
import type { JoinSession } from "@/app/commit/join-session-transport";
import type { subscribeToDiscoveryChanges } from "@/app/discover/client-updates";

const sentinels = new Map<Element, () => void>();
let nativeObserver: typeof IntersectionObserver | undefined;
function controlIntersections() {
  const original = window.IntersectionObserver;
  nativeObserver ??= original;
  sentinels.clear();
  window.IntersectionObserver = class implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "200px 0px";
    readonly thresholds = [0];
    readonly targets = new Set<Element>();
    constructor(readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.targets.add(target);
      sentinels.set(target, () => {
        const rect = target.getBoundingClientRect();
        this.callback([{ target, isIntersecting: true, intersectionRatio: 1, boundingClientRect: rect, intersectionRect: rect, rootBounds: null, time: performance.now() }], this);
      });
    }
    unobserve(target: Element) { this.targets.delete(target); sentinels.delete(target); }
    disconnect() { for (const target of this.targets) sentinels.delete(target); this.targets.clear(); }
    takeRecords() { return []; }
  };
  return () => { window.IntersectionObserver = original; sentinels.clear(); };
}
function revealSentinel() {
  for (const [target, notify] of [...sentinels]) if (target.hasAttribute("data-discovery-sentinel")) notify();
}
const noSubscription: typeof subscribeToDiscoveryChanges = () => () => {};
const meta = {
  title: "Home/Mobile discovery", component: MobileHomeDiscovery,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/" } } },
  globals: { viewport: { value: "phone", isRotated: false } },
  beforeEach: controlIntersections,
  decorators: [(Story) => <AppShell user={{ name: "Marcus Lim", reliabilityScore: 96 }}><HomeView state={{ status: "ready", bookings: exampleBookings }} onRetry={fn()} discovery={<Story />} /></AppShell>],
  args: {
    readPage: fn<ReadHomeDiscoveryPage>(readDiscoveryFixture), subscribe: fn(noSubscription),
    joinSession: fn<JoinSession>(async () => ({ status: "committed", heldCents: 1000 })), onJoined: fn(),
  },
} satisfies Meta<typeof MobileHomeDiscovery>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvas, canvasElement }) => {
    const list = await canvas.findByRole("list", { name: "Discover bookings" });
    await expect(within(list).getAllByRole("article")).toHaveLength(2);
    await expect(canvas.getByRole("heading", { name: "Upcoming Bookings" })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Discover Bookings" })).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Search sessions" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /^Notifications/ })).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth);
  },
};
export const Dark: Story = { ...Ready, globals: { theme: "dark", viewport: { value: "phone", isRotated: false } } };

export const ScrollsWithoutClicking: Story = {
  beforeEach: () => { window.IntersectionObserver = nativeObserver!; },
  play: async ({ args, canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Discover bookings" });
    const location = window.location.href;
    canvasElement.querySelector<HTMLElement>("[data-discovery-sentinel]")!.scrollIntoView({ block: "end" });
    await waitFor(() => expect(within(canvas.getByRole("list", { name: "Discover bookings" })).getAllByRole("article")).toHaveLength(3));
    await expect(args.readPage).toHaveBeenCalledTimes(2);
    await expect(canvas.queryByRole("button", { name: "Load more sessions" })).not.toBeInTheDocument();
    await expect(window.location.href).toBe(location);
  },
};

let resolveNext: ((page: HomeDiscoveryPage) => void) | undefined;
export const InfiniteScroll: Story = {
  beforeEach: () => { resolveNext = undefined; },
  args: { readPage: fn<ReadHomeDiscoveryPage>((cursor) => cursor ? new Promise((resolve) => { resolveNext = resolve; }) : Promise.resolve(discoverySample(firstDiscoveryPage))) },
  play: async ({ args, canvas }) => {
    await canvas.findByRole("list", { name: "Discover bookings" });
    await waitFor(() => expect(sentinels.size).toBeGreaterThan(0));
    revealSentinel(); revealSentinel();
    await waitFor(() => expect(args.readPage).toHaveBeenCalledTimes(2));
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading more sessions");
    resolveNext!(discoverySample(secondDiscoveryPage));
    await waitFor(() => expect(within(canvas.getByRole("list", { name: "Discover bookings" })).getAllByRole("article")).toHaveLength(3));
    await expect(args.readPage).toHaveBeenLastCalledWith("next-page", expect.any(AbortSignal));
    await expect(canvas.queryByRole("button", { name: "Load more sessions" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Upcoming Bookings" })).toBeInTheDocument();
  },
};

let failedNext = false;
export const RetryNextPage: Story = {
  beforeEach: () => { failedNext = false; },
  args: { readPage: fn<ReadHomeDiscoveryPage>(async (cursor) => {
    if (cursor && !failedNext) { failedNext = true; throw new Error("Could not load more sessions."); }
    return discoverySample(cursor ? secondDiscoveryPage : firstDiscoveryPage);
  }) },
  play: async ({ args, canvas }) => {
    await canvas.findByRole("list", { name: "Discover bookings" });
    await waitFor(() => expect(sentinels.size).toBeGreaterThan(0));
    revealSentinel();
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Could not load more");
    await expect(within(canvas.getByRole("list", { name: "Discover bookings" })).getAllByRole("article")).toHaveLength(2);
    revealSentinel();
    await expect(args.readPage).toHaveBeenCalledTimes(2);
    const retry = canvas.getByRole("button", { name: "Retry discovery" });
    retry.focus(); await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(within(canvas.getByRole("list", { name: "Discover bookings" })).getAllByRole("article")).toHaveLength(3));
    await expect(args.readPage).toHaveBeenCalledTimes(3);
  },
};

export const Empty: Story = { args: { readPage: fn<ReadHomeDiscoveryPage>(async () => discoverySample({ items: [], nextCursor: null })) }, play: async ({ canvas }) => { await expect(await canvas.findByText(/No upcoming public sessions yet/)).toBeVisible(); } };
export const Unavailable: Story = { args: { readPage: fn<ReadHomeDiscoveryPage>(async () => { throw new Error("Session discovery is temporarily unavailable."); }) }, play: async ({ canvas }) => { await expect(await canvas.findByRole("alert")).toHaveTextContent("unavailable"); await expect(canvas.getByRole("heading", { name: "Upcoming Bookings" })).toBeVisible(); } };
export const DetailsAndJoin: Story = {
  play: async ({ args, canvas, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("list", { name: "Discover bookings" });
    await userEvent.click(canvas.getAllByRole("button", { name: /View booking/ })[0]!);
    const details = await page.findByRole("dialog", { name: "Tennis booking" });
    await waitFor(() => expect(within(details).getByText("Total capacity")).toBeVisible());
    await userEvent.click(within(details).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Tennis booking" })).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole("button", { name: "Join Tennis session at Bukit Timah CC" }));
    const join = await page.findByRole("dialog", { name: "Join this session?" });
    await userEvent.click(within(join).getByRole("button", { name: /Confirm and hold/ }));
    await expect(await page.findByRole("dialog", { name: "You're in" })).toBeVisible();
    await expect(args.joinSession).toHaveBeenCalledOnce();
    await expect(args.onJoined).toHaveBeenCalledOnce();
    await userEvent.click(page.getByRole("button", { name: "Done" }));
  },
};
export const DesktopDoesNotFetch: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ args, canvas }) => {
    await expect(canvas.queryByRole("heading", { name: "Discover Bookings" })).not.toBeInTheDocument();
    await expect(args.readPage).not.toHaveBeenCalled();
    await expect(args.subscribe).not.toHaveBeenCalled();
  },
};
export const RepeatedCursorStops: Story = {
  args: { readPage: fn<ReadHomeDiscoveryPage>(async (cursor) => discoverySample(cursor ? { ...secondDiscoveryPage, nextCursor: "next-page" } : firstDiscoveryPage)) },
  play: async ({ args, canvas }) => {
    await canvas.findByRole("list", { name: "Discover bookings" });
    await userEvent.click(canvas.getByRole("button", { name: "Load more sessions" }));
    await waitFor(() => expect(within(canvas.getByRole("list", { name: "Discover bookings" })).getAllByRole("article")).toHaveLength(3));
    await expect(canvas.queryByRole("button", { name: "Load more sessions" })).not.toBeInTheDocument();
    revealSentinel();
    await expect(args.readPage).toHaveBeenCalledTimes(2);
  },
};

let invalidate: (() => void) | undefined;
let invalidated = false;
export const LiveInvalidation: Story = {
  beforeEach: () => { invalidate = undefined; invalidated = false; },
  args: {
    readPage: fn<ReadHomeDiscoveryPage>(async () => discoverySample(invalidated ? { items: [], nextCursor: null } : firstDiscoveryPage)),
    subscribe: fn((notify: () => void) => { invalidate = () => { invalidated = true; notify(); }; return () => {}; }),
  },
  play: async ({ args, canvas }) => {
    await canvas.findByRole("list", { name: "Discover bookings" });
    await waitFor(() => expect(invalidate).toBeDefined());
    invalidate!(); invalidate!();
    await expect(await canvas.findByText(/No upcoming public sessions yet/)).toBeVisible();
    await expect(args.readPage).toHaveBeenCalledTimes(2);
  },
};

let pendingSignal: AbortSignal | undefined;
function UnmountHarness(props: React.ComponentProps<typeof MobileHomeDiscovery>) {
  const [shown, setShown] = useState(true);
  return <><Button onClick={() => setShown(false)}>Hide discovery</Button>{shown && <MobileHomeDiscovery {...props} />}</>;
}
export const CancelsOnUnmount: Story = {
  beforeEach: () => { pendingSignal = undefined; },
  args: { readPage: fn<ReadHomeDiscoveryPage>((_cursor, signal) => { pendingSignal = signal; return new Promise(() => {}); }) },
  render: (args) => <UnmountHarness {...args} />,
  play: async ({ canvas }) => {
    await waitFor(() => expect(pendingSignal).toBeDefined());
    await userEvent.click(canvas.getByRole("button", { name: "Hide discovery" }));
    await waitFor(() => expect(pendingSignal?.aborted).toBe(true));
  },
};
