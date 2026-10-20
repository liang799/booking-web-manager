import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import type { TopUpTransport } from "../top-up-transport";
import { TopUpPanel } from "./top-up-panel";
import { firstTransactionsPage, walletSummary } from "./wallet-fixtures";
import { WalletView } from "./wallet-view";

const meta = {
  title: "Wallet/Overview",
  component: WalletView,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/wallet" } } },
  globals: { viewport: { value: "phone", isRotated: false } },
  decorators: [(Story) => <AppShell user={{ name: "Joseph", reliabilityScore: 100 }} logoutAction={fn()}><Story /></AppShell>],
  // These view stories exercise controls explicitly; controller stories drive scroll events.
  beforeEach: () => {
    const original = window.IntersectionObserver;
    window.IntersectionObserver = class implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    };
    return () => { window.IntersectionObserver = original; };
  },
  args: {
    summary: { status: "ready", data: walletSummary },
    history: { status: "ready", data: firstTransactionsPage },
    loadingMore: false,
    moreError: null,
    onRetry: fn(),
    onLoadMore: fn(),
  },
} satisfies Meta<typeof WalletView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ args, canvas }) => {
    const balance = within(canvas.getByRole("region", { name: "Balance" }));
    await expect(balance.getByText("$25.00")).toBeVisible();
    await expect(balance.getByText("$18.75")).toBeVisible();
    await expect(balance.getByLabelText("Pending withdrawals unavailable")).toHaveTextContent("—");
    const holds = within(canvas.getByRole("region", { name: "Held for sessions" }));
    await expect(holds.getByText("Bishan Sports Hall")).toBeVisible();
    await expect(holds.getByText(/of/)).toHaveTextContent("of $12.50");
    await expect(within(canvas.getByRole("list", { name: "Transactions" })).getByText("Funds held")).toBeVisible();
    canvas.getByRole("button", { name: "Load more" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onLoadMore).toHaveBeenCalledOnce();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const Loading: Story = {
  args: { summary: { status: "loading" }, history: { status: "loading" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading your balance…")).toBeVisible();
    await expect(canvas.getByText("Loading transactions…")).toBeVisible();
  },
};

export const NewWallet: Story = {
  args: {
    summary: { status: "ready", data: { availableBalanceCents: 0, heldBalanceCents: 0, pendingPayoutCents: 0, activeHolds: [] } },
    history: { status: "ready", data: { items: [], nextCursor: null } },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Nothing held right now")).toBeVisible();
    await expect(canvas.getByText("No transactions yet")).toBeVisible();
    const balance = within(canvas.getByRole("region", { name: "Balance" }));
    await expect(balance.getAllByText("$0.00")).toHaveLength(3);
  },
};

export const LoadingMore: Story = {
  args: { loadingMore: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading more transactions…")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  },
};

export const LoadMoreFailed: Story = {
  args: { moreError: "We couldn't load your wallet. Check your connection and try again." },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/check your connection/i)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Load more" })).toBeEnabled();
  },
};

export const Unavailable: Story = {
  args: {
    summary: { status: "error", message: "The wallet is temporarily unavailable. Please try again later.", signIn: false },
    history: { status: "error", message: "The wallet is temporarily unavailable. Please try again later.", signIn: false },
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: "Retry" })[0]!);
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};

export const SignedOut: Story = {
  args: {
    summary: { status: "error", message: "Log in again to see your wallet.", signIn: true },
    history: { status: "error", message: "Log in again to see your wallet.", signIn: true },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("link", { name: "Log in" })[0]).toHaveAttribute("href", "/login?next=%2Fwallet");
    await expect(canvas.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  },
};

export const Desktop: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas }) => {
    const balance = within(canvas.getByRole("region", { name: "Balance" }));
    await expect(balance.getByLabelText("S$25.00")).toBeVisible();
  },
};

export const SearchTransactions: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "See all" }));
    const history = within(canvas.getByRole("region", { name: "Transactions" }));
    const search = history.getByRole("textbox", { name: "Search transactions" });
    await userEvent.type(search, "refund");
    await expect(within(await history.findByRole("list", { name: "Transactions" })).getByText("Refund", { exact: true })).toBeVisible();
    await expect(history.queryByText("Funds held")).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "no matching activity");
    await expect(history.queryByRole("list", { name: "Transactions" })).not.toBeInTheDocument();
    history.getByRole("button", { name: "Load more" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onLoadMore).toHaveBeenCalledOnce();

    await userEvent.clear(search);
    await expect(within(history.getByRole("list", { name: "Transactions" })).getAllByRole("listitem")).toHaveLength(2);
  },
};

export const FilterTransactions: Story = {
  args: {
    history: {
      status: "ready",
      data: {
        items: [
          { ...firstTransactionsPage.items[0]!, occurredAt: new Date(Date.now() - 60 * 86_400_000).toISOString() },
          { ...firstTransactionsPage.items[1]!, occurredAt: new Date(Date.now() - 5 * 86_400_000).toISOString() },
        ],
        nextCursor: null,
      },
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "See all" }));
    const history = within(canvas.getByRole("region", { name: "Transactions" }));
    await userEvent.click(history.getByRole("combobox", { name: "Date range" }));
    await userEvent.click(within(document.body).getByRole("option", { name: "Last 30 days" }));
    await expect(within(await history.findByRole("list", { name: "Transactions" })).getByText("Refund", { exact: true })).toBeVisible();
    await expect(history.queryByText("Funds held")).not.toBeInTheDocument();

    await userEvent.click(await history.findByRole("combobox", { name: "Date range" }));
    await userEvent.click(within(document.body).getByRole("option", { name: "Last 90 days" }));
    await expect(within(await history.findByRole("list", { name: "Transactions" })).getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(await history.findByRole("combobox", { name: "Date range" }));
    await userEvent.click(within(document.body).getByRole("option", { name: "All time" }));
    await expect(within(await history.findByRole("list", { name: "Transactions" })).getAllByRole("listitem")).toHaveLength(2);
  },
};

export const FundsActions: Story = {
  play: async ({ canvas }) => {
    const balance = within(canvas.getByRole("region", { name: "Balance" }));
    await expect(balance.getByRole("link", { name: "Withdraw" })).toHaveAttribute("href", "/payouts");
    await expect(canvas.getByText("Topping up with PayNow is coming soon.")).not.toBeVisible();
    await userEvent.click(balance.getByRole("button", { name: "Add funds" }));
    await expect(canvas.getByText("Topping up with PayNow is coming soon.")).toBeVisible();
    const holds = within(canvas.getByRole("region", { name: "Held for sessions" }));
    await expect(holds.getByRole("link", { name: /Bishan Sports Hall/ })).toHaveAttribute("href", "/sessions/s1");
    await expect(holds.getByRole("link", { name: /Jurong East Sports Hall/ })).toHaveAttribute("href", "/sessions/s2");
  },
};

const previewTopUp = {
  payWithPayNow: fn<TopUpTransport["payWithPayNow"]>(async () => ({ status: "paid" })),
};
const previewPaid = fn();

export const AvailableTopUp: Story = {
  args: { topUp: <TopUpPanel transport={previewTopUp} onPaid={previewPaid} /> },
  beforeEach: () => {
    previewTopUp.payWithPayNow.mockClear();
    previewPaid.mockClear();
  },
  play: async ({ canvas }) => {
    const balance = within(canvas.getByRole("region", { name: "Balance" }));
    const disclosure = balance.getByRole("button", { name: "Add funds" });
    await userEvent.click(disclosure);
    const topUp = within(canvas.getByRole("region", { name: "Top up with PayNow" }));
    const amount = topUp.getByRole("textbox", { name: "Amount (S$)" });
    await userEvent.click(topUp.getByRole("button", { name: "S$20" }));
    await expect(amount).toHaveValue("20");
    await userEvent.clear(amount);
    await userEvent.type(amount, "12.34");
    await userEvent.click(disclosure);
    await expect(amount).not.toBeVisible();
    await expect(previewTopUp.payWithPayNow).not.toHaveBeenCalled();
    await userEvent.click(disclosure);
    await expect(amount).toBeVisible();
    await expect(amount).toHaveValue("12.34");
    await userEvent.click(topUp.getByRole("button", { name: "Pay with PayNow" }));
    await expect(previewTopUp.payWithPayNow).toHaveBeenCalledOnce();
    await expect(previewTopUp.payWithPayNow).toHaveBeenCalledWith(1234, expect.any(String));
    await expect(previewPaid).toHaveBeenCalledOnce();
    await expect(topUp.getByText("Payment received. Your balance updates in a few seconds.")).toBeVisible();
    await expect(balance.getByText("$25.00")).toBeVisible();
  },
};

export const DesignPreview: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  args: {
    summary: {
      status: "ready",
      data: {
        availableBalanceCents: 12850,
        heldBalanceCents: 2400,
        pendingPayoutCents: 0,
        activeHolds: [
          { holdId: "preview-hold-1", sessionId: "preview-session-1", heldCents: 1200, originalCents: 1200, venueName: "Court 1", sport: "Badminton", startAt: "2026-10-20T11:00:00Z" },
          { holdId: "preview-hold-2", sessionId: "preview-session-2", heldCents: 1200, originalCents: 1200, venueName: "Tennis Court A", sport: "Tennis", startAt: "2026-10-21T10:00:00Z" },
        ],
      },
    },
    history: {
      status: "ready",
      data: {
        items: [
          { transactionId: "preview-t8", kind: "TOP_UP", amountCents: 5000, occurredAt: "2026-10-20T06:32:00Z" },
          { transactionId: "preview-t7", kind: "LOCK", amountCents: 2400, occurredAt: "2026-10-19T10:11:00Z" },
          { transactionId: "preview-t6", kind: "RELEASE", amountCents: 3200, occurredAt: "2026-10-18T13:04:00Z" },
          { transactionId: "preview-t5", kind: "REFUND", amountCents: 1600, occurredAt: "2026-10-16T01:15:00Z" },
          { transactionId: "preview-t4", kind: "PAYOUT", amountCents: 4500, occurredAt: "2026-10-12T08:27:00Z" },
          { transactionId: "preview-t3", kind: "FORFEIT", amountCents: 2800, occurredAt: "2026-10-10T04:03:00Z" },
          { transactionId: "preview-t2", kind: "REFUND", amountCents: 2000, occurredAt: "2026-10-08T11:44:00Z" },
          { transactionId: "preview-t1", kind: "TOP_UP", amountCents: 10000, occurredAt: "2026-10-05T03:10:00Z" },
          ...Array.from({ length: 16 }, (_, index) => ({
            transactionId: `preview-older-${index}`,
            kind: (["LOCK", "REFUND", "RELEASE", "PAYOUT"] as const)[index % 4]!,
            amountCents: 900 + index * 125,
            occurredAt: new Date(Date.UTC(2026, 9, 4 - index, 8, 30)).toISOString(),
          })),
        ],
        nextCursor: null,
      },
    },
  },
};

const tomorrowEvening = new Date();
tomorrowEvening.setUTCDate(tomorrowEvening.getUTCDate() + 1);
tomorrowEvening.setUTCHours(11, 0, 0, 0);

/** The mobile reference has its own balances and short activity list. */
export const MobileDesignPreview: Story = {
  parameters: {
    viewport: {
      options: {
        referenceMobile: { name: "Reference mobile (350px)", styles: { width: "350px", height: "760px" }, type: "mobile" },
      },
    },
  },
  globals: { viewport: { value: "referenceMobile", isRotated: false } },
  args: {
    summary: {
      status: "ready",
      data: {
        availableBalanceCents: 12850,
        heldBalanceCents: 4200,
        pendingPayoutCents: 1850,
        activeHolds: [
          { holdId: "mobile-hold", sessionId: "mobile-session", heldCents: 1250, originalCents: 1250, venueName: "Jurong East", sport: "Badminton", startAt: tomorrowEvening.toISOString() },
        ],
      },
    },
    history: {
      status: "ready",
      data: {
        items: [
          { transactionId: "mobile-release", kind: "RELEASE", amountCents: 850, occurredAt: new Date(Date.now() - 86_400_000).toISOString(), sport: "Badminton" },
          { transactionId: "mobile-hold", kind: "LOCK", amountCents: 1200, occurredAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), sport: "Tennis" },
          { transactionId: "mobile-top-up", kind: "TOP_UP", amountCents: 5000, occurredAt: "2026-08-22T08:00:00Z" },
        ],
        nextCursor: null,
      },
    },
  },
  play: async ({ canvas }) => {
    const balanceElement = canvas.getByRole("region", { name: "Balance" });
    const balance = within(balanceElement);
    await expect(balance.getByText("$128.50")).toBeVisible();
    await expect(balance.getByText("$42.00")).toBeVisible();
    await expect(balance.getByText("$18.50")).toBeVisible();
    await expect(balance.getByRole("link", { name: "Withdraw" })).toHaveAttribute("href", "/payouts");
    await expect(balanceElement.getAnimations({ subtree: true })).toHaveLength(0);
    const transactions = within(canvas.getByRole("list", { name: "Transactions" }));
    await expect(transactions.getAllByRole("listitem")).toHaveLength(3);
    await expect(transactions.getByText("Payment released")).toBeVisible();
    await expect(transactions.getByText("Badminton · Yesterday")).toBeVisible();
    await expect(transactions.getByText(/Tennis/)).toBeVisible();
    // Release settles a held share to the booker; it does not credit this wallet.
    await expect(transactions.getByText("$8.50")).toBeVisible();
    await expect(transactions.queryByText("+$8.50")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("table", { name: "Transactions" })).not.toBeInTheDocument();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const DesktopPagination: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  args: DesignPreview.args,
  play: async ({ canvas }) => {
    const table = within(await canvas.findByRole("table", { name: "Transactions" }));
    await expect(table.getAllByRole("row")).toHaveLength(9);
    const firstPage = table.getAllByRole("row")[1]!.textContent;
    await expect(canvas.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
    await expect(table.getAllByRole("row")).toHaveLength(9);
    await expect(table.getAllByRole("row")[1]!.textContent).not.toBe(firstPage);
    await expect(canvas.getByRole("button", { name: "Previous page" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Page 3" }));
    await expect(table.getAllByRole("row")).toHaveLength(9);
    await expect(canvas.getByRole("button", { name: "Next page" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Page 1" }));
    await expect(table.getAllByRole("row")[1]!.textContent).toBe(firstPage);
  },
};
