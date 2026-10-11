import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useRef, useState } from "react";
import { expect, userEvent, waitFor } from "storybook/test";
import { Button } from "@/components/ui/button";
import { useUnresolvedRequests, type SettleAttempt } from "../use-unresolved-requests";
import { memoryUnresolvedStore } from "../withdrawal-recovery";

type Stores = Readonly<Record<string, ReturnType<typeof memoryUnresolvedStore<string>>>>;

/**
 * A test harness for `useUnresolvedRequests`, which the UC2-05 flows share: it shows the signed-in
 * user's unresolved requests and lets a story send one, switch account, and settle late.
 */
function UnresolvedRequestsHarness({ stores }: { readonly stores: Stores }) {
  const [userId, setUserId] = useState("user-a");
  const settleLate = useRef<SettleAttempt | null>(null);
  const requests = useUnresolvedRequests({ userId, openStore: (id) => stores[id]!, reconcile: (saved) => saved });
  return (
    <div className="space-y-3 p-4">
      <p>Signed in as {userId}</p>
      <ul aria-label="Unresolved requests">
        {[...requests.unresolved].map(([sessionId, key]) => <li key={sessionId}>{sessionId}: {key}</li>)}
      </ul>
      <Button type="button" onClick={() => { settleLate.current = requests.begin("session-2", "key-2", false); }}>Send</Button>
      <Button type="button" onClick={() => setUserId("user-b")}>Switch account</Button>
      <Button type="button" onClick={() => settleLate.current?.("unconfirmed")}>Settle late</Button>
    </div>
  );
}

const meta = {
  title: "Commitments/Unresolved requests",
  component: UnresolvedRequestsHarness,
  args: { stores: {} },
} satisfies Meta<typeof UnresolvedRequestsHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

let stores: { readonly "user-a": ReturnType<typeof memoryUnresolvedStore<string>>; readonly "user-b": ReturnType<typeof memoryUnresolvedStore<string>> };

/** A first attempt is saved before it is sent, and only in the signed-in user's store. */
export const SavedBeforeSendingForThisUserOnly: Story = {
  beforeEach: () => {
    stores = { "user-a": memoryUnresolvedStore(new Map([["session-1", "key-1"]])), "user-b": memoryUnresolvedStore<string>() };
  },
  render: () => <UnresolvedRequestsHarness stores={stores} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("listitem")).toHaveTextContent("session-1: key-1");
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));
    // Saved straight away, before any response.
    await expect(stores["user-a"].saved().get("session-2")).toBe("key-2");

    await userEvent.click(canvas.getByRole("button", { name: "Switch account" }));
    await waitFor(() => expect(canvas.getByText("Signed in as user-b")).toBeVisible());
    await expect(canvas.queryByRole("listitem")).not.toBeInTheDocument();

    // An attempt the previous user started never lands in the next user's requests.
    await userEvent.click(canvas.getByRole("button", { name: "Settle late" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(canvas.queryByRole("listitem")).not.toBeInTheDocument();
    await expect(stores["user-b"].saved().size).toBe(0);
    await expect([...stores["user-a"].saved().keys()]).toEqual(["session-1", "session-2"]);
  },
};
