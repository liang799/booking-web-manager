import { isAuthorizedCronRequest } from "@/app/commit/cron-auth";
import { createNotificationDispatchDependencies } from "@/use-case-config/notification-dispatch";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(request: Request): Promise<Response> {
  // Authenticate before initializing any database capability.
  if (!isAuthorizedCronRequest(request,process.env.CRON_SECRET ?? "")) {
    return Response.json({error:{code:"UNAUTHENTICATED",message:"Authentication is required"}},{status:401,headers:{"Cache-Control":"no-store"}});
  }
  try {
    const report=await createNotificationDispatchDependencies().runner.run();
    console.info("Notification dispatch",report);
    return Response.json(report,{headers:{"Cache-Control":"no-store"}});
  } catch {
    return Response.json({error:{code:"INTERNAL_ERROR",message:"Notification delivery is unavailable"}},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
