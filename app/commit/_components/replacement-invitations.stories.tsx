import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import type { AcceptReplacement, LoadReplacementInvitations } from "../replacement-ports";
import { useAcceptReplacementFlow } from "../use-accept-replacement-flow";
import { replacementInvitationsQueryKey } from "../withdrawal-query-keys";
import { memoryUnresolvedStore, type UnresolvedStore } from "../withdrawal-recovery";
import { AcceptReplacementDialog } from "./accept-replacement-dialog";
import { fakeAcceptReplacement, fakeLoadReplacementInvitations, futsalInvitation } from "./replacement-fakes";
import { ReplacementInvitationsView, type ReplacementInvitationsState } from "./replacement-invitations-view";

const userId = "99999999-9999-4999-8999-999999999999";

/**
 * What the page will render, as its composition root: React Query loads the invitations (and
 * refreshes them after an acceptance), the flow hook holds the interaction state, and the
 * presentational list and dialog display it. Here the transport is fake and unresolved requests
 * are kept in memory; an invitation the fake accepts drops out of the next list load.
 */
function ReplacementInvitationsPageHarness({ loadInvitations, acceptReplacement, store }: {
  readonly loadInvitations: LoadReplacementInvitations;
  readonly acceptReplacement: AcceptReplacement;
  readonly store?: UnresolvedStore<string>;
}) {
  const taken = useRef(new Set<string>());
  const list = useQuery({
    queryKey: replacementInvitationsQueryKey(userId),
    queryFn: async () => (await loadInvitations()).filter((invitation) => !taken.current.has(invitation.sessionId)),
    retry: false,
  });
  const [unresolved] = useState(() => store ?? memoryUnresolvedStore<string>());
  const [accept] = useState(() => (async (request) => {
    const result = await acceptReplacement(request);
    if (result.status === "accepted") taken.current.add(request.sessionId);
    return result;
  }) satisfies AcceptReplacement);
  const flow = useAcceptReplacementFlow({ userId, invitations: list.data, store: unresolved, acceptReplacement: accept });
  const state: ReplacementInvitationsState = list.isPending ? { status: "loading" }
    : list.isError ? { status: "error", message: "We couldn't load your invitations. Check your connection and try again." }
    : { status: "ready", invitations: list.data };
  return (
    <>
      <ReplacementInvitationsView state={state} onRetry={() => { void list.refetch(); }} onAccept={flow.start} />
      <AcceptReplacementDialog state={flow.state} onConfirm={flow.confirm} onClose={flow.close} />
    </>
  );
}

const meta = {
  title: "Commitments/Replacement invitations",
  component: ReplacementInvitationsPageHarness,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/sessions/joined" } } },
  globals: { viewport: { value: "phone", isRotated: false } },
  decorators: [(Story) => {
    // A fresh cache per story, as each browser tab gets in the app.
    const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    return (
      <QueryClientProvider client={client}>
        <AppShell user={{ name: "Joseph", reliabilityScore: 100 }} logoutAction={fn()}><Story /></AppShell>
      </QueryClientProvider>
    );
  }],
  args: {
    loadInvitations: fn(fakeLoadReplacementInvitations),
    acceptReplacement: fn(fakeAcceptReplacement),
  },
} satisfies Meta<typeof ReplacementInvitationsPageHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

const dialog = () => within(document.body).getByRole("dialog");
const dialogClosed = () => waitFor(() => expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument());
const openAccept = async (canvas: { findByRole: (role: "button", options: { name: RegExp }) => Promise<HTMLElement> }, venue: string) => {
  await userEvent.click(await canvas.findByRole("button", { name: new RegExp(`accept the place in .* at ${venue}`, "i") }));
};
const calls = <T extends (...args: never[]) => unknown>(mock: T) => (mock as unknown as ReturnType<typeof fn<T>>).mock.calls;

/** Each invitation shows the share that accepting would hold; fits a 390px phone. */
export const Invitations: Story = {
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getAllByRole("listitem")).toHaveLength(2));
    await expect(canvas.getByText("S$9.00")).toBeVisible();
    await expect(canvas.getByText("S$15.75")).toBeVisible();
    await expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const Loading: Story = {
  args: { loadInvitations: fn<LoadReplacementInvitations>(() => new Promise(() => undefined)) },
  play: async ({ canvas }) => { await expect(canvas.getByText("Loading your invitations…")).toBeVisible(); },
};

export const NoInvitations: Story = {
  args: { loadInvitations: fn<LoadReplacementInvitations>(async () => []) },
  play: async ({ canvas }) => { await expect(await canvas.findByText("No places reserved for you")).toBeVisible(); },
};

let listAttempts = 0;
export const LoadFailedThenRetried: Story = {
  beforeEach: () => { listAttempts = 0; },
  args: {
    loadInvitations: fn<LoadReplacementInvitations>(async () => {
      listAttempts += 1;
      if (listAttempts === 1) throw new Error("offline");
      return fakeLoadReplacementInvitations();
    }),
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(canvas.getAllByRole("listitem")).toHaveLength(2));
  },
};

/** The amount held is shown before accepting; the request carries no amount, only the session and its key. */
export const AcceptAPlace: Story = {
  play: async ({ args, canvas }) => {
    await openAccept(canvas, "Our Tampines Hub");
    await waitFor(() => expect(within(dialog()).getByText("S$9.00")).toBeVisible());
    await expect(args.acceptReplacement).not.toHaveBeenCalled();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Accept and hold" }));
    await waitFor(() => expect(within(dialog()).getByRole("status")).toHaveTextContent("S$9.00 is now held from your wallet."));
    const request = calls(args.acceptReplacement)[0]![0];
    await expect(Object.keys(request).sort()).toEqual(["idempotencyKey", "sessionId"]);
    await expect(request.sessionId).toBe(futsalInvitation.sessionId);
    await userEvent.click(within(dialog()).getByRole("button", { name: "Done" }));
    await dialogClosed();
    await waitFor(() => expect(canvas.queryByText("Our Tampines Hub")).not.toBeInTheDocument());
    await expect(args.loadInvitations).toHaveBeenCalledTimes(2);
  },
};

/** Not enough available balance: nothing is held, the player is pointed to a top-up, and the next attempt is a new request. */
let fundedAttempts = 0;
export const NotEnoughFunds: Story = {
  beforeEach: () => { fundedAttempts = 0; },
  args: {
    acceptReplacement: fn<AcceptReplacement>(async (request) => {
      fundedAttempts += 1;
      return fundedAttempts === 1
        ? { status: "error", code: "INSUFFICIENT_FUNDS", message: "Your wallet doesn't have enough available balance for this share. Top up your wallet, then try again.", unconfirmed: false }
        : fakeAcceptReplacement(request);
    }),
  },
  play: async ({ args, canvas }) => {
    await openAccept(canvas, "Our Tampines Hub");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Accept and hold" }));
    await waitFor(() => expect(within(dialog()).getByRole("link", { name: "Top up your wallet" })).toHaveAttribute("href", "/wallet"));
    // A definite rejection: nothing happened, so declining is still offered.
    await expect(within(dialog()).getByRole("button", { name: "Not now" })).toBeEnabled();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Accept and hold" }));
    await waitFor(() => expect(within(dialog()).getByRole("status")).toHaveTextContent("is now held"));
    const [first, second] = calls(args.acceptReplacement).map(([request]) => request.idempotencyKey);
    await expect(second).not.toBe(first);
  },
};

/**
 * An unconfirmed acceptance keeps its idempotency key, even when the dialog is closed and a
 * retry fails (here, an expired login), so the share is never held twice.
 */
let unconfirmedAttempts = 0;
export const UnconfirmedAcceptRetried: Story = {
  beforeEach: () => { unconfirmedAttempts = 0; },
  args: {
    acceptReplacement: fn<AcceptReplacement>(async (request) => {
      unconfirmedAttempts += 1;
      if (unconfirmedAttempts === 1) throw new TypeError("Failed to fetch");
      if (unconfirmedAttempts === 2) return { status: "error", code: "UNAUTHENTICATED", message: "Log in again to accept this invitation.", unconfirmed: false };
      return fakeAcceptReplacement(request);
    }),
  },
  play: async ({ args, canvas }) => {
    await openAccept(canvas, "Our Tampines Hub");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Accept and hold" }));
    await waitFor(() => expect(within(dialog()).getByText(/couldn't confirm whether you took the place/i)).toBeVisible());
    // The place may already be taken, so the dialog no longer offers "Not now".
    await expect(within(dialog()).queryByRole("button", { name: "Not now" })).not.toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Retry later" }));
    await dialogClosed();
    await openAccept(canvas, "Our Tampines Hub");
    await waitFor(() => expect(within(dialog()).getByText(/last request to take this place wasn't confirmed/i)).toBeVisible());
    await userEvent.click(within(dialog()).getByRole("button", { name: "Retry accepting" }));
    await waitFor(() => expect(within(dialog()).getByText("Log in again to accept this invitation.")).toBeVisible());
    await expect(within(dialog()).getByRole("button", { name: "Retry accepting" })).toBeEnabled();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Retry accepting" }));
    await waitFor(() => expect(within(dialog()).getByRole("status")).toHaveTextContent("is now held"));
    const keys = calls(args.acceptReplacement).map(([request]) => request.idempotencyKey);
    await expect(keys).toHaveLength(3);
    await expect(new Set(keys).size).toBe(1);
  },
};

/** An unresolved acceptance saved before a reload is offered as a retry with the saved key. */
let reloadStore = memoryUnresolvedStore<string>();
export const UnresolvedAfterReload: Story = {
  beforeEach: () => { reloadStore = memoryUnresolvedStore(new Map([[futsalInvitation.sessionId, "saved-before-reload"]])); },
  render: (args) => <ReplacementInvitationsPageHarness {...args} store={reloadStore} />,
  play: async ({ args, canvas }) => {
    await openAccept(canvas, "Our Tampines Hub");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Retry accepting" }));
    await waitFor(() => expect(within(dialog()).getByRole("status")).toHaveTextContent("is now held"));
    await expect(args.acceptReplacement).toHaveBeenCalledOnce();
    await expect(args.acceptReplacement).toHaveBeenCalledWith({ sessionId: futsalInvitation.sessionId, idempotencyKey: "saved-before-reload" });
    await waitFor(() => expect(reloadStore.saved().size).toBe(0));
  },
};

/** The server no longer lists the invitation, which establishes the saved request's outcome. */
let settledStore = memoryUnresolvedStore<string>();
export const UnresolvedAlreadySettled: Story = {
  beforeEach: () => { settledStore = memoryUnresolvedStore(new Map([["77777777-7777-4777-8777-777777777777", "accepted-elsewhere"]])); },
  render: (args) => <ReplacementInvitationsPageHarness {...args} store={settledStore} />,
  play: async ({ canvas }) => {
    await canvas.findAllByRole("listitem");
    await waitFor(() => expect(settledStore.saved().size).toBe(0));
  },
};

export const Desktop: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas }) => { await waitFor(() => expect(canvas.getAllByRole("listitem")).toHaveLength(2)); },
};
