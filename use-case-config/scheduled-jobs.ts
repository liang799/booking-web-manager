import { createNotificationPublisher } from "./notification-publisher";
import { randomUUID } from "node:crypto";
import type { ScheduledJobsDependencies } from "@/app/commit/scheduled-jobs-dependencies";
import { SessionManagementUnavailableError } from "@/app/sessions/session-management-unavailable";
import { readSessionServerSettings } from "@/app/sessions/server-environment";
import { createPostgresSchedulingQueries } from "@/lib/commit/postgres-scheduling-queries";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { PostgresCommitmentUnitOfWork } from "@/lib/sessions/postgres-commitment-unit-of-work";
import { AutoVerifyAttendance } from "@/use-cases/sessions/AutoVerifyAttendance";
import { ExpireReplacements } from "@/use-cases/sessions/ExpireReplacements";
import { PromoteFromWaitlist } from "@/use-cases/sessions/PromoteFromWaitlist";
import { RunScheduledSessionJobs } from "@/use-cases/sessions/RunScheduledSessionJobs";

/** Sessions per sweep; each one runs up to three short transactions. */
export const SCHEDULED_JOBS_BATCH_SIZE = 25;

/**
 * Assembles the scheduled commitment sweep (UC2-05 forfeiture and promotion,
 * UC2-06 automatic verification) on the Postgres commitment unit of work.
 * The handler accepts only `Authorization: Bearer <CRON_SECRET>`; an unset
 * secret authorizes nothing. Without database settings every authorized run
 * fails with an opaque 500.
 */
export function createScheduledJobsDependencies(): ScheduledJobsDependencies {
  const cronSecret = process.env.CRON_SECRET ?? "";
  const ids = { next: randomUUID };
  const settings = readSessionServerSettings();
  if (!settings) {
    return {
      cronSecret,
      ids,
      runner: {
        run: async () => {
          throw new SessionManagementUnavailableError();
        },
      },
    };
  }
  const getPool = createPostgresPoolProvider(settings.databaseUrl);
  const { dueSessions, verificationReminders } = createPostgresSchedulingQueries(getPool, createNotificationPublisher());
  const clock = { now: () => new Date() };
  const unitOfWork = new PostgresCommitmentUnitOfWork(getPool, clock, createNotificationPublisher());
  return {
    cronSecret,
    ids,
    runner: new RunScheduledSessionJobs({
      dueSessions,
      verificationReminders,
      expireReplacements: new ExpireReplacements({ unitOfWork, clock }),
      promote: new PromoteFromWaitlist({ unitOfWork, clock, ids }),
      autoVerify: new AutoVerifyAttendance({ unitOfWork, clock }),
      clock,
      batchSize: SCHEDULED_JOBS_BATCH_SIZE,
    }),
  };
}
