import { redirect } from "next/navigation";
import { QueryProvider } from "@/app/_components/query-provider";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { SessionsController } from "../_components/sessions-controller";
import { getSessionAccountActions } from "../session-actions";

export const dynamic = "force-dynamic";

/** The signed-in player's joined and hosted sessions, loaded with cursor-based React Query feeds. */
export default async function SessionsPage() {
  const user = await getCurrentUser();
  if (user === null) redirect("/login?next=%2Fsessions");
  return <QueryProvider><SessionsController key={user.id} userId={user.id} actions={getSessionAccountActions(user)} /></QueryProvider>;
}
