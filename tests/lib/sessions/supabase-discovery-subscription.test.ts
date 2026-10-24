import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { subscribeToDiscoveryInvalidation } from "@/lib/sessions/supabase-discovery-subscription";

const sdk = vi.hoisted(() => ({ createClient: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), disconnect: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: sdk.createClient }));

function fakeChannel() {
  let receive: () => void = () => {};
  let status: (value: string) => void = () => {};
  const channel = {
    on: vi.fn((_kind: string, _filter: unknown, callback: () => void) => { receive = callback; return channel; }),
    subscribe: vi.fn((callback: (value: string) => void) => { status = callback; return channel; }),
  };
  return { channel, receive: () => receive(), status: (value: string) => status(value) };
}
let channels: ReturnType<typeof fakeChannel>[];

beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); channels = [];
  sdk.channel.mockImplementation(() => {
    const channel = fakeChannel(); channels.push(channel); return channel.channel;
  });
  sdk.removeChannel.mockResolvedValue("ok");
  sdk.createClient.mockReturnValue({ channel: sdk.channel, removeChannel: sdk.removeChannel, realtime: { disconnect: sdk.disconnect } });
});
afterEach(() => vi.useRealTimers());

const settings = { url: "https://example.supabase.co", key: "public-key" };

describe("public Supabase discovery invalidation adapter", () => {
  test("uses a dedicated anonymous public channel and emits only invalidations", () => {
    const invalidate = vi.fn();
    const stop = subscribeToDiscoveryInvalidation(settings, invalidate);
    expect(sdk.createClient).toHaveBeenCalledWith(settings.url, settings.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    expect(sdk.channel).toHaveBeenCalledWith("discovery:public:v1", { config: { private: false } });
    expect(channels[0]!.channel.on).toHaveBeenCalledWith("broadcast", { event: "invalidate" }, expect.any(Function));
    channels[0]!.status("SUBSCRIBED"); channels[0]!.receive();
    expect(invalidate.mock.calls).toEqual([[], []]);
    stop();
  });

  test.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])("rejoins after %s and ignores callbacks from removed channels", async (status) => {
    const invalidate = vi.fn();
    const stop = subscribeToDiscoveryInvalidation(settings, invalidate);
    channels[0]!.status(status); channels[0]!.status(status);
    channels[0]!.receive();
    expect(invalidate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sdk.removeChannel).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(2);
    channels[1]!.status("SUBSCRIBED");
    expect(invalidate).toHaveBeenCalledOnce();
    stop();
  });

  test("backs off repeated failures, then resets backoff on subscription", async () => {
    const stop = subscribeToDiscoveryInvalidation(settings, vi.fn());
    channels[0]!.status("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(1_000);
    channels[1]!.status("TIMED_OUT");
    await vi.advanceTimersByTimeAsync(1_999);
    expect(channels).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    channels[2]!.status("SUBSCRIBED"); channels[2]!.status("CLOSED");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(channels).toHaveLength(4);
    stop();
  });

  test("cleanup prevents a retry queued behind asynchronous channel removal", async () => {
    let release = () => {};
    sdk.removeChannel.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    const invalidate = vi.fn();
    const stop = subscribeToDiscoveryInvalidation(settings, invalidate);
    channels[0]!.status("CHANNEL_ERROR"); stop(); stop(); release();
    await vi.advanceTimersByTimeAsync(60_000);
    channels[0]!.status("SUBSCRIBED"); channels[0]!.receive();
    expect(channels).toHaveLength(1);
    expect(invalidate).not.toHaveBeenCalled();
    expect(sdk.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("handles removal rejection without an unhandled promise or lost retry", async () => {
    sdk.removeChannel.mockRejectedValueOnce(new Error("Disconnected"));
    const stop = subscribeToDiscoveryInvalidation(settings, vi.fn());
    channels[0]!.status("CLOSED");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(channels).toHaveLength(2);
    stop();
  });
});
