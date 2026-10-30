import type { DiscoveryPage } from "@/app/discover/contracts";
import type { HomeDiscoveryPage, ReadHomeDiscoveryPage } from "../discovery-feed";

export const firstDiscoveryPage: DiscoveryPage = {
  items: [
    { sessionId: "10000000-0000-4000-8000-000000000001", venueName: "Bukit Timah CC", sport: "Tennis", region: "West", startAt: "2035-06-16T23:00:00.000Z", endAt: "2035-06-17T00:00:00.000Z", totalSlots: 4, bookingShareCents: 1000 },
    { sessionId: "10000000-0000-4000-8000-000000000002", venueName: "Bishan Sports Hall", sport: "Badminton", region: "Central", startAt: "2035-06-17T01:00:00.000Z", endAt: "2035-06-17T03:00:00.000Z", totalSlots: 6, bookingShareCents: 750 },
  ],
  nextCursor: "next-page",
};
export const secondDiscoveryPage: DiscoveryPage = {
  items: [
    firstDiscoveryPage.items[1]!,
    { ...firstDiscoveryPage.items[0]!, sessionId: "10000000-0000-4000-8000-000000000003", venueName: "Yio Chu Kang Tennis Centre", startAt: "2035-06-18T01:00:00.000Z", endAt: "2035-06-18T03:00:00.000Z" },
  ],
  nextCursor: null,
};
export function discoverySample(page: DiscoveryPage): HomeDiscoveryPage {
  return { page, receivedAt: performance.now(), readDuration: 0, expiry: page.items[0] ? { startsAt: Date.parse(page.items[0].startAt), serverNow: Date.parse("2035-06-01T00:00:00Z") } : null };
}
export const readDiscoveryFixture: ReadHomeDiscoveryPage = async (cursor) => discoverySample(cursor ? secondDiscoveryPage : firstDiscoveryPage);
