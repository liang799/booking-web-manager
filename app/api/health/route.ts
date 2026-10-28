import { isApiReady } from "@/app/health/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public deployment-readiness probe. It never returns private error details. */
export async function GET(): Promise<Response> {
  const ready = await isApiReady();
  return Response.json(
    { status: ready ? "ok" : "unavailable" },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
