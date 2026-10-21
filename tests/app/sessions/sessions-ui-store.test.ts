import { describe, expect, expectTypeOf, test, vi } from "vitest";
import type { PersistStorage } from "zustand/middleware";
import { createSessionsUiStore, type SessionsMode } from "@/app/sessions/_components/sessions-ui-store";
import { createSessionsUrlStorage, type SessionsUrlState } from "@/app/sessions/_components/sessions-url-storage";

const firstSessionId = "54000000-0000-4000-8000-000000000001";
const secondSessionId = "54000000-0000-4000-8000-000000000002";

function urlStore(href = "https://booking.example/sessions") {
  let url = new URL(href);
  const getUrl = vi.fn(() => url);
  const replaceUrl = vi.fn((next: URL) => { url = next; });
  const store = createSessionsUiStore("joined", createSessionsUrlStorage(getUrl, replaceUrl));
  return {
    store, getUrl, replaceUrl, currentUrl: () => url,
    navigate: (href: string) => {
      url = new URL(href);
      return store.persist.rehydrate();
    },
  };
}

describe("Sessions UI modes", () => {
  test("requires a session ID only while viewing a session", () => {
    expectTypeOf<Extract<SessionsMode, { status: "viewingSession" }>>()
      .toEqualTypeOf<{ status: "viewingSession"; sessionId: string }>();
    expectTypeOf<Extract<SessionsMode, { status: "browsing" }>>()
      .toEqualTypeOf<{ status: "browsing" }>();
  });

  test("starts browsing with the requested tab and no remembered selections", () => {
    expect(createSessionsUiStore().getState()).toMatchObject({
      tab: "joined", mode: { status: "browsing" }, activeSessionId: null, detailPanels: {},
    });
    expect(createSessionsUiStore("hosting").getState()).toMatchObject({
      tab: "hosting", mode: { status: "browsing" }, activeSessionId: null, detailPanels: {},
    });
  });

  test("opens from browsing and ignores attempts to replace an already open session", () => {
    const store = createSessionsUiStore();
    store.getState().openSession("first-session");
    const viewing = store.getState();
    expect(viewing.mode).toEqual({ status: "viewingSession", sessionId: "first-session" });

    viewing.openSession("second-session");
    expect(store.getState()).toBe(viewing);
    store.getState().openSession("first-session");
    expect(store.getState()).toBe(viewing);
  });

  test("closing removes the session ID and is a no-op when already browsing", () => {
    const store = createSessionsUiStore();
    const initial = store.getState();
    initial.closeSession();
    expect(store.getState()).toBe(initial);

    store.getState().openSession("first-session");
    store.getState().closeSession();
    const browsing = store.getState();
    expect(browsing.mode).toEqual({ status: "browsing" });
    expect(browsing.mode).not.toHaveProperty("sessionId");
    browsing.closeSession();
    expect(store.getState()).toBe(browsing);

    store.getState().openSession("second-session");
    expect(store.getState().mode).toEqual({ status: "viewingSession", sessionId: "second-session" });
  });

  test("selecting the same tab preserves the open session without changing state", () => {
    const store = createSessionsUiStore("hosting");
    store.getState().openSession("hosted-session");
    const viewing = store.getState();
    viewing.selectTab("hosting");
    expect(store.getState()).toBe(viewing);
    expect(store.getState().mode).toEqual({ status: "viewingSession", sessionId: "hosted-session" });
  });

  test("changing tabs closes the session while preserving timeline and detail-panel memory", () => {
    const store = createSessionsUiStore();
    store.getState().selectTimelineSession("joined-session");
    store.getState().selectDetailPanel("joined-session", "participants");
    store.getState().selectDetailPanel("another-session", "details");
    store.getState().openSession("joined-session");
    const panels = store.getState().detailPanels;

    store.getState().selectTab("hosting");
    expect(store.getState()).toMatchObject({
      tab: "hosting", mode: { status: "browsing" }, activeSessionId: "joined-session",
    });
    expect(store.getState().mode).not.toHaveProperty("sessionId");
    expect(store.getState().detailPanels).toBe(panels);

    store.getState().selectTab("joined");
    expect(store.getState()).toMatchObject({
      tab: "joined", mode: { status: "browsing" }, activeSessionId: "joined-session",
      detailPanels: { "joined-session": "participants", "another-session": "details" },
    });
  });

  test("keeps independent page or account instances isolated", () => {
    const first = createSessionsUiStore();
    const second = createSessionsUiStore("hosting");
    const untouchedSecond = second.getState();
    first.getState().selectTimelineSession("shared-session");
    first.getState().selectDetailPanel("shared-session", "participants");
    first.getState().openSession("shared-session");
    expect(second.getState()).toBe(untouchedSecond);
    expect(second.getState()).toMatchObject({
      tab: "hosting", mode: { status: "browsing" }, activeSessionId: null, detailPanels: {},
    });

    second.getState().selectDetailPanel("shared-session", "details");
    second.getState().openSession("other-session");
    expect(first.getState()).toMatchObject({
      tab: "joined", mode: { status: "viewingSession", sessionId: "shared-session" },
      activeSessionId: "shared-session", detailPanels: { "shared-session": "participants" },
    });
  });
});

describe("Sessions UI URL persistence", () => {
  test("defers URL access until hydration and restores a timeline card without opening a dialog", async () => {
    const { store, getUrl, replaceUrl } = urlStore(`https://booking.example/sessions?session=${firstSessionId}&panel=participants`);
    expect(getUrl).not.toHaveBeenCalled();
    expect(store.persist.hasHydrated()).toBe(false);
    expect(store.getState()).toMatchObject({ activeSessionId: null, scrollTargetId: null, mode: { status: "browsing" } });

    await store.persist.rehydrate();
    expect(store.persist.hasHydrated()).toBe(true);
    expect(store.getState()).toMatchObject({
      tab: "joined", activeSessionId: firstSessionId, scrollTargetId: firstSessionId,
      detailPanels: { [firstSessionId]: "participants" }, mode: { status: "browsing" },
    });
    expect(replaceUrl).not.toHaveBeenCalled();
  });

  test("persists only the tab, current timeline ID, and its panel in the version-one envelope", () => {
    const storage: PersistStorage<SessionsUrlState> = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
    const store = createSessionsUiStore("joined", storage);
    store.getState().selectTimelineSession(firstSessionId);
    store.getState().selectDetailPanel(firstSessionId, "participants");
    store.getState().selectDetailPanel(secondSessionId, "details");
    store.getState().openSession(secondSessionId);
    expect(storage.setItem).toHaveBeenLastCalledWith("sessions-overview", {
      version: 1, state: { tab: "joined", activeSessionId: firstSessionId, panel: "participants" },
    });
  });

  test("an external URL selection closes a dialog, preserves other panel memory, and requests one scroll", async () => {
    const { store, navigate } = urlStore();
    store.getState().selectTimelineSession(firstSessionId);
    store.getState().selectDetailPanel(firstSessionId, "participants");
    store.getState().openSession(firstSessionId);

    await navigate(`https://booking.example/sessions?session=${secondSessionId}&panel=participants`);
    expect(store.getState()).toMatchObject({
      activeSessionId: secondSessionId, scrollTargetId: secondSessionId, mode: { status: "browsing" },
      detailPanels: { [firstSessionId]: "participants", [secondSessionId]: "participants" },
    });

    store.getState().finishUrlRestoration();
    expect(store.getState().scrollTargetId).toBeNull();
    expect(store.getState().activeSessionId).toBe(secondSessionId);
    const restored = store.getState();
    store.getState().finishUrlRestoration();
    expect(store.getState()).toBe(restored);
  });

  test("an external panel-only change restores that panel and closes the transient dialog", async () => {
    const { store, navigate } = urlStore();
    store.getState().selectTimelineSession(firstSessionId);
    store.getState().openSession(firstSessionId);
    await navigate(`https://booking.example/sessions?session=${firstSessionId}&panel=participants`);
    expect(store.getState()).toMatchObject({
      activeSessionId: firstSessionId, scrollTargetId: firstSessionId,
      detailPanels: { [firstSessionId]: "participants" }, mode: { status: "browsing" },
    });
  });

  test("a store-originated URL echo preserves an open dialog and does not replay scrolling", async () => {
    const { store, replaceUrl } = urlStore();
    store.getState().selectTimelineSession(firstSessionId);
    store.getState().selectDetailPanel(firstSessionId, "participants");
    store.getState().openSession(secondSessionId);
    const beforeEcho = store.getState();
    replaceUrl.mockClear();

    await store.persist.rehydrate();
    expect(store.getState()).toBe(beforeEcho);
    expect(store.getState().mode).toEqual({ status: "viewingSession", sessionId: secondSessionId });
    expect(store.getState().scrollTargetId).toBeNull();
    expect(replaceUrl).not.toHaveBeenCalled();
  });

  test("transient dialog and restoration actions do not replace the URL", async () => {
    const { store, replaceUrl, currentUrl } = urlStore(`https://booking.example/sessions?session=${firstSessionId}&panel=participants#upcoming`);
    await store.persist.rehydrate();
    const href = currentUrl().href;
    store.getState().finishUrlRestoration();
    store.getState().openSession(secondSessionId);
    store.getState().selectDetailPanel(secondSessionId, "participants");
    store.getState().closeSession();
    store.getState().closeSession();
    expect(replaceUrl).not.toHaveBeenCalled();
    expect(currentUrl().href).toBe(href);
  });

  test("the first implicit card becomes shareable on panel interaction, but a dialog does not select a card", () => {
    const timeline = urlStore();
    timeline.store.getState().selectDetailPanel(firstSessionId, "participants");
    expect(timeline.store.getState().activeSessionId).toBe(firstSessionId);
    expect(timeline.currentUrl().searchParams.get("session")).toBe(firstSessionId);
    expect(timeline.currentUrl().searchParams.get("panel")).toBe("participants");

    const dialog = urlStore();
    dialog.store.getState().openSession(firstSessionId);
    dialog.store.getState().selectDetailPanel(firstSessionId, "participants");
    expect(dialog.store.getState().activeSessionId).toBeNull();
    expect(dialog.store.getState().detailPanels[firstSessionId]).toBe("participants");
    expect(dialog.replaceUrl).not.toHaveBeenCalled();
  });

  test("Hosting omits Joined fields from the URL while retaining them for a return to Joined", async () => {
    const { store, replaceUrl, currentUrl } = urlStore();
    store.getState().selectTimelineSession(firstSessionId);
    store.getState().selectDetailPanel(firstSessionId, "participants");
    store.getState().selectTab("hosting");
    expect(currentUrl().search).toBe("?tab=hosting");
    expect(store.getState()).toMatchObject({ activeSessionId: firstSessionId, detailPanels: { [firstSessionId]: "participants" } });

    store.getState().openSession(secondSessionId);
    replaceUrl.mockClear();
    await store.persist.rehydrate();
    expect(store.getState().mode).toEqual({ status: "viewingSession", sessionId: secondSessionId });
    expect(replaceUrl).not.toHaveBeenCalled();

    store.getState().selectTab("joined");
    expect(currentUrl().searchParams.get("session")).toBe(firstSessionId);
    expect(currentUrl().searchParams.get("panel")).toBe("participants");
    expect(store.getState().mode).toEqual({ status: "browsing" });
  });

  test("an unavailable target clears the URL selection and restoration intent without deleting panel memory", async () => {
    const { store, currentUrl } = urlStore(`https://booking.example/sessions?session=${firstSessionId}&panel=participants&source=calendar#upcoming`);
    await store.persist.rehydrate();
    store.getState().clearTimelineSession();
    expect(store.getState()).toMatchObject({
      activeSessionId: null, scrollTargetId: null, detailPanels: { [firstSessionId]: "participants" },
    });
    expect(currentUrl().searchParams.has("session")).toBe(false);
    expect(currentUrl().searchParams.has("panel")).toBe(false);
    expect(currentUrl().searchParams.get("source")).toBe("calendar");
    expect(currentUrl().hash).toBe("#upcoming");
  });

  test("validated hydration cannot inject modes, actions, or unrelated panel memory", async () => {
    const stored = {
      tab: "joined" as const, activeSessionId: firstSessionId, panel: "participants" as const,
      mode: { status: "viewingSession", sessionId: secondSessionId },
      scrollTargetId: secondSessionId,
      detailPanels: { [secondSessionId]: "participants" },
      openSession: "injected action",
    };
    const store = createSessionsUiStore("joined", {
      getItem: () => ({ state: stored, version: 1 }), setItem: () => {}, removeItem: () => {},
    });
    await store.persist.rehydrate();
    expect(store.getState()).toMatchObject({
      mode: { status: "browsing" }, activeSessionId: firstSessionId, scrollTargetId: firstSessionId,
      detailPanels: { [firstSessionId]: "participants" },
    });
    expect(store.getState().detailPanels).not.toHaveProperty(secondSessionId);
    store.getState().openSession(firstSessionId);
    expect(store.getState().mode).toEqual({ status: "viewingSession", sessionId: firstSessionId });
  });

  test("invalid persisted data leaves live selections and dialog mode intact", async () => {
    const store = createSessionsUiStore("joined", {
      // @ts-expect-error Storage can contain malformed data despite its compile-time contract.
      getItem: () => ({ state: { tab: "invalid", activeSessionId: firstSessionId, panel: "participants" }, version: 1 }),
      setItem: () => {}, removeItem: () => {},
    });
    store.getState().selectTimelineSession(secondSessionId);
    store.getState().openSession(secondSessionId);
    const beforeHydration = store.getState();
    await store.persist.rehydrate();
    expect(store.getState()).toBe(beforeHydration);
  });
});
