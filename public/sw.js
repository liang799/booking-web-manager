// Web Push service worker for commitment notifications (UC2-04/05/06).
// Shows each pushed payload and opens the app at its URL when clicked.
// Payload: canonical notificationId/title/body/url/kind; legacy sessionId payloads remain supported.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" ? payload.title : "Booking Web Manager";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    // A replay of one occurrence replaces itself, while distinct messages keep distinct tags.
    tag: typeof payload.notificationId === "string" && payload.notificationId
      ? payload.notificationId
      : `${payload.kind ?? "update"}:${payload.sessionId ?? ""}`,
    data: { url: sameOriginPath(payload.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(sameOriginPath(event.notification.data?.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

/** Only paths on this site are opened; anything else falls back to Home. */
function sameOriginPath(url) {
  if (typeof url !== "string") return "/";
  try {
    const parsed = new URL(url, self.location.origin);
    return parsed.origin === self.location.origin ? parsed.pathname + parsed.search : "/";
  } catch {
    return "/";
  }
}
