import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StrictMode, useEffect, useState } from "react";
import { expect, userEvent } from "storybook/test";
import { SessionsUiProvider, useSessionsUiStore } from "./sessions-ui-provider";
import { createSessionsUrlStorage } from "./sessions-url-storage";
import type { SessionsUiActions } from "./sessions-ui-store";

const firstSessionId = "54000000-0000-4000-8000-000000000001";
const secondSessionId = "54000000-0000-4000-8000-000000000002";
const retainedActions = new Map<string, SessionsUiActions>();

function StoreControls({ account }: { readonly account: string }) {
  const state = useSessionsUiStore((state) => state);
  const sessionId = account === "first" ? firstSessionId : secondSessionId;
  useEffect(() => { retainedActions.set(account, state); }, [account, state]);
  return <div className="space-y-3">
    <p>Account: {account}</p>
    <output aria-label="Current selection">{state.tab} / {state.activeSessionId ?? "none"} / {state.detailPanels[sessionId] ?? "details"} / {state.mode.status}</output>
    <div className="flex gap-3">
      <button type="button" onClick={() => state.selectTab("hosting")}>Select Hosting</button>
      <button type="button" onClick={() => state.selectTimelineSession(sessionId)}>Select timeline card</button>
      <button type="button" onClick={() => state.selectDetailPanel(sessionId, "participants")}>Select Participants</button>
      <button type="button" onClick={() => state.openSession(sessionId)}>Open session</button>
    </div>
  </div>;
}

function PersistenceLifecycleHarness() {
  const [account, setAccount] = useState("first");
  const [visible, setVisible] = useState(true);
  const [storage] = useState(() => createSessionsUrlStorage(
    () => new URL(window.location.href),
    (url) => window.history.replaceState(window.history.state, "", url),
  ));
  return <div className="space-y-4 p-6">
    <div className="flex gap-3">
      <button type="button" onClick={() => setAccount("second")}>Use second account</button>
      <button type="button" onClick={() => setVisible(false)}>Leave sessions</button>
    </div>
    {visible ? <StrictMode><SessionsUiProvider key={account} persistence={{ storage, search: "", resetSelection: account === "second" }}>
      <StoreControls account={account} />
    </SessionsUiProvider></StrictMode> : <p>Sessions unmounted.</p>}
  </div>;
}

const meta = {
  title: "Sessions/URL persistence lifecycle",
  component: PersistenceLifecycleHarness,
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    retainedActions.clear();
    const originalUrl = window.location.href;
    const url = new URL(originalUrl);
    for (const key of ["tab", "session", "panel", "created"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url);
    return () => { window.history.replaceState(window.history.state, "", originalUrl); };
  },
} satisfies Meta<typeof PersistenceLifecycleHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RetiredAccountCannotWriteUrl: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Select Hosting" }));
    await userEvent.click(canvas.getByRole("button", { name: "Open session" }));
    const retired = retainedActions.get("first");
    if (!retired) throw new Error("The first account store has not mounted.");
    await userEvent.click(canvas.getByRole("button", { name: "Use second account" }));
    await userEvent.click(canvas.getByRole("button", { name: "Select timeline card" }));
    await userEvent.click(canvas.getByRole("button", { name: "Select Participants" }));
    await userEvent.click(canvas.getByRole("button", { name: "Open session" }));
    const currentUrl = window.location.href;
    await expect(new URL(currentUrl).searchParams.get("session")).toBe(secondSessionId);
    await expect(new URL(currentUrl).searchParams.get("panel")).toBe("participants");

    // A request from the previous account can complete after its provider unmounts.
    retired.closeSession();
    await expect(window.location.href).toBe(currentUrl);
    await expect(canvas.getByRole("status", { name: "Current selection" })).toHaveTextContent(`joined / ${secondSessionId} / participants / viewingSession`);
  },
};

export const UnmountedPageCannotWriteUrl: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Select Hosting" }));
    await userEvent.click(canvas.getByRole("button", { name: "Open session" }));
    const retired = retainedActions.get("first");
    if (!retired) throw new Error("The sessions store has not mounted.");
    await userEvent.click(canvas.getByRole("button", { name: "Leave sessions" }));
    await expect(canvas.getByText("Sessions unmounted.")).toBeVisible();
    const destination = new URL("/wallet?source=sessions#activity", window.location.href);
    window.history.replaceState(window.history.state, "", destination);

    // Late cancellation completion must not add session parameters to another route.
    retired.closeSession();
    await expect(window.location.href).toBe(destination.href);
    await expect(canvas.queryByRole("status", { name: "Current selection" })).not.toBeInTheDocument();
  },
};
