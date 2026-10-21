import { z } from "zod";
import type { SessionDraft } from "./model";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type DesktopCreationStep = 1 | 2 | 3 | 4;
export interface SavedSessionDraft {
  draft: SessionDraft;
  desktopStep: DesktopCreationStep;
  duration?: string;
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
