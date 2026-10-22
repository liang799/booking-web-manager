import { ReliabilityScore, type ParticipationHistoryEntry } from "@/domain";
import type { UUID } from "@/domain/shared/types";
import type { Clock } from "../shared/contracts";

/** Every participation the user has had, each with its session's end time. */
export interface ReliabilityHistoryReader {
  historyFor(userId: UUID): Promise<readonly ParticipationHistoryEntry[]>;
}

/**
 * UC1-03 Manage Profile (REQ-10): the user's reliability score from their full history.
 * The domain decides which outcomes count and how they are weighted.
 */
export class GetReliabilityScore {
  constructor(
    private readonly dependencies: {
      readonly reader: ReliabilityHistoryReader;
      readonly clock: Clock;
    },
  ) {}

  async forUser(userId: UUID): Promise<ReliabilityScore> {
    const history = await this.dependencies.reader.historyFor(userId);
    return ReliabilityScore.fromHistory(userId, history, this.dependencies.clock.now());
  }
}
