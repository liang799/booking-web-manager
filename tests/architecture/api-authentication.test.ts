import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ESLint } from "eslint";
import { afterEach, describe, expect, test } from "vitest";

const eslint = new ESLint();
const boundaryImport = 'import { createAuthenticatedActions as authenticated } from "@/app/http/authenticated-action";';
const actions = `${boundaryImport}\nconst actions = authenticated(policy);`;
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function authenticationMessages(source: string, filePath = "app/api/example/route.ts", instance = eslint) {
  const [result] = await instance.lintText(source, { filePath });
  expect(result!.messages.filter((message) => message.fatal)).toEqual([]);
  return result!.messages.filter((message) => message.ruleId === "architecture/api-authentication");
}

async function fixture(files: Record<string, string>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "api-authentication-"));
  directories.push(directory);
  const sources = { "app/http/authenticated-action.ts": "export function createAuthenticatedActions() {}", ...files };
  await Promise.all(Object.entries(sources).map(async ([file, source]) => {
    const target = path.join(directory, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source);
  }));
  return new ESLint({ cwd: directory, overrideConfigFile: path.resolve("eslint.config.mjs") });
}

describe("API authentication boundary", () => {
  test.each([
    'export async function GET() { return Response.json({secret: true}); }',
    'export const POST = async () => Response.json({saved: true});',
    'const handler = () => Response.json({secret: true}); export { handler as GET };',
    'export const { GET } = unsafe;',
    'export const { handler: GET = unsafe } = factories;',
    'export const [GET] = unsafe;',
    'export const [...GET] = unsafe;',
    'function sessionManagementGetAction() { return () => Response.json({secret: true}); } export const GET = sessionManagementGetAction();',
    'import { sessionManagementGetAction } from "some-package"; export const GET = sessionManagementGetAction({});',
    'import * as feature from "@/app/sessions/management-action"; export const GET = feature.sessionManagementGetAction({});',
    'export { GET } from "./unknown";',
    'export * from "./unknown";',
    'module.exports = { GET: () => Response.json({secret: true}) };',
    'export = { GET: unsafe };',
    'Object.assign(exports, { GET: unsafe });',
    'Object.defineProperty(exports, "GET", {value: unsafe});',
    'const target = module.exports; target.GET = unsafe;',
    `${actions}\nexport const GET = actions[method]({});`,
    `${actions}\nexport const GET = actions?.get({});`,
    `${actions}\nexport const GET = actions.get?.({});`,
    `${actions}\nexport const GET = authenticated?.(policy).get({});`,
    `${actions}\nexport const GET = (() => { if (bypass) return unsafe; return actions.get({}); })();`,
    `${actions}\nexport const GET = ((actions) => actions.get({}))(unsafe);`,
    `${actions}\nlet handler = actions.get({}); handler = unsafe; export { handler as GET };`,
    `${actions}\nactions.get = unsafe; export const GET = actions.get({});`,
    `${actions}\nconst alias = actions; alias["get"] = unsafe; export const GET = actions.get({});`,
    `${actions}\nObject.assign(actions, unsafe); export const GET = actions.get({});`,
    `${actions}\nconst alias = actions; change(alias); export const GET = actions.get({});`,
    `${actions}\nconst factory = actions.get; change(factory); export const GET = factory({});`,
    `${actions}\nconst factory = actions.get; export const GET = factory.call(null, {});`,
    `${actions}\nconst factory = (input = bypass()) => actions.get(input); export const GET = factory();`,
    `${actions}\nconst factory = (input) => { const unchecked = unsafe(); return actions.get(input); }; export const GET = factory({});`,
    'import type { createAuthenticatedActions } from "@/app/http/authenticated-action"; export const GET = createAuthenticatedActions({}).get({});',
  ])("rejects unguarded or unverifiable methods: %s", async (source) => {
    expect(await authenticationMessages(source)).toHaveLength(1);
  });

  test.each([
    `${actions}\nexport const GET = actions.get({});`,
    `${actions}\nexport const POST = actions.json({});`,
    `${actions}\nexport const GET = actions["get"]({});`,
    `${boundaryImport}\nconst create = authenticated; const handlers = create(policy); const get = handlers.get; const handler = get({}); export { handler as GET };`,
    `${actions}\nconst factory = (input) => actions.get(input); export const GET = factory({});`,
    `${actions}\nfunction factory(input) { const handler = actions.get(input); return handler; } export const GET = factory({});`,
    `${boundaryImport}\nfunction factory(input) { const scoped = authenticated(policy); return scoped.json(input); } export const POST = factory({});`,
    `${actions}\nexport const GET = (actions.get({}) satisfies Handler);`,
    'import { sessionManagementGetAction as protectedGet } from "@/app/sessions/management-action"; export const GET = protectedGet({});',
    'import { walletGetAction } from "../../wallet/wallet-action"; export const GET = walletGetAction({});',
    'import { payoutAction } from "@/app/payouts/payout-action"; export const POST = payoutAction(loader, run);',
    'import { commitmentAction } from "@/app/commit/commitment-action"; export const DELETE = commitmentAction({});',
    'export const runtime = "nodejs"; export const dynamic = "force-dynamic";',
    'export type { GET } from "./types";',
    `${actions}\nconst module = {}; const exports = {}; Object.assign(module, exports); export const GET = actions.get({});`,
  ])("accepts verifiable factory provenance: %s", async (source) => {
    expect(await authenticationMessages(source)).toHaveLength(0);
  });

  test.each(["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"])("checks route.%s and route groups", async (extension) => {
    const filePath = `app/(shell)/api/(internal)/new-route/route.${extension}`;
    expect(await authenticationMessages("export const GET = () => new Response();", filePath)).toHaveLength(1);
  });

  test.each([
    ["GET", "sessions"], ["GET", "openapi"], ["POST", "webhooks/stripe"], ["GET", "cron/commitments"],
  ])("exempts only %s /api/%s", async (method, route) => {
    expect(await authenticationMessages(`export const ${method} = () => new Response();`, `app/api/${route}/route.ts`)).toHaveLength(0);
    const otherMethod = method === "GET" ? "POST" : "GET";
    expect(await authenticationMessages(`export const ${otherMethod} = () => new Response();`, `app/api/${route}/route.ts`)).toHaveLength(1);
    expect(await authenticationMessages(`export const ${method} = () => new Response();`, `app/api/${route}/extra/route.ts`)).toHaveLength(1);
  });

  test("checks protected methods on the public discovery route", async () => {
    const messages = await authenticationMessages("export const GET = () => new Response(); export const POST = () => new Response();", "app/api/sessions/route.ts");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.message).toContain("POST /api/sessions");
  });

  test("checks each method even when several share factory bindings", async () => {
    expect(await authenticationMessages(`${actions}\nexport const GET = actions.get({}); export const POST = actions.json({});`)).toHaveLength(0);
    expect(await authenticationMessages(`${actions}\nchange(actions); export const GET = actions.get({}); export const POST = actions.json({});`)).toHaveLength(2);
  });

  test("leaves non-API routes and ordinary modules outside the rule", async () => {
    expect(await authenticationMessages("export const GET = () => new Response();", "app/auth/callback/route.ts")).toHaveLength(0);
    expect(await authenticationMessages("export const GET = () => new Response();", "app/api/example/helper.ts")).toHaveLength(0);
  });

  test("follows imports, named reexports and local aliases to the shared boundary", async () => {
    const instance = await fixture({
      "app/feature/action.ts": `${actions}\nexport const get = actions.get;`,
      "app/feature/index.ts": 'export { get as authenticatedGet } from "./action";',
      "app/feature/handler.ts": 'import { authenticatedGet } from "./index"; export const handler = authenticatedGet({});',
    });
    expect(await authenticationMessages('export { handler as GET } from "@/app/feature/handler";', undefined, instance)).toHaveLength(0);
  });

  test.each([
    'export const get = () => async () => Response.json({secret: true});',
    `${actions}\nconst leaked = actions; leaked.get = unsafe; export const get = actions.get;`,
    `${actions}\nexport function get(actions) { return actions.get({}); }`,
    'export { get } from "./other";',
  ])("does not trust a feature factory name after its implementation changes: %s", async (source) => {
    const instance = await fixture({ "app/feature/action.ts": source });
    expect(await authenticationMessages('import { get } from "@/app/feature/action"; export const GET = get({});', undefined, instance)).toHaveLength(1);
  });

  test("does not treat a different module with the shared factory name as trusted", async () => {
    const instance = await fixture({
      "app/feature/authenticated-action.ts": 'export const createAuthenticatedActions = () => ({get: () => unsafe});',
    });
    expect(await authenticationMessages('import { createAuthenticatedActions } from "@/app/feature/authenticated-action"; export const GET = createAuthenticatedActions({}).get({});', undefined, instance)).toHaveLength(1);
  });

  test("all current API methods meet the boundary policy", async () => {
    const results = await eslint.lintFiles(["app/**/route.{ts,tsx,js,jsx,mjs,cjs,mts,cts}"]);
    expect(results.flatMap((result) => result.messages.filter((message) => message.ruleId === "architecture/api-authentication")
      .map((message) => `${path.relative(process.cwd(), result.filePath)}: ${message.message}`))).toEqual([]);
  });
});
