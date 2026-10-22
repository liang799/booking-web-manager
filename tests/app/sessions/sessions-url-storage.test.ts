import { describe, expect, test, vi } from "vitest";
import { createSessionsUrlStorage, readSessionsUrlState, sessionsUrlStateSchema, type SessionsUrlState } from "@/app/sessions/_components/sessions-url-storage";

const sessionId = "54000000-0000-4000-8000-000000000001";
const otherSessionId = "54000000-0000-4000-8000-000000000002";
const joined: SessionsUrlState = { tab: "joined", activeSessionId: null, panel: "details" };
const selected: SessionsUrlState = { tab: "joined", activeSessionId: sessionId, panel: "participants" };
const hosting: SessionsUrlState = { tab: "hosting", activeSessionId: null, panel: "details" };

function harness(href = "https://booking.example/sessions") {
  let url = new URL(href);
  const replaceUrl = vi.fn((next: URL) => { url = next; });
  return { storage: createSessionsUrlStorage(() => url, replaceUrl), replaceUrl, currentUrl: () => url };
}

describe("Sessions URL state", () => {
  test.each([
    ["", joined],
    ["tab=joined", joined],
    ["tab=hosting", hosting],
    ["tab=unexpected", joined],
    ["tab=joined&created=1", hosting],
    ["tab=unexpected&created=1", hosting],
    ["created=true", joined],
    ["session=not-a-uuid&panel=participants", joined],
    ["panel=participants", joined],
    [`session=${sessionId}&panel=unexpected`, { ...selected, panel: "details" }],
    [`session=${sessionId}&panel=participants`, selected],
    [`tab=hosting&session=${sessionId}&panel=participants`, hosting],
    [`created=1&session=${sessionId}&panel=participants`, hosting],
  ])("safely decodes %s", (query, expected) => {
    expect(readSessionsUrlState(new URLSearchParams(query))).toEqual(expected);
  });

  test("normalizes valid UUID casing", () => {
    const uppercase = "ABCDEFAB-0000-4000-8000-ABCDEFABCDEF";
    expect(readSessionsUrlState(new URLSearchParams({ session: uppercase })).activeSessionId).toBe(uppercase.toLowerCase());
  });

  test.each([
    { ...joined, tab: "unknown" },
    { ...selected, activeSessionId: "not-a-uuid" },
    { ...selected, panel: "unknown" },
    { ...hosting, activeSessionId: sessionId },
    { ...hosting, panel: "participants" },
    { ...joined, panel: "participants" },
    null,
    "serialized-json-is-not-url-state",
  ])("rejects invalid persisted state %#", (value) => {
    expect(sessionsUrlStateSchema.safeParse(value).success).toBe(false);
  });
});

describe("Sessions URL persist storage", () => {
  test("round-trips readable fields in the version-one persist envelope", () => {
    const { storage, currentUrl } = harness();
    storage.setItem("sessions-ui", { state: selected, version: 1 });
    expect(currentUrl().search).toBe(`?tab=joined&session=${sessionId}&panel=participants`);
    expect(storage.getItem("sessions-ui")).toEqual({ state: selected, version: 1 });

    storage.setItem("sessions-ui", { state: { ...selected, panel: "details" }, version: 1 });
    expect(currentUrl().searchParams.has("panel")).toBe(false);
    expect(storage.getItem("sessions-ui")).toEqual({ state: { ...selected, panel: "details" }, version: 1 });
  });

  test("preserves unrelated query values, duplicates, path, origin and hash", () => {
    const { storage, currentUrl } = harness("https://booking.example/sessions?filter=nearby&filter=tennis&returnTo=%2Fwallet#history");
    storage.setItem("sessions-ui", { state: selected, version: 1 });
    expect(currentUrl().origin).toBe("https://booking.example");
    expect(currentUrl().pathname).toBe("/sessions");
    expect(currentUrl().hash).toBe("#history");
    expect(currentUrl().searchParams.getAll("filter")).toEqual(["nearby", "tennis"]);
    expect(currentUrl().searchParams.get("returnTo")).toBe("/wallet");
  });

  test.each([
    ["https://booking.example/sessions", joined],
    ["https://booking.example/sessions?tab=unexpected", joined],
    ["https://booking.example/sessions?created=1", hosting],
    [`https://booking.example/sessions?created=1&tab=joined&session=${sessionId}&panel=participants#notice`, hosting],
    [`https://booking.example/sessions?session=${sessionId}&panel=details`, { ...selected, panel: "details" }],
  ] as const satisfies readonly (readonly [string, SessionsUrlState])[])("does not rewrite an equivalent URL: %s", (href, state) => {
    const { storage, replaceUrl, currentUrl } = harness(href);
    storage.setItem("sessions-ui", { state, version: 1 });
    storage.setItem("sessions-ui", { state, version: 1 });
    expect(replaceUrl).not.toHaveBeenCalled();
    expect(currentUrl().href).toBe(href);
  });

  test("leaving the creation handoff changes the tab and removes only its success flag", () => {
    const { storage, currentUrl } = harness("https://booking.example/sessions?created=1&source=create#notice");
    expect(storage.getItem("sessions-ui")).toEqual({ state: hosting, version: 1 });
    storage.setItem("sessions-ui", { state: selected, version: 1 });
    expect(currentUrl().searchParams.has("created")).toBe(false);
    expect(currentUrl().searchParams.get("source")).toBe("create");
    expect(currentUrl().hash).toBe("#notice");
    expect(storage.getItem("sessions-ui")).toEqual({ state: selected, version: 1 });
  });

  test("a timeline change keeps unrelated creation values while Hosting clears timeline fields", () => {
    const { storage, currentUrl } = harness(`https://booking.example/sessions?tab=joined&session=${sessionId}&panel=participants&created=0`);
    storage.setItem("sessions-ui", { state: { ...selected, activeSessionId: otherSessionId }, version: 1 });
    expect(currentUrl().searchParams.get("created")).toBe("0");
    storage.setItem("sessions-ui", { state: hosting, version: 1 });
    expect(currentUrl().searchParams.has("session")).toBe(false);
    expect(currentUrl().searchParams.has("panel")).toBe(false);
    expect(currentUrl().searchParams.has("created")).toBe(false);
    expect(storage.getItem("sessions-ui")).toEqual({ state: hosting, version: 1 });
  });

  test("clearing storage removes only owned keys and keeps the legacy creation handoff", () => {
    const { storage, replaceUrl, currentUrl } = harness(`https://booking.example/sessions?tab=joined&session=${sessionId}&panel=participants&created=1&source=calendar#history`);
    storage.removeItem("sessions-ui");
    expect(currentUrl().search).toBe("?created=1&source=calendar");
    expect(currentUrl().hash).toBe("#history");
    expect(storage.getItem("sessions-ui")).toEqual({ state: hosting, version: 1 });
    storage.removeItem("sessions-ui");
    expect(replaceUrl).toHaveBeenCalledOnce();
  });

  test("ignores malformed serialized payloads without touching the URL", () => {
    const { storage, replaceUrl, currentUrl } = harness("https://booking.example/sessions?source=calendar#history");
    const invalidState = { ...selected, tab: "invalid" };
    // Exercise the runtime boundary with the shape an invalid storage writer supplies.
    // @ts-expect-error An invalid tab must also be rejected by the public TypeScript interface.
    storage.setItem("sessions-ui", { state: invalidState, version: 1 });
    // @ts-expect-error A JSON string is not a structured persist envelope.
    storage.setItem("sessions-ui", "{\"state\":{\"tab\":\"hosting\"}}");
    // @ts-expect-error A malformed envelope must not throw or update browser history.
    storage.setItem("sessions-ui", null);
    expect(replaceUrl).not.toHaveBeenCalled();
    expect(currentUrl().href).toBe("https://booking.example/sessions?source=calendar#history");
  });
});
