import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { WalletLoad, WalletTransactionsPage, WalletTransport } from "../wallet-transport";
import { useWalletScreen } from "../wallet-queries";
import { WalletView } from "./wallet-view";
import { firstTransactionsPage, secondTransactionsPage, walletSummary } from "./wallet-fixtures";

/** Renders exactly what app/wallet/page.tsx renders, with a fake wallet API. */
function WalletPageHarness({ transport }: { readonly transport: WalletTransport }) {
  return <WalletView {...useWalletScreen(transport)} />;
}

function transport(overrides: Partial<WalletTransport> = {}): WalletTransport {
  return {
    loadSummary: fn<WalletTransport["loadSummary"]>(async () => ({ status: "ready", data: walletSummary })),
    loadTransactions: fn<WalletTransport["loadTransactions"]>(async (before) => ({ status: "ready", data: before ? secondTransactionsPage : firstTransactionsPage })),
    ...overrides,
  };
}

const scrollSentinels = new Map<Element, () => void>();

function controlScrollIntersections() {
  const original = window.IntersectionObserver;
  scrollSentinels.clear();
  window.IntersectionObserver = class implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [0];
    readonly targets = new Set<Element>();
    constructor(readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.targets.add(target);
      scrollSentinels.set(target, () => {
        const rectangle = target.getBoundingClientRect();
        this.callback([{
          target, isIntersecting: true, intersectionRatio: 1,
          boundingClientRect: rectangle, intersectionRect: rectangle,
          rootBounds: null, time: performance.now(),
        }], this);
      });
    }
    unobserve(target: Element) { this.targets.delete(target); scrollSentinels.delete(target); }
    disconnect() { for (const target of this.targets) scrollSentinels.delete(target); this.targets.clear(); }
    takeRecords() { return []; }
  };
  return () => { window.IntersectionObserver = original; scrollSentinels.clear(); };
}

function revealScrollSentinel() {
  for (const [target, notify] of [...scrollSentinels]) {
    if (target.closest("#wallet-transactions")) notify();
  }
}

async function activateLoadMore(canvas: ReturnType<typeof within>) {
  (await canvas.findByRole("button", { name: "Load more" })).focus();
  await userEvent.keyboard("{Enter}");
}

const meta = {
  title: "Wallet/Page",
  component: WalletPageHarness,
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "phone", isRotated: false } },
  beforeEach: controlScrollIntersections,
  // A fresh cache per story, as each browser tab gets in the app.
  decorators: [(Story) => {
    const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    return <QueryClientProvider client={client}><Story /></QueryClientProvider>;
  }],
  args: { transport: transport() },
} satisfies Meta<typeof WalletPageHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Scrolling appends one page even when the sentinel repeats, without duplicating boundary rows. */
let resolveNextPage: ((page: WalletLoad<WalletTransactionsPage>) => void) | undefined;
export const LoadMore: Story = {
  beforeEach: () => { resolveNextPage = undefined; },
  args: { transport: transport({
    loadTransactions: fn<WalletTransport["loadTransactions"]>((before) => before
      ? new Promise((resolve) => { resolveNextPage = resolve; })
      : Promise.resolve({ status: "ready", data: firstTransactionsPage })),
  }) },
  play: async ({ args, canvas }) => {
    await canvas.findByRole("list", { name: "Transactions" });
    await waitFor(() => expect(scrollSentinels.size).toBeGreaterThan(0));
    revealScrollSentinel();
    revealScrollSentinel();
    await waitFor(() => expect(args.transport.loadTransactions).toHaveBeenCalledTimes(2));
    resolveNextPage!({ status: "ready", data: secondTransactionsPage });
    await waitFor(() => expect(within(canvas.getByRole("list", { name: "Transactions" })).getByText("Top up")).toBeVisible());
    await expect(within(canvas.getByRole("list", { name: "Transactions" })).getAllByRole("listitem")).toHaveLength(3);
    await expect(args.transport.loadTransactions).toHaveBeenLastCalledWith("2045-03-30T08:00:00Z", expect.any(AbortSignal));
    await expect(canvas.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  },
};

const desktopFirstPage: WalletTransactionsPage = {
  items: Array.from({ length: 8 }, (_, index) => ({
    ...firstTransactionsPage.items[index % 2]!, transactionId: `desktop-first-${index}`,
  })),
  nextCursor: "2045-03-30T08:00:00Z",
};
const desktopSecondPage: WalletTransactionsPage = {
  items: Array.from({ length: 8 }, (_, index) => ({
    ...secondTransactionsPage.items[1]!, transactionId: `desktop-second-${index}`,
  })),
  nextCursor: null,
};
let resolveDesktopPage: ((page: WalletLoad<WalletTransactionsPage>) => void) | undefined;

export const DesktopFetchNextPage: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  beforeEach: () => { resolveDesktopPage = undefined; },
  args: { transport: transport({
    loadTransactions: fn<WalletTransport["loadTransactions"]>((before) => before
      ? new Promise((resolve) => { resolveDesktopPage = resolve; })
      : Promise.resolve({ status: "ready", data: desktopFirstPage })),
  }) },
  play: async ({ args, canvas }) => {
    const table = within(await canvas.findByRole("table", { name: "Transactions" }));
    const firstRow = table.getAllByRole("row")[1]!.textContent;
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(args.transport.loadTransactions).toHaveBeenCalledTimes(2));
    await expect(table.getAllByRole("row")).toHaveLength(9);
    await expect(table.getAllByRole("row")[1]!.textContent).toBe(firstRow);
    await expect(canvas.getByRole("button", { name: "Next page" })).toBeDisabled();
    resolveDesktopPage!({ status: "ready", data: desktopSecondPage });
    await waitFor(() => expect(canvas.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page"));
    await expect(table.getAllByRole("row")).toHaveLength(9);
    await expect(table.getAllByRole("row")[1]!.textContent).not.toBe(firstRow);
    await expect(canvas.getByRole("button", { name: "Next page" })).toBeDisabled();
    await expect(args.transport.loadTransactions).toHaveBeenLastCalledWith("2045-03-30T08:00:00Z", expect.any(AbortSignal));
  },
};

let desktopContinuationAttempts = 0;
export const DesktopContinuationRetry: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  beforeEach: () => { desktopContinuationAttempts = 0; },
  args: { transport: transport({
    loadTransactions: fn<WalletTransport["loadTransactions"]>(async (before) => {
      if (!before) return { status: "ready", data: desktopFirstPage };
      desktopContinuationAttempts += 1;
      return desktopContinuationAttempts === 1
        ? { status: "error", code: "NETWORK_ERROR", message: "We couldn't load your wallet. Check your connection and try again." }
        : { status: "ready", data: desktopSecondPage };
    }),
  }) },
  play: async ({ args, canvas }) => {
    const table = within(await canvas.findByRole("table", { name: "Transactions" }));
    const firstRow = table.getAllByRole("row")[1]!.textContent;
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
    const retry = await canvas.findByRole("button", { name: "Retry loading transactions" });
    await expect(retry).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Next page" })).toBeDisabled();
    await expect(table.getAllByRole("row")[1]!.textContent).toBe(firstRow);
    await expect(args.transport.loadTransactions).toHaveBeenCalledTimes(2);
    await userEvent.click(retry);
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Retry loading transactions" })).not.toBeInTheDocument());
    await expect(args.transport.loadTransactions).toHaveBeenCalledTimes(3);
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
    await expect(canvas.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    await expect(table.getAllByRole("row")).toHaveLength(9);
    await expect(table.getAllByRole("row")[1]!.textContent).not.toBe(firstRow);
  },
};

const partialFilteredPage: WalletTransactionsPage = {
  items: Array.from({ length: 8 }, (_, index) => ({
    ...firstTransactionsPage.items[index < 3 ? 1 : 0]!,
    transactionId: `filtered-first-${index}`,
  })),
  nextCursor: "2045-03-20T08:00:00Z",
};
const moreFilteredPage: WalletTransactionsPage = {
  items: Array.from({ length: 8 }, (_, index) => ({
    ...firstTransactionsPage.items[index < 6 ? 1 : 0]!,
    transactionId: `filtered-second-${index}`,
    amountCents: 9000 + index * 100,
  })),
  nextCursor: "2045-03-10T08:00:00Z",
};
const finalFilteredPage: WalletTransactionsPage = {
  items: Array.from({ length: 9 }, (_, index) => ({
    ...secondTransactionsPage.items[1]!,
    transactionId: `filtered-final-${index}`,
    amountCents: 11000 + index * 100,
  })),
  nextCursor: null,
};

export const DesktopFilterFillsCurrentPage: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  args: { transport: transport({
    loadTransactions: fn<WalletTransport["loadTransactions"]>(async (before) => ({
      status: "ready",
      data: before === partialFilteredPage.nextCursor ? moreFilteredPage
        : before === moreFilteredPage.nextCursor ? finalFilteredPage
          : partialFilteredPage,
    })),
  }) },
  play: async ({ args, canvas }) => {
    const table = within(await canvas.findByRole("table", { name: "Transactions" }));
    const search = canvas.getByRole("textbox", { name: "Search transactions" });
    await userEvent.type(search, "refund");
    await expect(table.getAllByRole("row")).toHaveLength(4);
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(table.getAllByRole("row")).toHaveLength(9));
    await expect(canvas.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    await expect(table.getByText("S$90.00")).toBeVisible();
    await expect(table.getByText("S$94.00")).toBeVisible();
    await expect(table.queryByText("S$95.00")).not.toBeInTheDocument();
    await expect(args.transport.loadTransactions).toHaveBeenCalledTimes(2);

    await userEvent.clear(search);
    await userEvent.type(search, "top up");
    await expect(table.getAllByRole("row")).toHaveLength(1);
    await expect(canvas.getByText("No matching transactions")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(table.getAllByRole("row")).toHaveLength(9));
    await expect(canvas.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    await expect(table.getByText("S$110.00")).toBeVisible();
    await expect(table.getByText("S$117.00")).toBeVisible();
    await expect(table.queryByText("S$118.00")).not.toBeInTheDocument();
    await expect(args.transport.loadTransactions).toHaveBeenCalledTimes(3);
  },
};

let unavailableAttempts = 0;
export const UnavailableThenRetry: Story = {
  beforeEach: () => { unavailableAttempts = 0; },
  args: { transport: transport({
    loadSummary: fn<WalletTransport["loadSummary"]>(async () => {
      unavailableAttempts += 1;
      return unavailableAttempts === 1
        ? { status: "error", code: "WALLET_API_UNAVAILABLE", message: "The wallet is temporarily unavailable. Please try again later." }
        : { status: "ready", data: walletSummary };
    }),
  }) },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText(/temporarily unavailable/)).toBeVisible());
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(canvas.getByText("$25.00")).toBeVisible());
  },
};

/** An expired login during Load more shows the Log in action, like the first load does. */
export const LoadMoreAfterLoginExpired: Story = {
  args: { transport: transport({
    loadTransactions: fn<WalletTransport["loadTransactions"]>(async (before) => before
      ? { status: "error", code: "UNAUTHENTICATED", message: "Log in again to see your wallet." }
      : { status: "ready", data: firstTransactionsPage }),
  }) },
  play: async ({ canvas }) => {
    await activateLoadMore(canvas);
    const history = within(canvas.getByRole("region", { name: "Transactions" }));
    await waitFor(() => expect(history.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Fwallet"));
  },
};

/** A login that expires before a background refresh (returning to the tab) shows Log in, not the old list. */
let refreshAttempts = 0;
export const RefreshAfterLoginExpired: Story = {
  beforeEach: () => { refreshAttempts = 0; },
  args: { transport: transport({
    loadTransactions: fn<WalletTransport["loadTransactions"]>(async () => {
      refreshAttempts += 1;
      return refreshAttempts === 1
        ? { status: "ready", data: firstTransactionsPage }
        : { status: "error", code: "UNAUTHENTICATED", message: "Log in again to see your wallet." };
    }),
  }) },
  play: async ({ canvas }) => {
    await canvas.findByRole("button", { name: "Load more" });
    // Leaving and returning to the tab makes React Query refresh the wallet in the background.
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    focusManager.setFocused(undefined);
    const history = within(canvas.getByRole("region", { name: "Transactions" }));
    await waitFor(() => expect(history.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Fwallet"));
    await expect(history.queryByRole("list", { name: "Transactions" })).not.toBeInTheDocument();
  },
};

/** A Load more whose request throws shows an error and leaves Load more usable (no stuck button). */
let throwingAttempts = 0;
export const LoadMoreRequestThrows: Story = {
  beforeEach: () => { throwingAttempts = 0; },
  args: { transport: transport({
    loadTransactions: fn<WalletTransport["loadTransactions"]>(async (before) => {
      if (!before) return { status: "ready", data: firstTransactionsPage };
      throwingAttempts += 1;
      if (throwingAttempts === 1) throw new Error("offline");
      return { status: "ready", data: secondTransactionsPage };
    }),
  }) },
  play: async ({ canvas }) => {
    await activateLoadMore(canvas);
    await waitFor(() => expect(canvas.getByText(/check your connection/i)).toBeVisible());
    revealScrollSentinel();
    await expect(throwingAttempts).toBe(1);
    await userEvent.click(canvas.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(within(canvas.getByRole("list", { name: "Transactions" })).getByText("Top up")).toBeVisible());
  },
};

/** A Load more that finishes after a Retry belongs to the old list and is discarded. */
let resolveOldPage: ((page: WalletLoad<WalletTransactionsPage>) => void) | undefined;
let staleSummaryAttempts = 0;
export const LoadMoreAfterRetryIsDiscarded: Story = {
  beforeEach: () => { resolveOldPage = undefined; staleSummaryAttempts = 0; },
  args: { transport: transport({
    loadSummary: fn<WalletTransport["loadSummary"]>(async () => {
      staleSummaryAttempts += 1;
      return staleSummaryAttempts === 1
        ? { status: "error", code: "WALLET_API_UNAVAILABLE", message: "The wallet is temporarily unavailable. Please try again later." }
        : { status: "ready", data: walletSummary };
    }),
    loadTransactions: fn<WalletTransport["loadTransactions"]>((before) => before
      ? new Promise((resolve) => { resolveOldPage = resolve; })
      : Promise.resolve({ status: "ready", data: firstTransactionsPage })),
  }) },
  play: async ({ canvas }) => {
    await activateLoadMore(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(canvas.getByText("$25.00")).toBeVisible());
    resolveOldPage!({ status: "ready", data: secondTransactionsPage });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(within(canvas.getByRole("list", { name: "Transactions" })).getAllByRole("listitem")).toHaveLength(2);
    await expect(canvas.queryByText("Top up")).not.toBeInTheDocument();
  },
};
