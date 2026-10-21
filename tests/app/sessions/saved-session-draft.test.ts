import { describe, expect, test, vi } from "vitest";
import { emptySessionDraft, pendingStorageKey, type SessionDraft } from "@/app/sessions/create/model";
import { clearSavedDraft, readSavedDraft, savedDraftStorageKey, saveDraft } from "@/app/sessions/create/saved-session-draft";

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
      startDate: "", endTime: "", region: "", totalSlots: 0, minimumHeadcount: 0,
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
    JSON.stringify({ version: 1, desktopStep: 1, draft: {} }),
    JSON.stringify({ version: 1, desktopStep: 1, draft: { ...draft, totalSlots: "8" } }),
    JSON.stringify({ version: 1, desktopStep: 1, draft: { ...draft, minimumHeadcount: null } }),
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
