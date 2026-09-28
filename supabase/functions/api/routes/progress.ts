import { upsertMediaProgress } from "../../_shared/progress.ts";
import { createOpenApiRouter, z } from "../_shared/openapi.ts";
import { Context } from "hono";
import { Variables } from "../_shared/types.ts";

export const progressRouter = createOpenApiRouter();

// Field definition only. `.refine()` returns a ZodEffects, which exposes no
// `.extend()`, so the shape is declared once here and the two derived schemas
// below are built from THIS, not from the refined one -- the same ZodEffects
// trap already documented on sanitizedString in _shared/validation.ts.
const ProgressFieldsSchema = z.object({
  episodeId: z.string().optional(),
  progress: z.number().min(0).max(1).optional(),
  duration: z.number().min(0).optional(),
  isFinished: z.boolean().optional(),
  hideFromContinueListening: z.boolean().optional(),
});

// `progress` is OPTIONAL, matching upsertMediaProgress in _shared/progress.ts,
// which has always declared every field optional.
//
// It used to be required here, which meant the two other intents this endpoint
// exists to serve could never be expressed: "mark finished" and "remove from
// Continue Listening" are independent of playback position, and a caller
// sending only `{isFinished: true}` or only `{hideFromContinueListening: true}`
// was rejected 400 before reaching the handler. The web client's
// toggleFinishedAction and removeFromContinueListeningAction do exactly that,
// so the checkbox on every book card 400'd and the item reappeared on the
// Continue Listening shelf on the next load.
//
// The refine() is what stops the loosening from becoming a silent no-op: an
// empty or all-unknown body is still a 400, because a 200 that wrote nothing
// would be indistinguishable from a real success at the call site.
const ProgressPayloadSchema = ProgressFieldsSchema.refine(
  (v) =>
    v.progress !== undefined || v.duration !== undefined ||
    v.isFinished !== undefined || v.hideFromContinueListening !== undefined,
  {
    message:
      "At least one of progress, duration, isFinished or hideFromContinueListening is required",
  },
);

const ProgressEntrySchema = ProgressFieldsSchema.extend({
  libraryItemId: z.string(),
});

// The batch endpoint accepted a top-level ARRAY only, but the web client sends
// `{items: [...]}`, so "mark all as finished" 400'd with
// "Expected array, received object". Both shapes are accepted so neither client
// has to be wrong about the other's contract.
const BatchProgressPayloadSchema = z.union([
  z.array(ProgressEntrySchema),
  z.object({ items: z.array(ProgressEntrySchema) }),
]);

/** Normalise the two accepted batch shapes to a single array. */
function batchEntries(
  parsed: z.infer<typeof BatchProgressPayloadSchema>,
): z.infer<typeof ProgressEntrySchema>[] {
  return Array.isArray(parsed) ? parsed : parsed.items;
}

// Built from the unrefined field schema -- see the ZodEffects note above.
const LegacyProgressPayloadSchema = ProgressFieldsSchema.extend({
  libraryItemId: z.string().optional(),
  itemId: z.string().optional(),
});

const ServerErrorSchema = z.object({ error: z.string() });
const ProgressResultSchema = z.record(z.string(), z.any());
const SuccessSchema = z.object({ success: z.boolean() });
const SuccessDataSchema = z.object({ success: z.boolean(), data: z.any() });

const getProgressRoute = {
  method: "get" as const,
  path: "/me/progress/:id",
  tags: ["progress"],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Progress record",
      content: { "application/json": { schema: ProgressResultSchema } },
    },
    404: {
      description: "Progress not found",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
    500: {
      description: "Database error",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const updateProgressRoute = {
  method: "patch" as const,
  path: "/me/progress/:id",
  tags: ["progress"],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: { "application/json": { schema: ProgressPayloadSchema } },
    },
  },
  responses: {
    200: {
      description: "Progress updated",
      content: { "application/json": { schema: ProgressResultSchema } },
    },
    400: {
      description: "Invalid payload",
      content: {
        "application/json": { schema: z.record(z.string(), z.any()) },
      },
    },
    500: {
      description: "Database error",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const updateProgressBatchRoute = {
  method: "patch" as const,
  path: "/me/progress-batch",
  tags: ["progress"],
  request: {
    body: {
      content: { "application/json": { schema: BatchProgressPayloadSchema } },
    },
  },
  responses: {
    200: {
      description: "Batch progress updated",
      content: { "application/json": { schema: SuccessSchema } },
    },
    400: {
      description: "Invalid payload",
      content: {
        "application/json": { schema: z.record(z.string(), z.any()) },
      },
    },
    500: {
      description: "Database error",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const updateProgressSeriesRoute = {
  method: "patch" as const,
  path: "/me/progress/series/:id",
  tags: ["progress"],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Series progress updated",
      content: {
        "application/json": { schema: z.record(z.string(), z.any()) },
      },
    },
  },
};

const deleteProgressRoute = {
  method: "delete" as const,
  path: "/me/progress/id/:id",
  tags: ["progress"],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Progress deleted",
      content: { "application/json": { schema: SuccessSchema } },
    },
    500: {
      description: "Database error",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const playbackProgressRoute = {
  method: "post" as const,
  path: "/playback-progress",
  tags: ["progress"],
  request: {
    body: {
      content: { "application/json": { schema: LegacyProgressPayloadSchema } },
    },
  },
  responses: {
    200: {
      description: "Progress updated",
      content: { "application/json": { schema: SuccessDataSchema } },
    },
    400: {
      description: "Invalid payload",
      content: {
        "application/json": { schema: z.record(z.string(), z.any()) },
      },
    },
    500: {
      description: "Database error",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const sessionSyncRoute = {
  method: "post" as const,
  path: "/session-sync",
  tags: ["progress"],
  request: {
    body: {
      content: { "application/json": { schema: LegacyProgressPayloadSchema } },
    },
  },
  responses: {
    200: {
      description: "Progress synced",
      content: { "application/json": { schema: SuccessDataSchema } },
    },
    400: {
      description: "Invalid payload",
      content: {
        "application/json": { schema: z.record(z.string(), z.any()) },
      },
    },
    500: {
      description: "Database error",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

progressRouter.openapi(getProgressRoute, async (c) => {
  const supabase = c.get("supabase");
  const user = c.get("user")!;
  const { id: libraryItemId } = c.req.valid("param");

  const { data, error } = await supabase
    .from("media_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("library_item_id", libraryItemId)
    .is("episode_id", null)
    .maybeSingle();

  if (error) {
    console.error("[progress] get error:", error);
    return c.json({ error: "Failed to fetch progress" }, 500);
  }

  if (!data) {
    return c.json({ error: "Progress not found" }, 404);
  }

  return c.json({
    ...data,
    currentTime: data.current_time_pos,
  }, 200);
});

progressRouter.openapi(updateProgressRoute, async (c) => {
  const supabase = c.get("supabase");
  const user = c.get("user")!;
  const { id: libraryItemId } = c.req.valid("param");

  let body;
  try {
    const rawBody = await c.req.json();
    body = ProgressPayloadSchema.parse(rawBody);
  } catch (e: unknown) {
    const zodErrors = e instanceof Object && "errors" in e
      ? (e as { errors: unknown }).errors
      : null;
    return c.json(
      { success: false, error: zodErrors || "Invalid payload" },
      400,
    );
  }

  const data = await upsertMediaProgress(
    supabase,
    user.id,
    libraryItemId,
    body.episodeId ?? null,
    {
      progress: body.progress,
      duration: body.duration,
      isFinished: body.isFinished,
      hideFromContinueListening: body.hideFromContinueListening,
    },
  );

  return c.json(data, 200);
});

progressRouter.openapi(updateProgressBatchRoute, async (c) => {
  const supabase = c.get("supabase");
  const user = c.get("user")!;
  let items;

  try {
    const rawBody = await c.req.json();
    items = batchEntries(BatchProgressPayloadSchema.parse(rawBody));
  } catch (e: unknown) {
    const zodErrors = e instanceof Object && "errors" in e
      ? (e as { errors: unknown }).errors
      : null;
    return c.json(
      { success: false, error: zodErrors || "Invalid payload" },
      400,
    );
  }

  for (const item of items) {
    await upsertMediaProgress(
      supabase,
      user.id,
      item.libraryItemId,
      item.episodeId ?? null,
      {
        progress: item.progress,
        duration: item.duration,
        isFinished: item.isFinished,
        hideFromContinueListening: item.hideFromContinueListening,
      },
    );
  }
  return c.json({ success: true }, 200);
});

progressRouter.openapi(updateProgressSeriesRoute, async (c) => {
  // For series, we might update a separate table or user preferences
  return c.json({
    success: true,
    message: "Not fully implemented for Supabase yet",
  }, 200);
});

progressRouter.openapi(deleteProgressRoute, async (c) => {
  const supabase = c.get("supabase");
  const user = c.get("user")!;
  const { id: progressId } = c.req.valid("param");

  const { error } = await supabase.from("media_progress").delete().eq(
    "id",
    progressId,
  ).eq("user_id", user.id);
  if (error) {
    console.error("[progress] delete error:", error);
    return c.json({ error: "Failed to delete progress" }, 500);
  }
  return c.json({ success: true }, 200);
});

const legacyProgressHandler = async (c: Context<{ Variables: Variables }>) => {
  const supabase = c.get("supabase");
  const user = c.get("user")!;
  let body;
  try {
    body = await c.req.json().catch(() => ({}));
  } catch (_e) {
    body = {};
  }
  const libraryItemId = body.libraryItemId || body.itemId;
  if (!libraryItemId) {
    return c.json({ success: false, error: "libraryItemId is required" }, 400);
  }
  const data = await upsertMediaProgress(
    supabase,
    user.id,
    libraryItemId,
    body.episodeId ?? null,
    {
      progress: body.progress ?? 0,
      duration: body.duration,
      isFinished: body.isFinished,
      hideFromContinueListening: body.hideFromContinueListening,
    },
  );
  return c.json({ success: true, data }, 200);
};

progressRouter.openapi(playbackProgressRoute, legacyProgressHandler);
progressRouter.openapi(sessionSyncRoute, legacyProgressHandler);
