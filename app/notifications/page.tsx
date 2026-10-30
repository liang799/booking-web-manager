import type { Metadata } from "next";
import { NotificationsClient } from "./_components/notifications-client";

export const metadata: Metadata = { title: "Notifications | Booking" };

export default function NotificationsPage() {
  return <NotificationsClient />;
}
