import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { PushNotificationsRow } from "@/app/commit/_components/push-notifications-row";
import { SettingsView } from "./_components/settings-view";

/** UC1-03 Manage Profile: the Settings page (mockup 10). */
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (user === null) redirect("/login");

  return <SettingsView user={user} notifications={<PushNotificationsRow />} />;
}
