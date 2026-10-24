# API authentication boundaries

Server-side PostgreSQL queries and Supabase service-role clients use privileged
credentials. Supabase Data API RLS policies do not establish the acting user for
these calls. Each protected HTTP operation must authenticate before parsing input
or invoking a business capability; the use case must still enforce account status
and ownership. Middleware deliberately leaves API authentication to the route.

Use `createAuthenticatedActions` from `authenticated-action.ts` directly or through
a feature action factory. Supply the dependency getter, feature error mapper,
parser, and visible application call. Authentication chooses bearer credentials
when an Authorization header exists; a rejected bearer must never fall back to a
login cookie. Dependency initialization precedes authentication so unavailable
features retain their existing 503 contract. Dependency getters must only assemble
capabilities, not execute business operations.

The shared boundary authenticates before reading route parameters or JSON. JSON
actions work for POST, PATCH, and DELETE; GET actions can also serve authenticated
operations that do not read a body. A success status of 204 returns an empty body
without invoking a serializer. All existing feature error policies and success
headers remain feature-owned, including wallet top-up validation's 422 response.

`architecture/api-authentication` in `npm run lint` checks API method exports and
traces their factory origin to this shared boundary. New factories must use the
supported declarative shape; an unrecognized handler fails lint instead of being
assumed safe. Do not suppress the rule to introduce a handwritten handler.

Only these exact method/path pairs have a different policy:

| Method and path | Required policy |
| --- | --- |
| GET `/api/sessions` | Public discovery returning safe session summaries |
| GET `/api/openapi` | Public API documentation |
| POST `/api/webhooks/stripe` | Verify Stripe's signature on the raw request body before dispatch |
| GET `/api/cron/commitments` | Verify the configured cron secret before starting jobs |

An exception applies only to that method: POST `/api/sessions` remains protected.
Adding an exception requires explicit review and tests for its alternative access
policy. The route inventory test exercises actual exports and requires new routes
to be included; rejected authentication must not parse input or access a business
capability. Separate tests retain ownership, inactive-account, webhook, and cron
guarantees.

This is a development-time safeguard against accidentally omitting authentication,
not database-level isolation or a proof that every query is authorized. Review
dependency assembly, each authenticated use case's authorization, and every public
query's data projection. Keep financial provider calls and schema policy unchanged.
