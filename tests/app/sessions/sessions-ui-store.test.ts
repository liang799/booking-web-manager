import { describe, expect, expectTypeOf, test } from "vitest";
import { createSessionsUiStore, type SessionsMode } from "@/app/sessions/_components/sessions-ui-store";

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
