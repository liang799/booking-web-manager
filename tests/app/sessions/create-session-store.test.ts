import { describe, expect, test, vi } from "vitest";
import { createSessionStore, creationScreen, creationDuration, hasUnsavedDraftChanges, type CreateSessionStoreOptions } from "@/app/sessions/create/create-session-store";
import { emptySessionDraft, pendingStorageKey, pendingSubmissionSchema, submissionPayload } from "@/app/sessions/create/model";
import type { CreateSession, CreationOutcome } from "@/app/sessions/create/transport";
import { savedDraftStorageKey } from "@/app/sessions/create/saved-session-draft";

const complete = {
  ...emptySessionDraft, venueName: "Booked court", region: "West", cost: "60.00", price: "7.50",
  startDate: "2045-06-17", startTime: "23:00", endDate: "2045-06-18", endTime: "01:00",
};
const key = pendingStorageKey("alice");
const pending = (id = "retained-key") => ({ version: 1, payload: submissionPayload(complete, id) });
const encoded = (id = "retained-key") => JSON.stringify(pending(id));
const rejected: CreationOutcome = { status: "error", code: "INVALID_INPUT", message: "Check the booking.", ambiguous: false };
const ambiguous: CreationOutcome = { status: "error", code: "UNKNOWN_RESULT", message: "Retry safely.", ambiguous: true };

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[key, initial]]);
  return {
    values,
    getItem: vi.fn((name: string) => values.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => { values.set(name, value); }),
    removeItem: vi.fn((name: string) => { values.delete(name); }),
  };
}
function setup(options: Partial<CreateSessionStoreOptions> = {}, storage = memoryStorage()) {
  let sequence = 0;
  const newId = vi.fn(() => `submission-${++sequence}`);
  const store = createSessionStore({
    userId: "alice", initialDraft: complete, initialStep: 3,
    getStorage: () => storage, now: () => Date.parse("2045-06-16T00:00:00Z"), newId, ...options,
  });
  void store.getState().initialize();
  return { store, storage, newId };
}
function deferred() {
  let finish: (result: CreationOutcome) => void = () => { throw new Error("Deferred request was not initialized"); };
  const promise = new Promise<CreationOutcome>((resolve) => { finish = resolve; });
  return { promise, finish };
}

describe("Create-session workflow store", () => {
  test("initializes without writing storage and keeps separate wizard drafts independent", () => {
    const first = setup({ initialDraft: emptySessionDraft, initialStep: 1 });
    const second = setup({ initialDraft: emptySessionDraft, initialStep: 1 }, first.storage);
    first.store.getState().change({ venueName: "First court" });
    expect(second.store.getState().draft.venueName).toBe("");
    expect(emptySessionDraft.venueName).toBe("");
    expect(first.storage.setItem).not.toHaveBeenCalled();
    expect(first.storage.removeItem).not.toHaveBeenCalled();
    expect(first.store.getState().workflow).toMatchObject({ status: "editing", errors: {}, failure: null });
  });

  test("validates mobile navigation across the three presented steps", () => {
    const { store } = setup({ initialDraft: emptySessionDraft, initialStep: 1 });
    store.getState().back();
    expect(creationScreen(store.getState())).toBe("schedule");
    expect(store.getState().advance()).toHaveProperty("dateTime");
    expect(creationScreen(store.getState())).toBe("schedule");
    store.getState().change(complete);
    expect(store.getState().workflow).toMatchObject({ status: "editing", errors: {}, failure: null });
    expect(store.getState().advance()).toBeUndefined();
    expect(creationScreen(store.getState())).toBe("settings");
    store.getState().advance();
    store.getState().advance();
    expect(creationScreen(store.getState())).toBe("pricing");
    store.getState().back();
    expect(creationScreen(store.getState())).toBe("settings");
  });

  test("updates the suggested price when editing capacity or cost", () => {
    const { store } = setup();
    store.getState().change({ totalSlots: 2 });
    expect(store.getState().draft).toMatchObject({ totalSlots: 2, price: "30.00" });
    store.getState().change({ cost: "80.00" });
    expect(store.getState().draft.price).toBe("40.00");
  });

  test("checks every step before submission and returns the first invalid step's errors", async () => {
    const { store, storage } = setup({ initialDraft: { ...complete, reliability: "invalid" } });
    const create = vi.fn<CreateSession>();
    const result = await store.getState().submit(create);
    expect(result).toEqual({ status: "invalid", errors: { reliability: expect.any(String) } });
    expect(store.getState()).toMatchObject({ workflow: { status: "editing", editor: { screen: "settings" }, errors: { reliability: expect.any(String) } } });
    expect(create).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test("persists before sending and synchronously freezes duplicate submissions and editing", async () => {
    const { store, storage, newId } = setup();
    const request = deferred();
    const create = vi.fn<CreateSession>((payload) => {
      expect(JSON.parse(storage.getItem(key)!)).toEqual({ version: 1, payload });
      expect(store.getState().workflow.status).toBe("submitting");
      return request.promise;
    });
    const submission = store.getState().submit(create);
    expect(await store.getState().submit(create)).toEqual({ status: "ignored" });
    store.getState().change({ venueName: "Must not change" });
    store.getState().back();
    store.getState().advance();
    store.getState().advance("desktop");
    store.getState().changeSchedule({ startTime: "13:00" });
    store.getState().chooseDuration("custom");
    store.getState().changeDuration("7.");
    store.getState().saveDraft();
    store.getState().restartAfterRecovery();
    expect(store.getState()).toMatchObject({ draft: complete, workflow: { status: "submitting", replaying: false } });
    expect(create).toHaveBeenCalledOnce();
    expect(newId).toHaveBeenCalledOnce();
    request.finish({ status: "created" });
    expect(await submission).toEqual({ status: "created" });
    expect(store.getState().workflow).toEqual({ status: "completed" });
    expect(storage.getItem(key)).toBeNull();
    expect(await store.getState().submit(create)).toEqual({ status: "ignored" });
    store.getState().change({ venueName: "Still must not change" });
    expect(store.getState().draft).toEqual(complete);
  });

  test("a definitive fresh rejection unlocks editing and the next submission gets a new key", async () => {
    const { store, storage } = setup();
    const create = vi.fn<CreateSession>().mockResolvedValueOnce(rejected).mockResolvedValueOnce({ status: "created" });
    expect(await store.getState().submit(create)).toEqual({ status: "failed" });
    expect(store.getState().workflow).toMatchObject({ status: "editing", errors: {}, failure: rejected });
    expect(storage.getItem(key)).toBeNull();
    store.getState().change({ venueName: "Updated court" });
    expect(store.getState().workflow).toMatchObject({ status: "editing", errors: {}, failure: null });
    await store.getState().submit(create);
    expect(create.mock.calls[0]![0].idempotencyKey).toBe("submission-1");
    expect(create.mock.calls[1]![0]).toMatchObject({ idempotencyKey: "submission-2", booking: { venueName: "Updated court" } });
  });

  test("ambiguous retries retain exact payloads even after time passes or authentication rejects a replay", async () => {
    let instant = Date.parse("2045-06-16T00:00:00Z");
    const { store, storage, newId } = setup({ now: () => instant });
    const expired: CreationOutcome = { status: "error", code: "UNAUTHENTICATED", message: "Sign in again.", ambiguous: false };
    const create = vi.fn<CreateSession>().mockResolvedValueOnce(ambiguous).mockResolvedValueOnce(expired).mockResolvedValueOnce({ status: "created" });
    await store.getState().submit(create);
    const original = storage.getItem(key);
    store.getState().change({ price: "12.00" });
    store.getState().back();
    expect(store.getState()).toMatchObject({ draft: complete, workflow: { status: "awaitingConfirmation", failure: ambiguous } });
    instant = Date.parse("2045-06-19T00:00:00Z");
    expect(await store.getState().submit(create)).toEqual({ status: "failed" });
    expect(store.getState().workflow).toMatchObject({ status: "awaitingConfirmation", failure: expired });
    expect(storage.getItem(key)).toBe(original);
    expect(await store.getState().submit(create)).toEqual({ status: "created" });
    expect(create.mock.calls.map(([payload]) => payload)).toEqual(Array(3).fill(JSON.parse(original!).payload));
    expect(newId).toHaveBeenCalledOnce();
  });

  test("a thrown transport error retains the persisted request for retry", async () => {
    const { store, storage } = setup();
    await store.getState().submit(vi.fn<CreateSession>().mockRejectedValue(new Error("lost connection")));
    expect(store.getState().workflow).toMatchObject({ status: "awaitingConfirmation", failure: { code: "UNKNOWN_RESULT", ambiguous: true } });
    expect(JSON.parse(storage.getItem(key)!)).toEqual(pending("submission-1"));
  });

  test("restores and replays a pending request without rewriting it during initialization", async () => {
    const storage = memoryStorage(encoded());
    const { store, newId } = setup({ initialDraft: emptySessionDraft, initialStep: 1 }, storage);
    expect(store.getState()).toMatchObject({ draft: complete, workflow: { status: "awaitingConfirmation", pending: pending() } });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    const create = vi.fn<CreateSession>().mockResolvedValue({ status: "created" });
    await store.getState().submit(create);
    expect(create).toHaveBeenCalledWith(pending().payload);
    expect(newId).not.toHaveBeenCalled();
    expect(storage.getItem(key)).toBeNull();
  });

  test.each(["", "{broken", '{"version":2,"payload":{}}'])("retains unreadable pending evidence %s until a backup permits recovery", async (original) => {
    const storage = memoryStorage(original);
    const { store } = setup({}, storage);
    const create = vi.fn<CreateSession>();
    expect(store.getState().workflow.status).toBe("recoveryRequired");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(await store.getState().submit(create)).toEqual({ status: "ignored" });
    store.getState().change({ venueName: "Blocked" });
    expect(store.getState().draft).toEqual(complete);
    store.getState().restartAfterRecovery();
    expect(storage.getItem(`${key}:unresolved:submission-1`)).toBe(original);
    expect(storage.getItem(key)).toBeNull();
    expect(store.getState().workflow).toMatchObject({ status: "editing", errors: {}, failure: null });
    expect(create).not.toHaveBeenCalled();
    expect(storage.setItem.mock.invocationCallOrder[0]).toBeLessThan(storage.removeItem.mock.invocationCallOrder[0]!);
  });

  test("unavailable storage keeps recovery blocked until it can be read safely", () => {
    const storage = memoryStorage();
    storage.getItem.mockImplementation(() => { throw new Error("storage blocked"); });
    const { store } = setup({}, storage);
    expect(store.getState().workflow.status).toBe("recoveryRequired");
    store.getState().restartAfterRecovery();
    expect(store.getState().workflow).toMatchObject({ status: "recoveryRequired", failure: { code: "PENDING_RECOVERY_FAILED" } });
    storage.getItem.mockReturnValue(null);
    store.getState().restartAfterRecovery();
    expect(store.getState().workflow.status).toBe("editing");
  });

  test.each(["backup", "remove"])("a recovery %s failure preserves the original and remains blocked", (failure) => {
    const storage = memoryStorage("{broken");
    const { store } = setup({}, storage);
    if (failure === "backup") storage.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    else storage.removeItem.mockImplementationOnce(() => { throw new Error("blocked"); });
    store.getState().restartAfterRecovery();
    expect(storage.getItem(key)).toBe("{broken");
    expect(store.getState().workflow.status).toBe("recoveryRequired");
    if (failure === "backup") expect(storage.removeItem).not.toHaveBeenCalled();
    store.getState().restartAfterRecovery();
    expect(storage.getItem(`${key}:unresolved:submission-2`)).toBe("{broken");
    expect(store.getState().workflow.status).toBe("editing");
  });

  test("a valid request discovered during recovery is restored instead of archived or deleted", () => {
    const storage = memoryStorage("{broken");
    const { store } = setup({}, storage);
    storage.values.set(key, encoded("newer-request"));
    store.getState().restartAfterRecovery();
    expect(store.getState().workflow).toMatchObject({ status: "awaitingConfirmation", pending: pending("newer-request") });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  test("recovery rereads the original after backup and preserves a replacement", () => {
    const storage = memoryStorage("{broken");
    const { store } = setup({}, storage);
    storage.setItem.mockImplementationOnce((name, value) => {
      storage.values.set(name, value);
      storage.values.set(key, encoded("intervening-request"));
    });
    store.getState().restartAfterRecovery();
    expect(storage.getItem(`${key}:unresolved:submission-1`)).toBe("{broken");
    expect(storage.getItem(key)).toBe(encoded("intervening-request"));
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(store.getState().workflow).toMatchObject({ status: "awaitingConfirmation", pending: pending("intervening-request") });
  });

  test("a stale same-user instance restores an intervening pending submission without sending or overwriting it", async () => {
    const { store: first, storage } = setup();
    const { store: second, newId } = setup({}, storage);
    const request = deferred();
    const firstCreate = vi.fn<CreateSession>(() => request.promise);
    const secondCreate = vi.fn<CreateSession>();
    const firstSubmission = first.getState().submit(firstCreate);
    const original = storage.getItem(key);
    expect(await second.getState().submit(secondCreate)).toEqual({ status: "ignored" });
    expect(second.getState().workflow).toMatchObject({ status: "awaitingConfirmation", pending: pending("submission-1") });
    expect(secondCreate).not.toHaveBeenCalled();
    expect(newId).not.toHaveBeenCalled();
    expect(storage.getItem(key)).toBe(original);
    expect(storage.setItem).toHaveBeenCalledOnce();
    request.finish({ status: "created" });
    await firstSubmission;
  });

  test("an intervening malformed record blocks a fresh submission without overwriting evidence", async () => {
    const { store, storage } = setup();
    storage.values.set(key, "{new-corrupt-record");
    const create = vi.fn<CreateSession>();
    expect(await store.getState().submit(create)).toEqual({ status: "failed" });
    expect(store.getState().workflow.status).toBe("recoveryRequired");
    expect(storage.getItem(key)).toBe("{new-corrupt-record");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test("a fresh storage read failure requires recovery without making a request", async () => {
    const { store, storage } = setup();
    storage.getItem.mockImplementationOnce(() => { throw new Error("blocked"); });
    const create = vi.fn<CreateSession>();
    expect(await store.getState().submit(create)).toEqual({ status: "failed" });
    expect(store.getState().workflow.status).toBe("recoveryRequired");
    expect(create).not.toHaveBeenCalled();
  });

  test("a fresh storage write failure leaves editing available without sending", async () => {
    const { store, storage } = setup();
    storage.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    const create = vi.fn<CreateSession>();
    expect(await store.getState().submit(create)).toEqual({ status: "failed" });
    expect(store.getState().workflow).toMatchObject({ status: "editing", failure: { code: "STORAGE_UNAVAILABLE" } });
    expect(create).not.toHaveBeenCalled();
    expect(storage.getItem(key)).toBeNull();
  });

  test.each(["read", "remove"])("cleanup %s failure after success keeps the exact pending request locked and retryable", async (failure) => {
    const { store, storage } = setup();
    const request = deferred();
    const create = vi.fn<CreateSession>().mockReturnValueOnce(request.promise).mockResolvedValueOnce({ status: "created" });
    const submission = store.getState().submit(create);
    const original = storage.getItem(key);
    if (failure === "read") storage.getItem.mockImplementationOnce(() => { throw new Error("blocked"); });
    else storage.removeItem.mockImplementationOnce(() => { throw new Error("blocked"); });
    request.finish({ status: "created" });
    expect(await submission).toEqual({ status: "failed" });
    expect(store.getState().workflow).toMatchObject({ status: "awaitingConfirmation", pending: JSON.parse(original!) });
    expect(storage.getItem(key)).toBe(original);
    expect(await store.getState().submit(create)).toEqual({ status: "created" });
    expect(create.mock.calls[0]![0]).toEqual(create.mock.calls[1]![0]);
  });

  test("a cleanup failure after a definitive rejection still preserves the unresolved retry", async () => {
    const { store, storage } = setup();
    storage.removeItem.mockImplementationOnce(() => { throw new Error("blocked"); });
    const create = vi.fn<CreateSession>().mockResolvedValue(rejected);
    await store.getState().submit(create);
    const original = storage.getItem(key);
    expect(store.getState().workflow.status).toBe("awaitingConfirmation");
    await store.getState().submit(create);
    expect(store.getState().workflow).toMatchObject({ status: "awaitingConfirmation", failure: rejected });
    expect(storage.getItem(key)).toBe(original);
    expect(create.mock.calls[0]![0]).toEqual(create.mock.calls[1]![0]);
  });

  test.each(["new key", "changed payload", "malformed", "removed"])("success does not delete another storage record: %s", async (replacement) => {
    const { store, storage } = setup();
    const request = deferred();
    const submission = store.getState().submit(() => request.promise);
    const value = replacement === "new key" ? encoded("newer-key")
      : replacement === "changed payload" ? JSON.stringify({ version: 1, payload: submissionPayload({ ...complete, price: "12.00" }, "submission-1") })
        : replacement === "malformed" ? "{broken" : null;
    if (value === null) storage.values.delete(key);
    else storage.values.set(key, value);
    request.finish({ status: "created" });
    expect(await submission).toEqual({ status: "created" });
    expect(storage.getItem(key)).toBe(value);
    expect(storage.removeItem).not.toHaveBeenCalledWith(key);
    expect(store.getState().workflow.status).toBe("completed");
  });

  test("cleanup recognizes the same normalized payload despite JSON property order", async () => {
    const { store, storage } = setup();
    const request = deferred();
    const submission = store.getState().submit(() => request.promise);
    const saved = pendingSubmissionSchema.parse(JSON.parse(storage.getItem(key)!));
    const { booking, config, idempotencyKey } = saved.payload;
    storage.values.set(key, JSON.stringify({ payload: { config, booking, idempotencyKey }, version: 1 }));
    request.finish({ status: "created" });
    expect(await submission).toEqual({ status: "created" });
    expect(storage.getItem(key)).toBeNull();
  });

  test("late completion for one user cannot change another user's state or pending record", async () => {
    const { store: alice, storage } = setup();
    const { store: bob } = setup({ userId: "bob" }, storage);
    const aliceRequest = deferred();
    const bobRequest = deferred();
    const aliceSubmission = alice.getState().submit(() => aliceRequest.promise);
    const bobSubmission = bob.getState().submit(() => bobRequest.promise);
    const bobSaved = storage.getItem(pendingStorageKey("bob"));
    aliceRequest.finish({ status: "created" });
    await aliceSubmission;
    expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem(pendingStorageKey("bob"))).toBe(bobSaved);
    expect(bob.getState().workflow.status).toBe("submitting");
    bobRequest.finish(ambiguous);
    await bobSubmission;
    expect(alice.getState().workflow.status).toBe("completed");
    expect(bob.getState().workflow.status).toBe("awaitingConfirmation");
  });

  test("a caller's throwing completion callback does not undo confirmed completion or resend", async () => {
    const { store, storage } = setup();
    const create = vi.fn<CreateSession>().mockResolvedValue({ status: "created" });
    const onCreated = vi.fn(() => { throw new Error("navigation failed"); });
    const caller = async () => {
      const result = await store.getState().submit(create);
      if (result.status === "created") onCreated();
    };
    await expect(caller()).rejects.toThrow("navigation failed");
    expect(store.getState().workflow).toEqual({ status: "completed" });
    expect(storage.getItem(key)).toBeNull();
    expect(create).toHaveBeenCalledOnce();
    expect(onCreated).toHaveBeenCalledOnce();
    expect(await store.getState().submit(create)).toEqual({ status: "ignored" });
    expect(create).toHaveBeenCalledOnce();
  });
});

describe("Shared editor and explicit draft snapshots", () => {
  test("initializes after mount once and ignores editor actions until restoration finishes", async () => {
    const storage = memoryStorage();
    const getStorage = vi.fn(() => storage);
    const store = createSessionStore({ userId: "alice", getStorage });
    expect(getStorage).not.toHaveBeenCalled();
    expect(store.getState().workflow).toEqual({ status: "initializing" });
    store.getState().change({ venueName: "Ignored" });
    store.getState().changeSchedule({ startDate: "2045-06-17" });
    store.getState().chooseDuration("90");
    store.getState().changeDuration("17");
    store.getState().advance("desktop");
    store.getState().back("desktop");
    store.getState().saveDraft();
    store.getState().restartAfterRecovery();
    const create = vi.fn<CreateSession>();
    expect(await store.getState().submit(create)).toEqual({ status: "ignored" });
    expect(store.getState().draft).toEqual(emptySessionDraft);
    expect(getStorage).not.toHaveBeenCalled();
    const first = store.getState().initialize();
    expect(store.getState().initialize()).toBe(first);
    await first;
    const reads = storage.getItem.mock.calls.length;
    await store.getState().initialize();
    expect(storage.getItem).toHaveBeenCalledTimes(reads);
    expect(store.getState().workflow.status).toBe("editing");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test("desktop validates four screens while mobile combines booked details", () => {
    const { store, storage } = setup({ initialDraft: { ...emptySessionDraft, startDate: complete.startDate, startTime: complete.startTime, endDate: complete.endDate, endTime: complete.endTime }, initialStep: 1 });
    expect(store.getState().advance("desktop")).toBeUndefined();
    expect(creationScreen(store.getState())).toBe("venue");
    expect(store.getState().advance("desktop")).toHaveProperty("venueName");
    expect(creationScreen(store.getState())).toBe("venue");
    store.getState().change(complete);
    store.getState().advance("desktop");
    expect(creationScreen(store.getState())).toBe("settings");
    store.getState().back("mobile");
    expect(creationScreen(store.getState())).toBe("venue");
    store.getState().back("desktop");
    expect(creationScreen(store.getState())).toBe("schedule");
    store.getState().advance("mobile");
    expect(creationScreen(store.getState())).toBe("settings");
    store.getState().advance("desktop");
    expect(creationScreen(store.getState())).toBe("pricing");
    store.getState().advance("desktop");
    expect(creationScreen(store.getState())).toBe("pricing");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test("routes date validation back to schedule, even when a venue screen becomes stale", () => {
    let now = Date.parse("2045-06-16T00:00:00Z");
    const { store } = setup({ initialStep: 1, now: () => now });
    store.getState().advance("desktop");
    now = Date.parse("2045-06-19T00:00:00Z");
    expect(store.getState().advance("desktop")).toHaveProperty("dateTime");
    expect(creationScreen(store.getState())).toBe("schedule");
    expect(store.getState().draft).toEqual(complete);
  });

  test("keeps raw custom duration and dates atomic, including incomplete input and overnight times", () => {
    const { store } = setup({ initialStep: 1 });
    store.getState().chooseDuration("custom");
    store.getState().changeDuration("7.");
    expect(creationDuration(store.getState())).toEqual({ mode: "custom", value: "7." });
    expect(store.getState().draft).toMatchObject({ endDate: "2045-06-17", endTime: "23:07" });
    store.getState().changeDuration("");
    expect(store.getState().draft).toMatchObject({ endDate: "", endTime: "" });
    expect(store.getState().advance("desktop")).toHaveProperty("dateTime");
    store.getState().chooseDuration("120");
    expect(store.getState().draft).toMatchObject({ endDate: "2045-06-18", endTime: "01:00" });
    expect(store.getState().workflow).toMatchObject({ errors: {} });
    store.getState().chooseDuration("custom");
    expect(creationDuration(store.getState())).toEqual({ mode: "custom", value: "120" });
    store.getState().changeSchedule({ startTime: "22:00" });
    expect(store.getState().draft).toMatchObject({ endDate: "2045-06-18", endTime: "00:00" });
    store.getState().change({ startTime: "21:00", endDate: "2045-06-17", endTime: "22:30" });
    expect(creationDuration(store.getState())).toEqual({ mode: "preset", value: "90" });
  });

  test("only explicit Save writes, and step or duration-mode changes make the snapshot dirty", () => {
    const { store, storage } = setup({ initialStep: 1 });
    store.getState().saveDraft();
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(hasUnsavedDraftChanges(store.getState())).toBe(false);
    const original = storage.values.get(savedDraftStorageKey("alice"));
    storage.getItem.mockClear();
    store.getState().advance("desktop");
    expect(hasUnsavedDraftChanges(store.getState())).toBe(true);
    store.getState().back("desktop");
    expect(hasUnsavedDraftChanges(store.getState())).toBe(false);
    store.getState().chooseDuration("custom");
    expect(hasUnsavedDraftChanges(store.getState())).toBe(true);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(original);
    store.getState().saveDraft();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(hasUnsavedDraftChanges(store.getState())).toBe(false);
    expect(store.getState().saveResult).toEqual({ status: "saved" });
  });

  test("failed save keeps the previous acknowledged snapshot and retries the same candidate", () => {
    const { store, storage } = setup();
    store.getState().saveDraft();
    const acknowledged = store.getState().savedSnapshot;
    const original = storage.values.get(savedDraftStorageKey("alice"));
    store.getState().change({ venueName: "Unsaved court" });
    storage.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    store.getState().saveDraft();
    expect(store.getState().saveResult.status).toBe("error");
    expect(store.getState().savedSnapshot).toBe(acknowledged);
    expect(store.getState().draft.venueName).toBe("Unsaved court");
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(original);
    expect(hasUnsavedDraftChanges(store.getState())).toBe(true);
    store.getState().saveDraft();
    expect(store.getState().saveResult.status).toBe("saved");
    expect(hasUnsavedDraftChanges(store.getState())).toBe(false);
  });

  test("restores legacy snapshots independently of viewport without rewriting them", async () => {
    const storage = memoryStorage();
    const original = JSON.stringify({ version: 1, draft: complete, desktopStep: 3 });
    storage.values.set(savedDraftStorageKey("alice"), original);
    const { store } = setup({ initialDraft: undefined, initialStep: undefined }, storage);
    await store.getState().initialize();
    expect(creationScreen(store.getState())).toBe("settings");
    expect(creationDuration(store.getState())).toEqual({ mode: "preset", value: "120" });
    expect(hasUnsavedDraftChanges(store.getState())).toBe(false);
    expect(store.getState().draft).toEqual(complete);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(original);
    store.getState().back("mobile");
    expect(creationScreen(store.getState())).toBe("venue");
  });

  test("explicit initial draft and step override optional saved values", async () => {
    const storage = memoryStorage();
    storage.values.set(savedDraftStorageKey("alice"), JSON.stringify({ version: 1, draft: complete, desktopStep: 4 }));
    const { store } = setup({ initialDraft: emptySessionDraft, initialStep: 1 }, storage);
    await store.getState().initialize();
    expect(store.getState().draft).toEqual(emptySessionDraft);
    expect(creationScreen(store.getState())).toBe("schedule");
    const restored = setup({ initialDraft: undefined, initialStep: 2 }, storage).store;
    await restored.getState().initialize();
    expect(restored.getState().draft).toEqual(complete);
    expect(creationScreen(restored.getState())).toBe("settings");
    expect(hasUnsavedDraftChanges(restored.getState())).toBe(true);
  });

  test.each(["initial", "during hydration"])("pending evidence wins over saved drafts: %s", async (timing) => {
    const storage = memoryStorage(timing === "initial" ? encoded() : undefined);
    storage.values.set(savedDraftStorageKey("alice"), JSON.stringify({ version: 1, draft: emptySessionDraft, desktopStep: 1 }));
    const { store } = setup({ initialDraft: undefined, initialStep: undefined }, storage);
    if (timing === "during hydration") storage.values.set(key, encoded());
    await store.getState().initialize();
    expect(store.getState()).toMatchObject({ draft: complete, workflow: { status: "awaitingConfirmation", pending: pending() } });
    expect(storage.values.get(key)).toBe(encoded());
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test("saved snapshots are isolated across users and malformed optional drafts remain untouched", async () => {
    const storage = memoryStorage();
    storage.values.set(savedDraftStorageKey("alice"), "{broken");
    const alice = setup({ initialDraft: undefined, initialStep: undefined }, storage).store;
    await alice.getState().initialize();
    expect(alice.getState().workflow.status).toBe("editing");
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe("{broken");
    alice.getState().change({ venueName: "Alice court" });
    alice.getState().saveDraft();
    const bob = setup({ userId: "bob", initialDraft: undefined, initialStep: undefined }, storage).store;
    await bob.getState().initialize();
    expect(bob.getState().draft).toEqual(emptySessionDraft);
    expect(bob.getState().savedSnapshot).toBeNull();
  });

  test("optional draft cleanup failure cannot undo confirmed creation", async () => {
    const { store, storage } = setup();
    store.getState().saveDraft();
    storage.removeItem.mockImplementation((name) => {
      if (name === savedDraftStorageKey("alice")) throw new Error("blocked");
      storage.values.delete(name);
    });
    expect(await store.getState().submit(async () => ({ status: "created" }))).toEqual({ status: "created" });
    expect(store.getState().workflow.status).toBe("completed");
    expect(storage.values.has(key)).toBe(false);
  });

  test("late completion cannot delete a newer saved draft after another instance resolves the request", async () => {
    const { store: original, storage } = setup();
    original.getState().saveDraft();
    const request = deferred();
    const submission = original.getState().submit(() => request.promise);
    const retry = setup({}, storage).store;
    expect(retry.getState().workflow.status).toBe("awaitingConfirmation");
    expect(await retry.getState().submit(async () => ({ status: "created" }))).toEqual({ status: "created" });
    const newer = setup({}, storage).store;
    newer.getState().change({ venueName: "Next booking" });
    newer.getState().saveDraft();
    const latestSaved = storage.values.get(savedDraftStorageKey("alice"));
    request.finish({ status: "created" });
    expect(await submission).toEqual({ status: "created" });
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(latestSaved);
    expect(newer.getState().draft.venueName).toBe("Next booking");
  });
});
