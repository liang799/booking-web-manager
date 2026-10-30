import { expect, test } from "vitest";
import { notificationDate, notificationTime } from "@/app/notifications/presentation";

test("groups either side of UTC midnight into the Singapore calendar day", () => {
  expect(notificationDate("2026-10-28T17:00:00Z", "2026-10-29T02:00:00Z")).toEqual({ key: "2026-10-29", day: "29", month: "OCT 2026", label: "Today" });
  expect(notificationDate("2026-10-28T15:59:00Z", "2026-10-29T02:00:00Z").label).toBe("Yesterday");
});

test("future clock skew does not show negative relative time", () => {
  expect(notificationTime("2026-10-29T02:01:00Z", "2026-10-29T02:00:00Z")).toBe("Just now");
});
