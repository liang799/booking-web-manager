import { describe, expect, test, vi } from "vitest";
import { emptySessionDraft, pendingStorageKey, type SessionDraft } from "@/app/sessions/create/model";
import { clearSavedDraft, createSavedDraftStorage, readSavedDraft, savedDraftStorageKey, saveDraft, type SavedSessionDraft } from "@/app/sessions/create/saved-session-draft";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
}

const draft: SessionDraft = {
  ...emptySessionDraft,
  venueName: "Booked court",
  region: "West",
  cost: "60.00",
  price: "7.50",
  startDate: "2045-06-17",
  startTime: "23:00",
  endDate: "2045-06-18",
  endTime: "01:00",
  selectedVenue: {
    venueName: "Booked court", address: "1 Court Road", postalCode: "123456",
    latitude: 1.35, longitude: 103.75, region: "West",
  },
};

describe("Explicitly saved desktop session drafts", () => {
  test("round-trips a selected venue and the desktop step without modifying its source", () => {
    const storage = memoryStorage();
    saveDraft(storage, "alice", draft, 4);
    const restored = readSavedDraft(storage, "alice");
    expect(restored).toEqual({ draft, desktopStep: 4 });
    expect(restored?.draft).not.toBe(draft);
    expect(restored?.draft.selectedVenue).not.toBe(draft.selectedVenue);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  test("retains unfinished values without requiring a submittable booking", () => {
    const storage = memoryStorage();
    const incomplete = {
      ...emptySessionDraft, venueName: "Partially typed", cost: "60.", price: "",
      startDate: "", endTime: "", region: "", totalSlots: 0,
    };
    saveDraft(storage, "alice", incomplete, 2);
    expect(readSavedDraft(storage, "alice")).toEqual({ draft: incomplete, desktopStep: 2 });
  });

  test("retains selected and unfinished custom durations before dates or times have been entered", () => {
    const storage = memoryStorage();
    for (const duration of ["90", "7.", ""]) {
      saveDraft(storage, "alice", emptySessionDraft, 1, duration);
      expect(readSavedDraft(storage, "alice")).toEqual({ draft: emptySessionDraft, desktopStep: 1, duration });
    }
  });

  test("restores existing version-one drafts without inventing duration metadata", () => {
    const storage = memoryStorage();
    storage.values.set(savedDraftStorageKey("alice"), JSON.stringify({ version: 1, draft, desktopStep: 2 }));
    const restored = readSavedDraft(storage, "alice");
    expect(restored).toEqual({ draft, desktopStep: 2 });
    expect(restored).not.toHaveProperty("duration");
  });

  test("restores legacy saved drafts while discarding the retired minimum headcount", () => {
    const storage = memoryStorage();
    const original = JSON.stringify({ version: 1, draft: { ...draft, minimumHeadcount: 4 }, desktopStep: 2 });
    storage.values.set(savedDraftStorageKey("alice"), original);
    expect(readSavedDraft(storage, "alice")).toEqual({ draft, desktopStep: 2 });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(original);
  });

  test("isolates users and never touches pending creation evidence when saving or clearing", () => {
    const storage = memoryStorage();
    const pendingEvidence = '{"version":1,"payload":{"idempotencyKey":"retain-exactly"}}';
    storage.values.set(pendingStorageKey("alice"), pendingEvidence);
    saveDraft(storage, "alice", draft, 3);
    saveDraft(storage, "bob", emptySessionDraft, 1);
    expect(readSavedDraft(storage, "charlie")).toBeUndefined();
    expect(readSavedDraft(storage, "alice")).toEqual({ draft, desktopStep: 3 });
    expect(readSavedDraft(storage, "bob")).toEqual({ draft: emptySessionDraft, desktopStep: 1 });
    clearSavedDraft(storage, "alice");
    expect(readSavedDraft(storage, "alice")).toBeUndefined();
    expect(readSavedDraft(storage, "bob")).toEqual({ draft: emptySessionDraft, desktopStep: 1 });
    expect(storage.values.get(pendingStorageKey("alice"))).toBe(pendingEvidence);
    expect(storage.values.size).toBe(2);
  });

  test.each([
    "not JSON",
    "null",
    "[]",
    JSON.stringify({ version: 2, desktopStep: 1, draft }),
    JSON.stringify({ version: 1, desktopStep: 0, draft }),
    JSON.stringify({ version: 1, desktopStep: 5, draft }),
    JSON.stringify({ version: 1, desktopStep: "2", draft }),
    JSON.stringify({ version: 1, desktopStep: 1, duration: 90, draft }),
    JSON.stringify({ version: 1, desktopStep: 1, durationMode: "unknown", draft }),
    JSON.stringify({ version: 1, desktopStep: 1, draft: {} }),
    JSON.stringify({ version: 1, desktopStep: 1, draft: { ...draft, totalSlots: "8" } }),
    JSON.stringify({ version: 1, desktopStep: 1, draft: { ...draft, visibility: "INVITE" } }),
  ])("ignores corrupt or malformed storage and preserves the original value: %s", (stored) => {
    const storage = memoryStorage();
    storage.values.set(savedDraftStorageKey("alice"), stored);
    expect(readSavedDraft(storage, "alice")).toBeUndefined();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(stored);
  });

  test.each([
    { venueName: "Missing other fields" },
    { ...draft.selectedVenue, latitude: "1.35" },
    { ...draft.selectedVenue, longitude: null },
    { ...draft.selectedVenue, region: "Unrecognized" },
  ])("drops invalid selected-venue metadata while keeping the editable name and region", (selectedVenue) => {
    const storage = memoryStorage();
    storage.values.set(savedDraftStorageKey("alice"), JSON.stringify({ version: 1, desktopStep: 2, draft: { ...draft, selectedVenue } }));
    expect(readSavedDraft(storage, "alice")).toEqual({ draft: { ...draft, selectedVenue: null }, desktopStep: 2 });
  });

  test("restores only known draft fields from untrusted storage", () => {
    const storage = memoryStorage();
    storage.values.set(savedDraftStorageKey("alice"), JSON.stringify({
      version: 1, desktopStep: 2, payload: { idempotencyKey: "not-a-pending-request" },
      draft: { ...draft, workflow: "submitting", selectedVenue: { ...draft.selectedVenue, token: "untrusted" } },
    }));
    expect(readSavedDraft(storage, "alice")).toEqual({ draft, desktopStep: 2 });
  });

  test("treats blocked reads as an unavailable saved draft", () => {
    const storage = memoryStorage();
    storage.getItem.mockImplementation(() => { throw new Error("Storage blocked"); });
    expect(readSavedDraft(storage, "alice")).toBeUndefined();
  });

  test("propagates a failed explicit save so the interface cannot report success", () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => { throw new Error("Quota exceeded"); });
    expect(() => saveDraft(storage, "alice", draft, 1)).toThrow("Quota exceeded");
    expect(storage.values.size).toBe(0);
  });
});

describe("Private Zustand saved-draft persistence", () => {
  test("defers storage access and hydrates legacy version-one drafts without a rewrite", async () => {
    const storage = memoryStorage();
    const original = JSON.stringify({ version: 1, draft, desktopStep: 2 });
    storage.values.set(savedDraftStorageKey("alice"), original);
    const getStorage = vi.fn(() => storage);
    const saved = createSavedDraftStorage({ userId: "alice", getStorage });
    expect(getStorage).not.toHaveBeenCalled();

    expect(await saved.hydrate()).toEqual({ draft, desktopStep: 2 });
    expect(await saved.hydrate()).toEqual({ draft, desktopStep: 2 });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(original);
  });

  test("writes only the explicit snapshot in the compatible flat format", async () => {
    const storage = memoryStorage();
    const saved = createSavedDraftStorage({ userId: "alice", getStorage: () => storage });
    const snapshot: SavedSessionDraft = { draft: { ...draft }, desktopStep: 1, duration: "7.", durationMode: "custom" };
    expect(await saved.hydrate()).toBeUndefined();
    expect(storage.setItem).not.toHaveBeenCalled();

    saved.save(snapshot);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(savedDraftStorageKey("alice"), JSON.stringify({
      version: 1, desktopStep: 1, duration: "7.", durationMode: "custom", draft,
    }));
    snapshot.draft.venueName = "Unsaved edit";
    snapshot.desktopStep = 2;
    snapshot.duration = "90";
    expect(await saved.hydrate()).toEqual({ draft, desktopStep: 1, duration: "7.", durationMode: "custom" });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  test("sanitizes stored snapshots without restoring workflow or pending request state", async () => {
    const storage = memoryStorage();
    const original = JSON.stringify({
      version: 1, desktopStep: 3, duration: "60", durationMode: "preset",
      workflow: { status: "submitting" }, pending: { payload: { idempotencyKey: "not-a-pending-request" } },
      draft: { ...draft, workflow: "submitting", selectedVenue: { ...draft.selectedVenue, token: "untrusted" } },
    });
    storage.values.set(savedDraftStorageKey("alice"), original);
    const saved = createSavedDraftStorage({ userId: "alice", getStorage: () => storage });
    expect(await saved.hydrate()).toEqual({ draft, desktopStep: 3, duration: "60", durationMode: "preset" });
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  test.each(["not JSON", JSON.stringify({ version: 2, draft, desktopStep: 1 }), JSON.stringify({ version: 1, draft: {} })])(
    "ignores malformed snapshots without changing their stored bytes: %s", async (original) => {
      const storage = memoryStorage();
      storage.values.set(savedDraftStorageKey("alice"), original);
      const saved = createSavedDraftStorage({ userId: "alice", getStorage: () => storage });
      expect(await saved.hydrate()).toBeUndefined();
      expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(original);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
    },
  );

  test("propagates a failed save and retries the same snapshot on the next explicit save", async () => {
    const storage = memoryStorage();
    const saved = createSavedDraftStorage({ userId: "alice", getStorage: () => storage });
    saved.save({ draft, desktopStep: 2 });
    const original = storage.values.get(savedDraftStorageKey("alice"));
    const updated: SavedSessionDraft = { draft: { ...draft, venueName: "New venue" }, desktopStep: 4 };
    storage.setItem.mockImplementationOnce(() => { throw new Error("Quota exceeded"); });
    expect(() => saved.save(updated)).toThrow("Quota exceeded");
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(original);

    saved.save(updated);
    expect(storage.setItem).toHaveBeenCalledTimes(3);
    expect(await saved.hydrate()).toEqual(updated);
    expect(storage.setItem).toHaveBeenCalledTimes(3);
  });

  test("treats unavailable reads as optional but propagates save and cleanup failures", async () => {
    const saved = createSavedDraftStorage({
      userId: "alice", getStorage: () => { throw new Error("Session storage blocked"); },
    });
    expect(await saved.hydrate()).toBeUndefined();
    expect(() => saved.save({ draft, desktopStep: 1 })).toThrow("Session storage blocked");
    expect(() => saved.clear()).toThrow("Session storage blocked");
    // A failed in-memory candidate must not become a successful restoration.
    expect(await saved.hydrate()).toBeUndefined();
  });

  test("clears only the current account's saved key without recreating it or touching pending evidence", async () => {
    const storage = memoryStorage();
    const pendingEvidence = '{"version":1,"payload":{"idempotencyKey":"retain-exactly"}}';
    storage.values.set(pendingStorageKey("alice"), pendingEvidence);
    const alice = createSavedDraftStorage({ userId: "alice", getStorage: () => storage });
    const bob = createSavedDraftStorage({ userId: "bob", getStorage: () => storage });
    alice.save({ draft, desktopStep: 4 });
    bob.save({ draft: emptySessionDraft, desktopStep: 1 });
    alice.clear();
    expect(await alice.hydrate()).toBeUndefined();
    expect(await bob.hydrate()).toEqual({ draft: emptySessionDraft, desktopStep: 1 });
    expect(storage.values.get(pendingStorageKey("alice"))).toBe(pendingEvidence);
    expect(storage.values.has(savedDraftStorageKey("alice"))).toBe(false);
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(savedDraftStorageKey("alice"));
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  test("captures cleanup without writing and removes only the unchanged original saved bytes", () => {
    const storage = memoryStorage();
    const saved = createSavedDraftStorage({ userId: "alice", getStorage: () => storage });
    const original = JSON.stringify({ version: 1, desktopStep: 2, draft });
    storage.values.set(savedDraftStorageKey("alice"), original);
    const cleanup = saved.captureCleanup();
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(savedDraftStorageKey("alice"));
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();

    cleanup();
    cleanup();
    expect(storage.values.has(savedDraftStorageKey("alice"))).toBe(false);
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(savedDraftStorageKey("alice"));
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test("a late cleanup preserves a replacement draft from another instance of the same account", () => {
    const storage = memoryStorage();
    const first = createSavedDraftStorage({ userId: "alice", getStorage: () => storage });
    const second = createSavedDraftStorage({ userId: "alice", getStorage: () => storage });
    first.save({ draft, desktopStep: 2 });
    const cleanup = first.captureCleanup();
    second.save({ draft: { ...draft, venueName: "A newer booking" }, desktopStep: 3 });
    const replacement = storage.values.get(savedDraftStorageKey("alice"));
    storage.setItem.mockClear();

    cleanup();
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(replacement);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test("capturing an absent saved draft does not delete one saved later", () => {
    const storage = memoryStorage();
    const saved = createSavedDraftStorage({ userId: "alice", getStorage: () => storage });
    const cleanup = saved.captureCleanup();
    saved.save({ draft, desktopStep: 3 });
    const later = storage.values.get(savedDraftStorageKey("alice"));
    storage.setItem.mockClear();

    cleanup();
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(later);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test("a blocked cleanup capture remains a no-op if storage becomes readable later", () => {
    const storage = memoryStorage();
    const saved = createSavedDraftStorage({ userId: "alice", getStorage: () => storage });
    saved.save({ draft, desktopStep: 3 });
    const original = storage.values.get(savedDraftStorageKey("alice"));
    storage.getItem.mockImplementationOnce(() => { throw new Error("Storage blocked"); });
    const cleanup = saved.captureCleanup();
    storage.getItem.mockClear();
    storage.setItem.mockClear();

    expect(cleanup).not.toThrow();
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(original);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  test("propagates cleanup failures without altering the captured saved draft", () => {
    const storage = memoryStorage();
    const saved = createSavedDraftStorage({ userId: "alice", getStorage: () => storage });
    saved.save({ draft, desktopStep: 3 });
    const original = storage.values.get(savedDraftStorageKey("alice"));
    const cleanup = saved.captureCleanup();
    storage.removeItem.mockImplementationOnce(() => { throw new Error("Removal blocked"); });

    expect(cleanup).toThrow("Removal blocked");
    expect(storage.values.get(savedDraftStorageKey("alice"))).toBe(original);
  });
});
