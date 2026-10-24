import { expect, test, vi } from "vitest";
import { createAuthenticatedActions } from "@/app/http/authenticated-action";

test("a successful no-content action completes its work without serializing a body", async () => {
  const userId = "10000000-0000-4000-8000-000000000001";
  const run = vi.fn(async () => ({ privateStorageResult: true }));
  const serialize = vi.fn(() => { throw new Error("No response body is allowed"); });
  const errorResponse = vi.fn(() => new Response(null, { status: 500 }));
  const action = createAuthenticatedActions({
    getDependencies: async () => ({ authenticate: async () => userId }),
    errorResponse,
  }).json({
    parse: (actor, body) => ({ actor, body }),
    run,
    serialize,
    successStatus: 204,
    invalidRequestMessage: "Invalid request",
  });

  const response = await action(new Request("http://localhost/api/example", {
    method: "POST", body: JSON.stringify({ endpoint: "https://example.com/push" }),
  }));

  expect(run).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
    actor: userId, body: { endpoint: "https://example.com/push" },
  });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(response.headers.get("content-type")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(serialize).not.toHaveBeenCalled();
  expect(errorResponse).not.toHaveBeenCalled();
});
