import type { SupabaseClient } from "@supabase/supabase-js";
import { ReliabilityUnavailableError, type ReliabilityDependencies } from "@/app/profile/reliability-dependencies";
import { readSessionServerSettings } from "@/app/sessions/server-environment";
import { createPostgresExecutor } from "@/lib/database/postgres-executor";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { PostgresReliabilityHistoryReader } from "@/lib/supabase/postgres-reliability-history-reader";
import { SupabaseProfileStore } from "@/lib/supabase/profile-store";
import { GetReliabilityScore } from "@/use-cases/accounts/get-reliability-score";
import { UpdateProfile } from "@/use-cases/accounts/update-profile";

/** The authenticated client belongs to this server request and is never shared. */
export function createUpdateProfile(client: Pick<SupabaseClient, "from" | "rpc">): UpdateProfile {
  return new UpdateProfile(new SupabaseProfileStore(client));
}

/** Only server code with a verified identity acquires this capability. */
export function createReliabilityDependencies(): ReliabilityDependencies {
  const settings = readSessionServerSettings();
  if (settings === undefined) return {
    reliabilityScore: { forUser: async () => { throw new ReliabilityUnavailableError(); } },
  };
  const sql = createPostgresExecutor(createPostgresPoolProvider(settings.databaseUrl));
  return {
    reliabilityScore: new GetReliabilityScore({
      reader: new PostgresReliabilityHistoryReader(sql),
      clock: { now: () => new Date() },
    }),
  };
}
