import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { connectSessionDevtools } from "@/app/sessions/create/create-session-devtools";
import { creationScreen, createSessionStore, type CreateSessionStoreOptions, type CreateSessionStoreState } from "@/app/sessions/create/create-session-store";
import { emptySessionDraft } from "@/app/sessions/create/model";
import { savedDraftStorageKey } from "@/app/sessions/create/saved-session-draft";
import type { CreateSession } from "@/app/sessions/create/transport";

const complete = {
  ...emptySessionDraft, venueName: "Booked court", region: "West", cost: "60.00", price: "7.50",
  startDate: "2045-06-17", startTime: "23:00", endDate: "2045-06-18", endTime: "01:00",
};
type DevtoolsMessage = { type: "DISPATCH"; payload: { type: "JUMP_TO_STATE" }; state: string };

function connection(name: string) {
  let receive: ((message: DevtoolsMessage) => void) | undefined;
  return {
    name,
    init: vi.fn<(state: CreateSessionStoreState) => void>(),
    send: vi.fn<(action: { type: string }, state: CreateSessionStoreState) => void>(),
    subscribe: vi.fn((listener: (message: DevtoolsMessage) => void) => {
      receive = listener;
      return () => { receive = undefined; };
    }),
    unsubscribe: vi.fn(() => { receive = undefined; }),
    jumpTo: (state: string) => receive?.({ type: "DISPATCH", payload: { type: "JUMP_TO_STATE" }, state }),
  };
}
function extension() {
  const connections: ReturnType<typeof connection>[] = [];
  const connect = vi.fn((options: { name: string }) => {
    const client = connection(options.name);
    connections.push(client);
    return client;
  });
  vi.stubGlobal("window", { __REDUX_DEVTOOLS_EXTENSION__: { connect } });
  return { connections, connect };
}
function setup(options: Partial<CreateSessionStoreOptions> = {}, initialize = true) {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
  const store = createSessionStore({
    userId: "alice", initialDraft: complete, initialStep: 3, getStorage: () => storage,
    now: () => Date.parse("2045-06-16T00:00:00Z"), newId: () => "submission-1", ...options,
  });
  if (initialize) void store.getState().initialize();
  return { store, storage, values };
}
const cleanups: Array<() => void> = [];
function attach(store: ReturnType<typeof createSessionStore>) {
  const cleanup = connectSessionDevtools(store);
  cleanups.push(cleanup);
  return cleanup;
}
beforeEach(() => { vi.stubEnv("NODE_ENV", "development"); });
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Create-session Redux DevTools connection", () => {
  test("connects only when attached and initializes with the existing store's current state", () => {
    const devtools = extension();
    const { store, storage } = setup({ initialStep: 1 });
    store.getState().change({ venueName: "Edited before attachment" });
    expect(devtools.connect).not.toHaveBeenCalled();
    const current = store.getState();

    attach(store);
    expect(devtools.connect).toHaveBeenCalledOnce();
    expect(devtools.connect).toHaveBeenCalledWith(expect.objectContaining({ name: expect.stringMatching(/^Session creation #\d+$/) }));
    expect(devtools.connections[0]!.init).toHaveBeenCalledExactlyOnceWith(current);
    expect(devtools.connections[0]!.subscribe).toHaveBeenCalledOnce();
    expect(store.getState()).toBe(current);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();

    store.getState().advance();
    store.getState().back();
    expect(devtools.connections[0]!.send.mock.calls.map(([action, state]) => [action.type, creationScreen(state)])).toEqual([
      ["session/next", "settings"], ["session/back", "venue"],
    ]);
  });

  test("records post-mount initialization once as a named transition", async () => {
    const devtools = extension();
    const { store, storage } = setup({ initialStep: 1 }, false);
    expect(store.getState().workflow.status).toBe("initializing");
    expect(storage.getItem).not.toHaveBeenCalled();
    attach(store);
    const client = devtools.connections[0]!;
    expect(client.init).toHaveBeenCalledWith(expect.objectContaining({ workflow: { status: "initializing" } }));

    await store.getState().initialize();
    await store.getState().initialize();
    expect(client.send).toHaveBeenCalledExactlyOnceWith({ type: "session/initialized" }, expect.objectContaining({
      workflow: expect.objectContaining({ status: "editing", editor: { screen: "schedule", duration: { mode: "preset", value: "120" } } }),
    }));
    expect(storage.getItem).toHaveBeenCalledOnce();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  test("records desktop screens, schedule, duration, and explicit draft saving by name", () => {
    const devtools = extension();
    const { store, storage } = setup({ initialStep: 1 });
    attach(store);
    const client = devtools.connections[0]!;
    storage.getItem.mockClear();

    store.getState().advance("desktop");
    store.getState().advance("desktop");
    store.getState().back("desktop");
    store.getState().back("desktop");
    store.getState().chooseDuration("custom");
    store.getState().changeDuration("75");
    store.getState().changeSchedule({ startTime: "22:30" });
    expect(storage.setItem).not.toHaveBeenCalled();
    store.getState().saveDraft();

    expect(client.send.mock.calls.map(([action, state]) => [action.type, creationScreen(state)])).toEqual([
      ["session/next", "venue"],
      ["session/next", "settings"],
      ["session/back", "venue"],
      ["session/back", "schedule"],
      ["session/durationModeChanged", "schedule"],
      ["session/durationChanged", "schedule"],
      ["session/scheduleChanged", "schedule"],
      ["session/draftSaved", "schedule"],
    ]);
    expect(client.send.mock.calls.at(-1)![1]).toMatchObject({
      workflow: { status: "editing", editor: { screen: "schedule", duration: { mode: "custom", value: "75" } } },
      savedSnapshot: { desktopStep: 1, duration: "75", durationMode: "custom" }, saveResult: { status: "saved" },
    });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  test.each([
    { failure: "an ambiguous response", action: "session/confirmationRequired", throws: false },
    { failure: "a lost response", action: "session/submitUnconfirmed", throws: true },
  ])("records named snapshots for $failure and its successful retry", async ({ action, throws }) => {
    const devtools = extension();
    const { store } = setup();
    attach(store);
    const client = devtools.connections[0]!;
    const create = vi.fn<CreateSession>();
    if (throws) create.mockRejectedValueOnce(new Error("Connection lost"));
    else create.mockResolvedValueOnce({ status: "error", code: "UNKNOWN_RESULT", message: "Retry safely.", ambiguous: true });
    create.mockResolvedValueOnce({ status: "created" });

    expect(await store.getState().submit(create)).toEqual({ status: "failed" });
    expect(await store.getState().submit(create)).toEqual({ status: "created" });
    expect(client.send.mock.calls.map(([event, state]) => [event.type, state.workflow.status])).toEqual([
      ["session/submitStarted", "submitting"],
      [action, "awaitingConfirmation"],
      ["session/retryStarted", "submitting"],
      ["session/submitSucceeded", "completed"],
    ]);
    expect(client.send.mock.calls[0]![1].workflow).toMatchObject({ replaying: false });
    expect(client.send.mock.calls[2]![1].workflow).toMatchObject({ replaying: true });
    expect(create.mock.calls[1]![0]).toEqual(create.mock.calls[0]![0]);
    expect(client.send.mock.calls[3]![1].draft).toEqual(complete);
  });

  test("records a definitive rejection as editable state rather than a pending retry", async () => {
    const devtools = extension();
    const { store } = setup();
    attach(store);
    const failure = { status: "error", code: "INVALID_INPUT", message: "Check the booking.", ambiguous: false } as const;
    await store.getState().submit(vi.fn<CreateSession>().mockResolvedValue(failure));

    expect(devtools.connections[0]!.send).toHaveBeenLastCalledWith({ type: "session/submitRejected" }, expect.objectContaining({
      workflow: expect.objectContaining({ status: "editing", editor: { screen: "pricing", duration: { mode: "preset", value: "120" } }, errors: {}, failure }),
    }));
  });

  test("gives separate stores independent names, connections, and state histories", () => {
    const devtools = extension();
    const first = setup();
    const second = setup({ userId: "bob" });
    attach(first.store);
    attach(second.store);
    const [firstClient, secondClient] = devtools.connections;

    expect(devtools.connect).toHaveBeenCalledTimes(2);
    expect(firstClient!.name).not.toBe(secondClient!.name);
    first.store.getState().change({ venueName: "Alice's court" });
    expect(firstClient!.send).toHaveBeenCalledExactlyOnceWith({ type: "session/change" }, expect.objectContaining({
      draft: expect.objectContaining({ venueName: "Alice's court" }),
    }));
    expect(secondClient!.send).not.toHaveBeenCalled();
    expect(second.store.getState().draft.venueName).toBe("Booked court");
  });

  test("cleanup stops outbound updates and incoming time travel, and is idempotent", () => {
    const devtools = extension();
    const { store } = setup();
    const originalSetter = store.setState;
    const cleanup = attach(store);
    const client = devtools.connections[0]!;
    const oldState = JSON.stringify(store.getState());
    store.getState().change({ venueName: "Before cleanup" });
    cleanup();
    cleanup();

    expect(client.unsubscribe).toHaveBeenCalledOnce();
    expect(store.setState).toBe(originalSetter);
    expect(store).not.toHaveProperty("devtools");
    store.getState().change({ venueName: "After cleanup" });
    client.jumpTo(oldState);
    expect(store.getState().draft.venueName).toBe("After cleanup");
    expect(client.send).toHaveBeenCalledOnce();
  });

  test("reattaches the same store after cleanup using the same name and current state", () => {
    const devtools = extension();
    const { store } = setup();
    const cleanup = attach(store);
    const firstClient = devtools.connections[0]!;
    cleanup();
    store.getState().change({ venueName: "Changed while disconnected" });
    attach(store);
    const secondClient = devtools.connections[1]!;

    expect(secondClient.name).toBe(firstClient.name);
    expect(secondClient.init).toHaveBeenCalledExactlyOnceWith(store.getState());
    store.getState().change({ venueName: "Changed after reconnecting" });
    expect(firstClient.send).not.toHaveBeenCalled();
    expect(secondClient.send).toHaveBeenCalledExactlyOnceWith({ type: "session/change" }, store.getState());
  });

  test("time travel restores state without replaying I/O or losing callable actions", async () => {
    const devtools = extension();
    const { store, storage } = setup();
    attach(store);
    const client = devtools.connections[0]!;
    const original = store.getState();
    const editingSnapshot = JSON.stringify(original);
    const create = vi.fn<CreateSession>().mockResolvedValue({ status: "created" });
    await store.getState().submit(create);
    const submittingSnapshot = JSON.stringify(client.send.mock.calls[0]![1]);
    client.send.mockClear();
    create.mockClear();
    storage.getItem.mockClear();
    storage.setItem.mockClear();
    storage.removeItem.mockClear();

    client.jumpTo(submittingSnapshot);
    expect(store.getState().workflow.status).toBe("submitting");
    client.jumpTo(editingSnapshot);
    expect(store.getState()).toMatchObject({ draft: complete, workflow: { status: "editing" } });
    expect(creationScreen(store.getState())).toBe("pricing");
    for (const action of ["initialize", "change", "changeSchedule", "chooseDuration", "changeDuration", "advance", "back", "saveDraft", "restartAfterRecovery", "submit"] as const) {
      expect(store.getState()[action]).toBe(original[action]);
    }
    expect(client.send).not.toHaveBeenCalled();
    store.getState().change({ venueName: "Edited after time travel" });
    expect(client.send).toHaveBeenCalledExactlyOnceWith({ type: "session/change" }, store.getState());
    expect(store.getState().draft.venueName).toBe("Edited after time travel");
    expect(create).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  test("time travel through saved snapshots never reads or rewrites the saved draft", () => {
    const devtools = extension();
    const { store, storage, values } = setup({ initialStep: 1 });
    attach(store);
    const client = devtools.connections[0]!;
    store.getState().saveDraft();
    const firstSavedSnapshot = JSON.stringify(store.getState());
    store.getState().chooseDuration("custom");
    store.getState().changeDuration("75");
    store.getState().advance("desktop");
    store.getState().saveDraft();
    const secondSavedSnapshot = JSON.stringify(store.getState());
    const stored = values.get(savedDraftStorageKey("alice"));
    const savedAction = store.getState().saveDraft;
    client.send.mockClear();
    storage.getItem.mockClear();
    storage.setItem.mockClear();
    storage.removeItem.mockClear();

    client.jumpTo(firstSavedSnapshot);
    expect(store.getState()).toMatchObject({ savedSnapshot: { desktopStep: 1, duration: "120", durationMode: "preset" }, saveResult: { status: "saved" } });
    expect(creationScreen(store.getState())).toBe("schedule");
    client.jumpTo(secondSavedSnapshot);
    expect(store.getState()).toMatchObject({ savedSnapshot: { desktopStep: 2, duration: "75", durationMode: "custom" }, saveResult: { status: "saved" } });
    expect(creationScreen(store.getState())).toBe("venue");
    expect(store.getState().saveDraft).toBe(savedAction);
    expect(client.send).not.toHaveBeenCalled();
    expect(values.get(savedDraftStorageKey("alice"))).toBe(stored);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  test.each([undefined, {}])("works without an extension when window is %s", (browser) => {
    vi.stubGlobal("window", browser);
    const { store } = setup();
    const originalSetter = store.setState;
    const cleanup = attach(store);
    store.getState().change({ venueName: "No extension installed" });
    expect(store.getState().draft.venueName).toBe("No extension installed");
    expect(store.setState).toBe(originalSetter);
    expect(cleanup).not.toThrow();
  });

  test("does not connect or instrument the store in production even with an installed extension", () => {
    const devtools = extension();
    vi.stubEnv("NODE_ENV", "production");
    const { store } = setup();
    const originalSetter = store.setState;
    const cleanup = attach(store);
    store.getState().change({ venueName: "Production court" });
    cleanup();

    expect(devtools.connect).not.toHaveBeenCalled();
    expect(store.setState).toBe(originalSetter);
    expect(store).not.toHaveProperty("devtools");
    expect(store.getState().draft.venueName).toBe("Production court");
  });
});
