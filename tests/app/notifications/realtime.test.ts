import { beforeEach, expect, test, vi } from "vitest";
import { subscribeToNotifications } from "@/app/notifications/realtime";

const mock = vi.hoisted(() => ({
  session: vi.fn(),
  setAuth: vi.fn(),
  channel: vi.fn(),
  remove: vi.fn(),
  authChange: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: mock.session, onAuthStateChange: mock.authChange },
    realtime: { setAuth: mock.setAuth },
    channel: mock.channel,
    removeChannel: mock.remove,
  }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  mock.setAuth.mockResolvedValue(undefined);
  mock.remove.mockResolvedValue(undefined);
  mock.session.mockResolvedValue({
    data: { session: { user: { id: "one" }, access_token: "first" } },
  });
});
test("authenticates a private owned channel, reconciles subscribe and hints, and cleans up only its own channel", async () => {
  let message = () => {},
    status: (value: string) => void = () => {},
    auth: (event: string, session: unknown) => void = () => {};
  const channel = {
    on: vi.fn((_type: string, _event: unknown, callback: () => void) => {
      message = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: (s: string) => void) => {
      status = callback;
      return channel;
    }),
  };
  mock.channel.mockReturnValue(channel);
  mock.authChange.mockImplementation((callback) => {
    auth = callback;
    return { data: { subscription: { unsubscribe: mock.unsubscribe } } };
  });
  const hint = vi.fn(),
    lost = vi.fn();
  const stop = subscribeToNotifications("one", hint, lost);
  await vi.waitFor(() =>
    expect(mock.channel).toHaveBeenCalledExactlyOnceWith(
      "user:one:notifications",
      { config: { private: true } },
    ),
  );
  expect(mock.setAuth).toHaveBeenCalledWith("first");
  status("SUBSCRIBED");
  message();
  expect(hint).toHaveBeenCalledTimes(2);
  auth("TOKEN_REFRESHED", { user: { id: "one" }, access_token: "second" });
  await vi.waitFor(() =>
    expect(mock.setAuth).toHaveBeenLastCalledWith("second"),
  );
  auth("SIGNED_IN", { user: { id: "two" }, access_token: "other" });
  expect(lost).toHaveBeenCalledOnce();
  stop();
  message();
  expect(hint).toHaveBeenCalledTimes(3);
  expect(mock.remove).toHaveBeenCalledWith(channel);
  expect(mock.unsubscribe).toHaveBeenCalledOnce();
});
test("a changed identity cannot join the old account's channel", async () => {
  mock.session.mockResolvedValue({
    data: { session: { user: { id: "two" }, access_token: "other" } },
  });
  mock.authChange.mockReturnValue({
    data: { subscription: { unsubscribe: mock.unsubscribe } },
  });
  const lost = vi.fn();
  const stop = subscribeToNotifications("one", vi.fn(), lost);
  await vi.waitFor(() => expect(lost).toHaveBeenCalledOnce());
  expect(mock.channel).not.toHaveBeenCalled();
  stop();
});
test("repeated channel errors create only one reconnect attempt", async () => {
  vi.useFakeTimers();
  try {
    let status: (value: string) => void = () => {};
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn((callback: (s: string) => void) => {
        status = callback;
        return channel;
      }),
    };
    mock.channel.mockReturnValue(channel);
    mock.authChange.mockReturnValue({
      data: { subscription: { unsubscribe: mock.unsubscribe } },
    });
    const stop = subscribeToNotifications("one", vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(1);
    status("CHANNEL_ERROR");
    status("TIMED_OUT");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mock.session).toHaveBeenCalledTimes(2);
    stop();
  } finally {
    vi.useRealTimers();
  }
});
