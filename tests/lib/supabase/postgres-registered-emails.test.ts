import { describe, expect, test, vi } from "vitest";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import { PostgresRegisteredEmails } from "@/lib/supabase/postgres-registered-emails";

function databaseReturning(rows: readonly SqlRow[]) {
  const query = vi.fn<SqlExecutor["query"]>().mockResolvedValue(rows);
  return { query, emails: new PostgresRegisteredEmails({ query: query as SqlExecutor["query"] }) };
}

// Owner: Joseph (Jolingoes) — /lib/supabase (UC1-01)
describe("PostgresRegisteredEmails", () => {
  test("finds an account for the email, confirmed or not, ignoring case and deleted accounts", async () => {
    // Arrange
    const { query, emails } = databaseReturning([{ "?column?": 1 }]);

    // Act
    const registered = await emails.hasAccount("marcus@example.com");

    // Assert
    expect(registered).toBe(true);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      "select 1 from auth.users where lower(email) = lower($1) and deleted_at is null limit 1",
      ["marcus@example.com"],
    );
    expect(query.mock.calls[0]?.[0]).not.toContain("confirmed");
  });

  test("reports no account when no user has the email", async () => {
    // Arrange
    const { emails } = databaseReturning([]);

    // Act
    const registered = await emails.hasAccount("new@example.com");

    // Assert
    expect(registered).toBe(false);
  });

  test("passes database failures on instead of treating them as a free email", async () => {
    // Arrange
    const query = vi.fn<SqlExecutor["query"]>().mockRejectedValue(new Error("connection refused"));
    const emails = new PostgresRegisteredEmails({ query: query as SqlExecutor["query"] });

    // Act & Assert
    await expect(emails.hasAccount("marcus@example.com")).rejects.toThrow("connection refused");
  });
});
