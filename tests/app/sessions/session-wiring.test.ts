import { afterEach, expect, test, vi } from "vitest";
import { CreateSessions } from "@/use-cases/sessions/CreateSessions";
import { createSessionDependencies } from "@/use-case-config/sessions";
import { parseRequestBoundCreateSessionInput } from "@/app/sessions/request-bound-creation-input";

afterEach(() => vi.unstubAllEnvs());

test("configured assembly creates separate real use cases for each submission", () => {
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
  );
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "local-test-key");
  const dependencies = createSessionDependencies();
  const { submission } = parseRequestBoundCreateSessionInput(
    "11111111-1111-4111-8111-111111111111",
    {
      idempotencyKey: "first",
      booking: {
        venueName: "Jurong East Sports Hall", region: "West", sport: "Badminton",
        startAt: "2030-01-01T10:00:00Z", endAt: "2030-01-01T12:00:00Z", totalCostCents: 1001,
      },
      config: { totalSlots: 3, },
    },
  );
  const first = dependencies.createForSubmission(submission);
  const second = dependencies.createForSubmission({ ...submission, idempotencyKey: "second" });
  expect(first).toBeInstanceOf(CreateSessions);
  expect(second).toBeInstanceOf(CreateSessions);
  expect(first).not.toBe(second);
});
