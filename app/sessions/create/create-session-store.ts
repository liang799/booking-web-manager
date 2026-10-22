import { createStore } from "zustand/vanilla";
import type { NamedSet } from "zustand/middleware";
import {
  draftFromSubmission, emptySessionDraft, pendingStorageKey, pendingSubmissionSchema,
  bookingDates, durationMinutes, submissionPayload, updateDraft, validateDates, validateStep,
  type FieldErrors, type PendingSubmission, type SessionDraft,
} from "./model";
import type { CreateSession, CreationOutcome } from "./transport";
import { createSavedDraftStorage, type SavedSessionDraft } from "./saved-session-draft";

export type CreationFailure = Extract<CreationOutcome, { status: "error" }>;
export type CreationStep = 1 | 2 | 3;
export type CreationScreen = "schedule" | "venue" | "settings" | "pricing";
export type CreationPresentation = "desktop" | "mobile";
export type PresetDuration = "30" | "60" | "90" | "120" | "180";
export type DurationInput =
  | { mode: "preset"; value: PresetDuration }
  | { mode: "custom"; value: string };
export interface CreationEditor { screen: CreationScreen; duration: DurationInput }
export type DraftSaveResult = { status: "idle" } | { status: "saved" } | { status: "error"; message: string };
export type CreationWorkflow =
  | { status: "initializing" }
  | { status: "editing"; editor: CreationEditor; errors: FieldErrors; failure: CreationFailure | null }
  | { status: "submitting"; pending: PendingSubmission; replaying: boolean }
  | { status: "awaitingConfirmation"; pending: PendingSubmission; failure: CreationFailure }
  | { status: "recoveryRequired"; failure: CreationFailure }
  | { status: "completed" };

export interface CreateSessionState {
  draft: SessionDraft;
  workflow: CreationWorkflow;
  savedSnapshot: SavedSessionDraft | null;
  saveResult: DraftSaveResult;
}
export type SubmissionResult =
  | { status: "created" | "ignored" | "failed" }
  | { status: "invalid"; errors: FieldErrors };
export interface CreateSessionActions {
  initialize(): Promise<void>;
  change(patch: Partial<SessionDraft>): void;
  changeSchedule(patch: Partial<Pick<SessionDraft, "startDate" | "startTime">>): void;
  chooseDuration(value: PresetDuration | "custom"): void;
  changeDuration(value: string): void;
  advance(presentation?: CreationPresentation): FieldErrors | undefined;
  back(presentation?: CreationPresentation): void;
  saveDraft(): void;
  restartAfterRecovery(): void;
  submit(create: CreateSession): Promise<SubmissionResult>;
}
export type CreateSessionStoreState = CreateSessionState & CreateSessionActions;
export type PendingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface CreateSessionStoreOptions {
  userId: string;
  initialDraft?: SessionDraft;
  initialStep?: CreationStep;
  getStorage: () => PendingStorage;
  now?: () => number;
  newId?: () => string;
}

const recoveryFailure: CreationFailure = {
  status: "error", code: "PENDING_RECOVERY_FAILED", ambiguous: true,
  message: "We couldn't read your pending submission. It may already have created a session. Check your hosted sessions before starting again.",
};
const unknownResult: CreationFailure = {
  status: "error", code: "UNKNOWN_RESULT", ambiguous: true,
  message: "We couldn't confirm the result. Retry this submission to check safely.",
};
const awaitingFailure: CreationFailure = {
  status: "error", code: "PENDING_SUBMISSION", ambiguous: true,
  message: "A submission is awaiting confirmation. Retry it to safely recover the result.",
};

const screens = ["schedule", "venue", "settings", "pricing"] as const;
const presets: readonly string[] = ["30", "60", "90", "120", "180"];
function durationInput(value: string, mode?: "preset" | "custom"): DurationInput {
  if (mode !== "custom" && presets.includes(value)) return { mode: "preset", value: value as PresetDuration };
  return { mode: "custom", value };
}
function durationFromDraft(draft: SessionDraft): DurationInput {
  return durationInput(String(durationMinutes(draft) ?? 60));
}
export function creationScreen(state: CreateSessionState): CreationScreen {
  return state.workflow.status === "editing" ? state.workflow.editor.screen
    : state.workflow.status === "initializing" ? "schedule" : "pricing";
}
export function creationDuration(state: CreateSessionState): DurationInput {
  return state.workflow.status === "editing" ? state.workflow.editor.duration : durationFromDraft(state.draft);
}
function editableSnapshot(state: CreateSessionState): SavedSessionDraft {
  const duration = creationDuration(state);
  return { draft: state.draft, desktopStep: (screens.indexOf(creationScreen(state)) + 1) as SavedSessionDraft["desktopStep"], duration: duration.value, durationMode: duration.mode };
}
export function hasUnsavedDraftChanges(state: CreateSessionState): boolean {
  return state.savedSnapshot !== null && JSON.stringify(editableSnapshot(state)) !== JSON.stringify(state.savedSnapshot);
}
function editing(editor: CreationEditor, errors: FieldErrors = {}, failure: CreationFailure | null = null): CreationWorkflow {
  return { status: "editing", editor, errors, failure };
}
function errorScreen(step: CreationStep, errors: FieldErrors): CreationScreen {
  return step === 1 ? errors.dateTime ? "schedule" : "venue" : step === 2 ? "settings" : "pricing";
}

function parsePending(value: string): PendingSubmission | undefined {
  try {
    const result = pendingSubmissionSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : undefined;
  } catch { return undefined; }
}

/** A separate store per mounted wizard keeps drafts and requests scoped to its user. */
export function createSessionStore({
  userId, initialDraft, initialStep, getStorage,
  now = Date.now, newId = () => crypto.randomUUID(),
}: CreateSessionStoreOptions) {
  const key = pendingStorageKey(userId);
  const savedDrafts = createSavedDraftStorage({ userId, getStorage });
  const initialScreen: CreationScreen = initialStep === 3 ? "pricing" : initialStep === 2 ? "settings" : "schedule";
  const freshState = (): CreateSessionState => ({
    draft: { ...(initialDraft ?? emptySessionDraft) },
    workflow: editing({ screen: initialScreen, duration: durationFromDraft(initialDraft ?? emptySessionDraft) }),
    savedSnapshot: null, saveResult: { status: "idle" },
  });
  const restore = (value: string, fallback: CreateSessionState): CreateSessionState => {
    const pending = parsePending(value);
    try {
      if (pending) return {
        ...fallback, draft: draftFromSubmission(pending.payload),
        workflow: { status: "awaitingConfirmation", pending, failure: awaitingFailure },
      };
    } catch { /* An unreadable draft must retain its original storage evidence. */ }
    return { ...fallback, workflow: { status: "recoveryRequired", failure: recoveryFailure } };
  };
  let initialization: Promise<void> | undefined;

  // Another instance may have replaced this user's slot while the request was in flight.
  const clearPending = (pending: PendingSubmission) => {
    const storage = getStorage();
    const value = storage.getItem(key);
    const current = value === null ? undefined : parsePending(value);
    if (current && JSON.stringify(current) === JSON.stringify(pending)) storage.removeItem(key);
  };

  return createStore<CreateSessionStoreState>()((_set, get, api) => {
    // Read the current setter so mounted DevTools instrumentation can attach/detach.
    const transition = (state: CreateSessionState, action: string) => {
      const set: NamedSet<CreateSessionStoreState> = api.setState;
      set(state, undefined, action);
    };
    const snapshot = (): CreateSessionState => {
      const { draft, workflow, savedSnapshot, saveResult } = get();
      return { draft, workflow, savedSnapshot, saveResult };
    };
    const updateSchedule = (patch: Partial<Pick<SessionDraft, "startDate" | "startTime">>, duration: DurationInput, action: string) => {
      const current = snapshot();
      if (current.workflow.status !== "editing") return;
      const dates = bookingDates(patch.startDate ?? current.draft.startDate, patch.startTime ?? current.draft.startTime, duration.value);
      const draft = updateDraft(current.draft, { ...patch, ...(dates ?? { endDate: "", endTime: "" }) });
      transition({ ...current, draft, workflow: editing({ ...current.workflow.editor, duration }) }, action);
    };
    return {
      ...freshState(), workflow: { status: "initializing" },
      initialize() {
        if (initialization) return initialization;
        if (get().workflow.status !== "initializing") return Promise.resolve();
        initialization = (async () => {
          const initial = freshState();
          try {
            const value = getStorage().getItem(key);
            if (value !== null) { transition(restore(value, initial), "session/pendingRestored"); return; }
          } catch {
            transition({ ...initial, workflow: { status: "recoveryRequired", failure: recoveryFailure } }, "session/storageReadFailed");
            return;
          }
          const saved = initialDraft === undefined ? await savedDrafts.hydrate() : undefined;
          if (get().workflow.status !== "initializing") return;
          if (initialDraft === undefined) {
            // Another mounted instance can submit while optional hydration yields.
            try {
              const value = getStorage().getItem(key);
              if (value !== null) { transition(restore(value, initial), "session/pendingRestored"); return; }
            } catch {
              transition({ ...initial, workflow: { status: "recoveryRequired", failure: recoveryFailure } }, "session/storageReadFailed");
              return;
            }
          }
          if (!saved) { transition(initial, "session/initialized"); return; }
          const duration = durationInput(saved.duration ?? String(durationMinutes(saved.draft) ?? 60), saved.durationMode);
          const restored: CreateSessionState = {
            ...initial, draft: saved.draft,
            workflow: editing({ screen: initialStep === undefined ? screens[saved.desktopStep - 1]! : initialScreen, duration }),
            saveResult: { status: "saved" },
          };
          // Normalize legacy metadata so an unchanged restored draft is acknowledged as saved.
          restored.savedSnapshot = { draft: saved.draft, desktopStep: saved.desktopStep, duration: duration.value, durationMode: duration.mode };
          transition(restored, "session/draftRestored");
        })();
        return initialization;
      },
      change(patch) {
        const current = snapshot();
        if (current.workflow.status !== "editing") return;
        const draft = updateDraft(current.draft, patch);
        const datesChanged = ["startDate", "startTime", "endDate", "endTime"].some((field) => field in patch);
        const duration = datesChanged && durationMinutes(draft) !== undefined ? durationFromDraft(draft) : current.workflow.editor.duration;
        transition({ ...current, draft, workflow: editing({ ...current.workflow.editor, duration }) }, "session/change");
      },
      changeSchedule(patch) {
        const current = get();
        if (current.workflow.status === "editing") updateSchedule(patch, current.workflow.editor.duration, "session/scheduleChanged");
      },
      chooseDuration(value) {
        const current = snapshot();
        if (current.workflow.status !== "editing") return;
        if (value === "custom") {
          transition({ ...current, workflow: editing({ ...current.workflow.editor, duration: { mode: "custom", value: current.workflow.editor.duration.value } }) }, "session/durationModeChanged");
        } else updateSchedule({}, { mode: "preset", value }, "session/durationChanged");
      },
      changeDuration(value) { updateSchedule({}, { mode: "custom", value }, "session/durationChanged"); },
      advance(presentation = "mobile") {
        const current = snapshot();
        if (current.workflow.status !== "editing" || current.workflow.editor.screen === "pricing") return;
        const { editor } = current.workflow;
        const step = editor.screen === "settings" ? 2 : 1;
        const errors = presentation === "desktop" && editor.screen === "schedule" ? validateDates(current.draft, now()) : validateStep(current.draft, step, now());
        if (Object.keys(errors).length) {
          transition({ ...current, workflow: editing({ ...editor, screen: errorScreen(step, errors) }, errors) }, "session/stepInvalid");
          return errors;
        }
        const screen = editor.screen === "settings" ? "pricing" : presentation === "desktop" && editor.screen === "schedule" ? "venue" : "settings";
        transition({ ...current, workflow: editing({ ...editor, screen }) }, "session/next");
      },
      back(presentation = "mobile") {
        const current = snapshot();
        if (current.workflow.status !== "editing") return;
        const { editor } = current.workflow;
        if (editor.screen === "schedule" || (presentation === "mobile" && editor.screen === "venue")) return;
        const screen = editor.screen === "pricing" ? "settings" : editor.screen === "settings" ? "venue" : "schedule";
        transition({ ...current, workflow: editing({ ...editor, screen }) }, "session/back");
      },
      saveDraft() {
        const current = snapshot();
        if (current.workflow.status !== "editing") return;
        try {
          const savedSnapshot = editableSnapshot(current);
          savedDrafts.save(savedSnapshot);
          transition({ ...current, savedSnapshot, saveResult: { status: "saved" } }, "session/draftSaved");
        } catch {
          transition({ ...current, saveResult: { status: "error", message: "Couldn't save your draft. Enable session storage or free up space, then try again." } }, "session/draftSaveFailed");
        }
      },
      restartAfterRecovery() {
        const current = snapshot();
        if (current.workflow.status !== "recoveryRequired") return;
        try {
          const storage = getStorage();
          const original = storage.getItem(key);
          if (original !== null) {
            // A newly readable pending request must be retried, not discarded as corrupt.
            const recovered = restore(original, current);
            if (recovered.workflow.status === "awaitingConfirmation") { transition(recovered, "session/recoveryRestored"); return; }
            storage.setItem(`${key}:unresolved:${newId()}`, original);
            const latest = storage.getItem(key);
            if (latest !== original) {
              transition(latest === null ? freshState() : restore(latest, current), "session/recoveryReconciled");
              return;
            }
            storage.removeItem(key);
          }
          transition(freshState(), "session/recoveryRestarted");
        } catch {
          transition({ ...current, workflow: { status: "recoveryRequired", failure: {
            status: "error", code: "PENDING_RECOVERY_FAILED", ambiguous: true,
            message: "We couldn't preserve your pending submission. Enable session storage or free up storage space, then try starting again.",
          } } }, "session/recoveryFailed");
        }
      },
      async submit(create) {
        const current = snapshot();
        if (current.workflow.status !== "editing" && current.workflow.status !== "awaitingConfirmation") return { status: "ignored" };
        const replaying = current.workflow.status === "awaitingConfirmation";
        let pending: PendingSubmission;
        if (current.workflow.status === "awaitingConfirmation") {
          pending = current.workflow.pending;
        } else {
          const instant = now();
          for (const step of [1, 2, 3] as const) {
            const errors = validateStep(current.draft, step, instant);
            if (Object.keys(errors).length) {
              transition({ ...current, workflow: editing({ ...current.workflow.editor, screen: errorScreen(step, errors) }, errors) }, "session/submitInvalid");
              return { status: "invalid", errors };
            }
          }
          let storage: PendingStorage;
          try {
            storage = getStorage();
            const existing = storage.getItem(key);
            if (existing !== null) {
              const recovered = restore(existing, current);
              transition(recovered, "session/pendingDiscovered");
              return { status: recovered.workflow.status === "awaitingConfirmation" ? "ignored" : "failed" };
            }
          } catch {
            transition({ ...current, workflow: { status: "recoveryRequired", failure: recoveryFailure } }, "session/storageReadFailed");
            return { status: "failed" };
          }
          pending = { version: 1, payload: submissionPayload(current.draft, newId()) };
          try { storage.setItem(key, JSON.stringify(pending)); } catch {
            transition({ ...current, workflow: editing(current.workflow.editor, {}, {
              status: "error", code: "STORAGE_UNAVAILABLE", ambiguous: false,
              message: "Enable session storage so your submission can be retried safely.",
            }) }, "session/storageWriteFailed");
            return { status: "failed" };
          }
        }

        const clearSavedAfterSuccess = savedDrafts.captureCleanup();
        const submitted = { ...current };
        transition({ ...submitted, workflow: { status: "submitting", pending, replaying } }, replaying ? "session/retryStarted" : "session/submitStarted");
        try {
          const result = await create(pending.payload);
          if (result.status === "created") {
            clearPending(pending);
            try { clearSavedAfterSuccess(); } catch { /* A confirmed creation stays confirmed if optional draft cleanup fails. */ }
            transition({ ...submitted, savedSnapshot: null, saveResult: { status: "idle" }, workflow: { status: "completed" } }, "session/submitSucceeded");
            return { status: "created" };
          }
          if (!result.ambiguous && !replaying) {
            clearPending(pending);
            const duration = creationDuration(current);
            transition({ ...submitted, workflow: editing({ screen: "pricing", duration }, {}, result) }, "session/submitRejected");
          } else {
            transition({ ...submitted, workflow: { status: "awaitingConfirmation", pending, failure: result } }, "session/confirmationRequired");
          }
        } catch {
          transition({ ...submitted, workflow: { status: "awaitingConfirmation", pending, failure: unknownResult } }, "session/submitUnconfirmed");
        }
        return { status: "failed" };
      },
    };
  });
}
