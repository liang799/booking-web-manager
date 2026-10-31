import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { findPlayer } from "@/app/users/find-player-action";
import { createGroupWithPlayers } from "../create-group-action";
import { CreateGroupWizard } from "../_components/group-create";

export default async function NewGroupPage() {
  const user = await getCurrentUser();
  if (user === null) redirect("/login");
  return <CreateGroupWizard createAction={createGroupWithPlayers} findAction={findPlayer} draftKey={`group-draft:${user.id}`} />;
}
