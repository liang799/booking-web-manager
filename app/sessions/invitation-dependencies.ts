import type { UUID } from "@/domain";
import type { GetSessionInvitation } from "@/use-cases/sessions/GetSessionInvitation";

export interface SessionInvitationDependencies {
  readonly authenticate: (request: Request) => Promise<UUID | null>;
  readonly invitation: Pick<GetSessionInvitation, "forBooker">;
}
