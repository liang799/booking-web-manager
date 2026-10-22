import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import type { SqlExecutor } from "@/lib/money/sql";
import { PostgresSessionDiscoveryReader } from "@/lib/sessions/postgres-session-discovery-reader";
import type { SessionDiscoveryCriteria } from "@/use-cases/sessions/DiscoverSessions";

const now = new Date("2030-01-01T00:00:00Z");
const lowerBound = new Date("2030-01-02T10:00:00Z");
const upperBound = new Date("2030-01-02T12:00:00Z");
const hostileText = "100%_O'Brien\\Court'; select pg_sleep(10); --";
const observations: object[] = [];

interface BasisCase {
  id: string;
  title: string;
  criteria: SessionDiscoveryCriteria;
  predicate: string;
  parameter: string | Date;
  predictedPath: string;
}

const cases: readonly BasisCase[] = [
  {
    id: "WB-D2", title: "text only escapes literal search and binds one value",
    criteria: { text: hostileText },
    predicate: "(sport ilike $2 or venue_name ilike $2)",
    parameter: "%100\\%\\_O'Brien\\\\Court'; select pg\\_sleep(10); --%",
    predictedPath: "D0 D1 D2 D3 D5 D7 D9 D11 D12",
  },
  {
    id: "WB-D3", title: "sport only adds equality without unrelated filters",
    criteria: { sport: "Badminton" }, predicate: "sport = $2", parameter: "Badminton",
    predictedPath: "D0 D1 D3 D4 D5 D7 D9 D11 D12",
  },
  {
    id: "WB-D4", title: "region only adds equality without unrelated filters",
    criteria: { region: "West" }, predicate: "region = $2", parameter: "West",
    predictedPath: "D0 D1 D3 D5 D6 D7 D9 D11 D12",
  },
  {
    id: "WB-D5", title: "lower bound alone remains inclusive",
    criteria: { startsWithin: { from: lowerBound } },
    predicate: "start_at >= $2", parameter: lowerBound,
    predictedPath: "D0 D1 D3 D5 D7 D8 D9 D11 D12",
  },
  {
    id: "WB-D6", title: "upper bound alone remains exclusive",
    criteria: { startsWithin: { before: upperBound } },
    predicate: "start_at < $2", parameter: upperBound,
    predictedPath: "D0 D1 D3 D5 D7 D9 D10 D11 D12",
  },
];

describe("UC2-01 isolated discovery filter basis inputs", () => {
  test.each(cases)("$id: $title", async (basis) => {
    // Arrange: record the adapter's SQL output without connecting to a database.
    const calls: { text: string; values: readonly unknown[] }[] = [];
    const sql: SqlExecutor = {
      async query(text, values) {
        calls.push({ text, values: values ?? [] });
        return [];
      },
    };
    const reader = new PostgresSessionDiscoveryReader(sql);

    // Act
    const result = await reader.search(basis.criteria, now);

    // Assert: exact predicates reject unintended filter coupling as well as omission.
    expect(calls).toHaveLength(1);
    const statement = calls[0]?.text.replace(/\s+/g, " ");
    const expected = {
      where: `visibility = 'PUBLIC' and status = 'OPEN' and start_at > $1 and ${basis.predicate}`,
      parameters: [now, basis.parameter],
      result: [],
    };
    const actual = {
      where: statement?.match(/ where (.+) order by /)?.[1],
      parameters: calls[0]?.values,
      result,
    };
    observations.push({
      id: basis.id, input: basis.criteria, predictedPath: basis.predictedPath,
      expected, actual,
    });
    expect(actual).toEqual(expected);
    expect(statement).toContain("order by date_trunc('milliseconds', start_at) asc, session_id asc");
    expect(statement).not.toContain(String(basis.parameter));
    expect(statement).not.toContain(hostileText);
  });
});

afterAll(() => {
  if (!process.env.LAB4_EVIDENCE_DIR) return;
  const directory = path.resolve(process.env.LAB4_EVIDENCE_DIR);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "discovery-basis-observations.json"), JSON.stringify({
    scope: "Local SQL-construction tests with a recording executor; no database or production requests.",
    pathConvention: "Paths are source-derived predictions, not instrumented runtime traces.",
    observations,
  }, null, 2) + "\n");
});
