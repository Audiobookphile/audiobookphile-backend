import { createClient } from "npm:@supabase/supabase-js@2.44.0";
import { Sentry } from "../../_shared/sentry.ts";
import { requireAdminRole } from "../_shared/auth.ts";

import { createOpenApiRouter, ForbiddenSchema, z } from "../_shared/openapi.ts";

export const debugRouter = createOpenApiRouter();

const ServerErrorSchema = z.object({ error: z.string() });

const debugItemRoute = {
  method: "get" as const,
  path: "/:id",
  tags: ["debug"],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "Raw library item row",
      content: { "application/json": { schema: z.record(z.any()) } },
    },
    500: {
      description: "Query failure",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
  },
};

debugRouter.openapi(debugItemRoute, async (c) => {
  // Reads `library_items` with the SERVICE ROLE and returns the raw row: the
  // internal B2 object layout in `audio_files[].metadata.path` and the pgvector
  // `embedding` column, both of which the public /api/items/:id mapper
  // deliberately strips. `_requiresServiceRole` below is a vestigial local,
  // not an enforced check -- the request was previously authenticated but not
  // authorised, so any signed-in member could dump it. The sibling dev-only
  // sentryRouter is secret-gated, which is the intent here too.
  const user = c.get("user");
  if (!requireAdminRole(user)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabaseUrl = c.get("supabaseUrl") as string;
  const serviceRoleKey = c.get("serviceRoleKey") as string;
  const _adminClient = createClient(supabaseUrl, serviceRoleKey);

  const _requiresServiceRole = true;

  const { id: itemId } = c.req.valid("param");
  const { data: item } = await _adminClient.from("library_items").select(
    "*",
  ).eq("id", itemId).single();
  return c.json(item as any, 200);
});

// Sentry test endpoint - triggers a test error to verify integration
const sentryTestRoute = {
  method: "post" as const,
  path: "/sentry-test",
  tags: ["debug"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            message: z.string().optional().default("Sentry test error"),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Test error captured",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            eventId: z.string().optional(),
          }),
        },
      },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
  },
};

debugRouter.openapi(sentryTestRoute, async (c) => {
  // Un-gated, this let any signed-in member push attacker-chosen exception
  // messages into the production Sentry project -- filling the issue list with
  // noise and polluting the on-call triage pipeline.
  const user = c.get("user");
  if (!requireAdminRole(user)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const body = c.req.valid("json");
  const testError = new Error(body.message);

  // Capture with context for better debugging
  const eventId = Sentry.captureException(testError, {
    tags: {
      component: "debug",
      test: "sentry-verification",
    },
    extra: {
      timestamp: new Date().toISOString(),
      environment: Deno.env.get("NODE_ENV") || "development",
    },
  });

  return c.json({
    success: true,
    message: "Test error captured successfully",
    eventId,
  }, 200);
});
