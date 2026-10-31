import { z } from "zod";
import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { getNotificationDependencies } from "@/app/notifications/server-dependencies";
import { notificationErrorResponse } from "@/app/notifications/http";

export const runtime = "nodejs";
const actions = createAuthenticatedActions({ getDependencies: getNotificationDependencies, errorResponse: notificationErrorResponse });
const querySchema = z.object({
  filter: z.enum(["all", "bookings", "groups", "payments", "system"]).default("all"),
  before: z.string().datetime({ offset: true }).optional(),
  id: z.string().uuid().optional(),
}).refine((query) => Boolean(query.before) === Boolean(query.id));

export const GET = actions.get({
  parse: (userId, _params, request) => {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return { userId, filter: query.filter, before: query.before && query.id ? { createdAt: new Date(query.before), id: query.id } : undefined };
  },
  run: ({ inbox }, { userId, filter, before }) => inbox.list(userId, filter, before),
  serialize: (page) => ({
    retentionCutoff: page.retentionCutoff.toISOString(),
    items: page.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    nextCursor: page.nextCursor ? { createdAt: page.nextCursor.createdAt.toISOString(), id: page.nextCursor.id } : null,
  }),
});
