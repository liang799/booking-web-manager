import { z } from "zod";
import { createStore } from "zustand/vanilla";
import { persist, type PersistStorage } from "zustand/middleware";
import type { SessionDraft } from "./model";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type DesktopCreationStep = 1 | 2 | 3 | 4;
export interface SavedSessionDraft {
  draft: SessionDraft;
  desktopStep: DesktopCreationStep;
  duration?: string;
  durationMode?: "preset" | "custom";
}

const selectedVenueSchema = z.object({
  venueName: z.string(),
  address: z.string(),
  postalCode: z.string(),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  region: z.enum(["Central", "East", "North", "North-East", "West"]).nullable(),
});

// A saved draft can be unfinished. Submission validation still owns the booking rules.
const savedSessionDraftSchema = z.object({
  version: z.literal(1),
  desktopStep: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  duration: z.string().optional(),
  durationMode: z.enum(["preset", "custom"]).optional(),
  draft: z.object({
    sport: z.string(),
    venueName: z.string(),
    region: z.string(),
    startDate: z.string(),
    startTime: z.string(),
    endDate: z.string(),
    endTime: z.string(),
    cost: z.string(),
    totalSlots: z.number().finite(),
    minimumHeadcount: z.number().finite(),
    visibility: z.enum(["PRIVATE", "PUBLIC"]),
    reliability: z.string(),
    price: z.string(),
    selectedVenue: selectedVenueSchema.nullable().catch(null),
  }),
});
const savedSnapshotSchema = savedSessionDraftSchema.omit({ version: true });
const persistedSnapshotSchema = z.object({ snapshot: savedSnapshotSchema.optional() });

interface SavedSnapshotState {
  snapshot: SavedSessionDraft | undefined;
}

/** Separate from the exact pending request retained for safe creation retries. */
export const savedDraftStorageKey = (userId: string) => `booking:create-session:saved-draft:v1:${userId}`;

export function readSavedDraft(storage: DraftStorage, userId: string): SavedSessionDraft | undefined {
  try {
    const value = storage.getItem(savedDraftStorageKey(userId));
    if (value === null) return undefined;
    const result = savedSessionDraftSchema.safeParse(JSON.parse(value));
    if (!result.success) return undefined;
    return {
      draft: result.data.draft,
      desktopStep: result.data.desktopStep,
      ...(result.data.duration !== undefined && { duration: result.data.duration }),
      ...(result.data.durationMode !== undefined && { durationMode: result.data.durationMode }),
    };
  } catch {
    return undefined;
  }
}

/** Called only by an explicit Save draft action; storage failures remain visible to its caller. */
export function saveDraft(storage: DraftStorage, userId: string, draft: SessionDraft, desktopStep: DesktopCreationStep, duration?: string): void {
  const saved = savedSessionDraftSchema.parse({ version: 1, draft, desktopStep, duration });
  storage.setItem(savedDraftStorageKey(userId), JSON.stringify(saved));
}

export function clearSavedDraft(storage: DraftStorage, userId: string): void {
  storage.removeItem(savedDraftStorageKey(userId));
}

/**
 * Own only explicitly saved snapshots, separately from the live workflow store.
 * Field edits and DevTools state changes cannot write through this private store.
 */
export function createSavedDraftStorage({ userId, getStorage }: {
  userId: string;
  getStorage: () => DraftStorage;
}) {
  const storage: PersistStorage<SavedSnapshotState> = {
    getItem: () => {
      try {
        const snapshot = readSavedDraft(getStorage(), userId);
        return snapshot ? { state: { snapshot }, version: 1 } : null;
      } catch {
        // Optional draft restoration never removes unreadable storage evidence.
        return null;
      }
    },
    setItem: (_name, { state }) => {
      if (!state.snapshot) return;
      // Keep version one's flat on-disk format; hydration needs no migration write.
      const saved = savedSessionDraftSchema.parse({ ...state.snapshot, version: 1 });
      getStorage().setItem(savedDraftStorageKey(userId), JSON.stringify(saved));
    },
    removeItem: () => clearSavedDraft(getStorage(), userId),
  };
  const store = createStore<SavedSnapshotState>()(persist((): SavedSnapshotState => ({ snapshot: undefined }), {
    name: savedDraftStorageKey(userId),
    version: 1,
    storage,
    skipHydration: true,
    partialize: ({ snapshot }) => ({ snapshot }),
    merge: (persisted) => {
      const parsed = persistedSnapshotSchema.safeParse(persisted);
      return { snapshot: parsed.success ? parsed.data.snapshot : undefined };
    },
  }));

  return {
    async hydrate(): Promise<SavedSessionDraft | undefined> {
      await store.persist.rehydrate();
      return store.getState().snapshot;
    },
    save(snapshot: SavedSessionDraft): void {
      // Persist writes after setting state. Only a successful return acknowledges
      // this snapshot; callers must not report a failed write as a saved draft.
      store.setState({ snapshot: savedSnapshotSchema.parse(snapshot) });
    },
    clear(): void {
      store.persist.clearStorage();
    },
    captureCleanup(): () => void {
      try {
        const original = getStorage().getItem(savedDraftStorageKey(userId));
        if (original === null) return () => {};
        return () => {
          const currentStorage = getStorage();
          // A late submission must not remove a newer draft saved by this account.
          if (currentStorage.getItem(savedDraftStorageKey(userId)) === original) {
            clearSavedDraft(currentStorage, userId);
          }
        };
      } catch {
        // Optional draft cleanup cannot prevent a safely persisted submission.
        return () => {};
      }
    },
  };
}
