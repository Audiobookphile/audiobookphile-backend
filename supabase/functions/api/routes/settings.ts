import { createOpenApiRouter, z } from "../_shared/openapi.ts";
import { requireAdminRole } from "../_shared/auth.ts";
import { Context } from "hono";
import { Variables } from "../_shared/types.ts";
import { getErrorMessage } from "../_shared/errors.ts";

export const settingsRouter = createOpenApiRouter();

const GenreUpdateSchema = z.object({
  newGenreName: z.string().min(1).max(256),
});

const TagUpdateSchema = z.object({
  newTagName: z.string().min(1).max(256),
});

const MockResultSchema = z.record(z.string(), z.any());
const ForbiddenSchema = z.object({ error: z.string() });
const ErrorSchema = z.object({ error: z.string() });

// Helper to create simple mock routes
function createMockRoute(
  method: "get" | "post" | "patch" | "delete",
  path: string,
  tags = ["settings"],
) {
  const hasParams = path.includes(":");

  // We explicitly type the params for known ones
  let paramsObj: any = undefined;
  if (hasParams) {
    const params: any = {};
    if (path.includes(":id")) params.id = z.string();
    if (path.includes(":type")) params.type = z.string();
    if (path.includes(":genre")) params.genre = z.string();
    if (path.includes(":tag")) params.tag = z.string();
    paramsObj = z.object(params);
  }

  return {
    method,
    path,
    tags,
    request: paramsObj ? { params: paramsObj } : undefined,
    responses: {
      200: {
        description: "Success",
        content: { "application/json": { schema: MockResultSchema } },
      },
      403: {
        description: "Admin role required",
        content: { "application/json": { schema: ForbiddenSchema } },
      },
    },
  };
}

// --- ROUTE DEFINITIONS ---

// FILESYSTEM
const getFilesystemRoute = createMockRoute("get", "/filesystem");

// BACKUPS
const getBackupsRoute = createMockRoute("get", "/backups");
const postBackupsRoute = createMockRoute("post", "/backups");
const deleteBackupRoute = createMockRoute("delete", "/backups/:id");
const applyBackupRoute = createMockRoute("get", "/backups/:id/apply");

// API KEYS
const getApiKeysRoute = createMockRoute("get", "/api-keys");
const postApiKeyRoute = createMockRoute("post", "/api-keys");
const patchApiKeyRoute = createMockRoute("patch", "/api-keys/:id");
const deleteApiKeyRoute = createMockRoute("delete", "/api-keys/:id");

// SESSIONS
const PlaybackSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  user: z.object({ id: z.string(), username: z.string() }).nullable()
    .optional(),
  libraryId: z.string(),
  libraryItemId: z.string(),
  mediaType: z.string(),
  mediaMetadata: z.record(z.string(), z.any()).optional(),
  chapters: z.array(z.any()).optional(),
  displayTitle: z.string(),
  displayAuthor: z.string(),
  coverPath: z.string().nullable().optional(),
  duration: z.number(),
  playMethod: z.number(),
  mediaPlayer: z.string(),
  deviceInfo: z.record(z.string(), z.any()).nullable().optional(),
  serverVersion: z.string(),
  date: z.string(),
  dayOfWeek: z.string(),
  timeListening: z.number(),
  startTime: z.number(),
  currentTime: z.number(),
  startedAt: z.number(),
  updatedAt: z.number(),
  audioTracks: z.array(z.any()).optional(),
  libraryItem: z.any().nullable().optional(),
  open: z.boolean().optional(),
}).passthrough();

const GetSessionsResponseSchema = z.object({
  total: z.number(),
  numPages: z.number(),
  page: z.number(),
  itemsPerPage: z.number(),
  sessions: z.array(PlaybackSessionSchema),
  userId: z.string().optional(),
});

const GetOpenSessionsResponseSchema = z.object({
  sessions: z.array(PlaybackSessionSchema),
  shareSessions: z.array(PlaybackSessionSchema),
});

const getSessionsRoute = {
  method: "get" as const,
  path: "/sessions",
  tags: ["settings"],
  responses: {
    200: {
      description: "Paginated listening sessions",
      content: { "application/json": { schema: GetSessionsResponseSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
    500: {
      description: "Internal error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
};

const getOpenSessionsRoute = {
  method: "get" as const,
  path: "/sessions/open",
  tags: ["settings"],
  responses: {
    200: {
      description: "Active open listening sessions",
      content: {
        "application/json": { schema: GetOpenSessionsResponseSchema },
      },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
    500: {
      description: "Internal error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
};

const deleteBatchSessionsRoute = {
  method: "post" as const,
  path: "/sessions/batch/delete",
  tags: ["settings"],
  responses: {
    200: {
      description: "Batch delete result",
      content: {
        "application/json": { schema: z.object({ success: z.boolean() }) },
      },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
    500: {
      description: "Internal error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
};

const deleteSessionRoute = {
  method: "delete" as const,
  path: "/sessions/:id",
  tags: ["settings"],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Session delete result",
      content: {
        "application/json": { schema: z.object({ success: z.boolean() }) },
      },
    },
    400: {
      description: "Bad request",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
    500: {
      description: "Internal error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
};

const closeSessionRoute = {
  method: "post" as const,
  path: "/sessions/:id/close",
  tags: ["settings"],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Close session result",
      content: {
        "application/json": { schema: z.object({ success: z.boolean() }) },
      },
    },
    400: {
      description: "Bad request",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
  },
};

const closeSessionAltRoute = {
  method: "post" as const,
  path: "/session/:id/close",
  tags: ["settings"],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Close session result",
      content: {
        "application/json": { schema: z.object({ success: z.boolean() }) },
      },
    },
    400: {
      description: "Bad request",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
  },
};

// SHARE MEDIA ITEM
const postShareMediaItemRoute = createMockRoute("post", "/share/mediaitem");
const deleteShareMediaItemRoute = createMockRoute(
  "delete",
  "/share/mediaitem/:id",
);

// FEEDS
const getFeedsRoute = createMockRoute("get", "/feeds");
const openFeedRoute = createMockRoute("post", "/feeds/:type/:id/open");
const closeFeedRoute = createMockRoute("post", "/feeds/:id/close");

// CUSTOM METADATA PROVIDERS
const getProvidersRoute = createMockRoute("get", "/custom-metadata-providers");
const postProviderRoute = createMockRoute("post", "/custom-metadata-providers");
const deleteProviderRoute = createMockRoute(
  "delete",
  "/custom-metadata-providers/:id",
);

// GENRES
const deleteGenreRoute = {
  method: "delete" as const,
  path: "/genres/:genre",
  tags: ["settings"],
  request: { params: z.object({ genre: z.string() }) },
  responses: {
    200: {
      description: "Genre deleted",
      content: { "application/json": { schema: MockResultSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
  },
};

const putGenreRoute = {
  method: "put" as const,
  path: "/genres/:genre",
  tags: ["settings"],
  request: {
    params: z.object({ genre: z.string() }),
  },
  responses: {
    200: {
      description: "Genre updated",
      content: { "application/json": { schema: MockResultSchema } },
    },
    400: {
      description: "Invalid payload",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
  },
};

const patchGenreRoute = {
  ...putGenreRoute,
  method: "patch" as const,
};

// TAGS
const deleteTagRoute = {
  method: "delete" as const,
  path: "/tags/:tag",
  tags: ["settings"],
  request: { params: z.object({ tag: z.string() }) },
  responses: {
    200: {
      description: "Tag deleted",
      content: { "application/json": { schema: MockResultSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
  },
};

const putTagRoute = {
  method: "put" as const,
  path: "/tags/:tag",
  tags: ["settings"],
  request: {
    params: z.object({ tag: z.string() }),
  },
  responses: {
    200: {
      description: "Tag updated",
      content: { "application/json": { schema: MockResultSchema } },
    },
    400: {
      description: "Invalid payload",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
  },
};

const patchTagRoute = {
  ...putTagRoute,
  method: "patch" as const,
};

// STORAGE SYNC
const getStorageSyncRoute = {
  method: "get" as const,
  path: "/storage-sync",
  tags: ["settings"],
  responses: {
    200: {
      description: "Storage synced",
      content: { "application/json": { schema: MockResultSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
    500: {
      description: "Server error",
      content: { "application/json": { schema: MockResultSchema } },
    },
  },
};

const postStorageSyncRoute = {
  method: "post" as const,
  path: "/storage-sync",
  tags: ["settings"],
  responses: {
    200: {
      description: "Storage synced",
      content: { "application/json": { schema: MockResultSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
    500: {
      description: "Server error",
      content: { "application/json": { schema: MockResultSchema } },
    },
  },
};

// BACKUP DATABASE
const backupDatabaseRoute = {
  method: "post" as const,
  path: "/backup-database",
  tags: ["settings"],
  responses: {
    200: {
      description: "Database backed up",
      content: { "application/json": { schema: MockResultSchema } },
    },
    403: {
      description: "Admin role required",
      content: { "application/json": { schema: ForbiddenSchema } },
    },
    500: {
      description: "Server error",
      content: { "application/json": { schema: MockResultSchema } },
    },
  },
};

// --- HANDLERS ---

function adminCheck(c: Context<{ Variables: Variables }>) {
  return requireAdminRole(c.get("user"));
}

// MOCKS
settingsRouter.openapi(getFilesystemRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({
    directories: [{ path: "/", dirname: "/", level: 0 }],
    posix: true,
  }, 200);
});

settingsRouter.openapi(getBackupsRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ backups: [] }, 200);
});
settingsRouter.openapi(postBackupsRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ backups: [] }, 200);
});
settingsRouter.openapi(deleteBackupRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ backups: [] }, 200);
});
settingsRouter.openapi(applyBackupRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ success: true }, 200);
});

settingsRouter.openapi(getApiKeysRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ apiKeys: [] }, 200);
});
settingsRouter.openapi(postApiKeyRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ apiKey: { id: "mock", key: "mock", name: "Mock Key" } }, 200);
});
settingsRouter.openapi(patchApiKeyRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ apiKey: { id: "mock", key: "mock", name: "Mock Key" } }, 200);
});
settingsRouter.openapi(deleteApiKeyRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ success: true }, 200);
});

settingsRouter.openapi(getSessionsRoute, async (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabase = c.get("supabase");
  try {
    const url = new URL(c.req.url);
    const page = Math.max(
      1,
      parseInt(url.searchParams.get("page") || "1", 10) || 1,
    );
    const itemsPerPage = Math.max(
      1,
      Math.min(
        100,
        parseInt(url.searchParams.get("itemsPerPage") || "25", 10) || 25,
      ),
    );
    const sortParam = url.searchParams.get("sort") || "updatedAt";
    const descParam = url.searchParams.get("desc");
    const isDesc = descParam === "1" || descParam === "true";
    const userFilter = url.searchParams.get("user") || undefined;

    const sortMap: Record<string, string> = {
      updatedAt: "updated_at",
      createdAt: "created_at",
      displayTitle: "display_title",
      playMethod: "play_method",
      timeListening: "time_listening",
      currentTime: "current_time_pos",
    };
    const dbSortCol = sortMap[sortParam] || "updated_at";

    let query = supabase
      .from("playback_sessions")
      .select("*, profiles:user_id(id, username)", { count: "exact" });

    if (userFilter) {
      query = query.eq("user_id", userFilter);
    }

    const from = (page - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;

    const { data, count, error } = await query
      .order(dbSortCol, { ascending: !isDesc })
      .range(from, to);

    if (error) {
      console.error(
        "[settings/sessions] failed to query playback_sessions:",
        error,
      );
      return c.json({
        total: 0,
        numPages: 1,
        page,
        itemsPerPage,
        sessions: [],
      }, 200);
    }

    const sessions = (data || []).map((row: any) => ({
      id: String(row.id),
      userId: String(row.user_id || ""),
      user: row.profiles
        ? { id: row.profiles.id, username: row.profiles.username }
        : null,
      libraryId: String(row.library_id || ""),
      libraryItemId: String(row.media_item_id || ""),
      mediaType: row.media_item_type || "book",
      mediaMetadata: row.media_metadata || {},
      chapters: [],
      displayTitle: row.display_title || "Unknown Title",
      displayAuthor: row.display_author || "Unknown Author",
      coverPath: row.cover_path || null,
      duration: Number(row.duration) || 0,
      playMethod: Number(row.play_method) || 0,
      mediaPlayer: row.media_player || "Web Player",
      deviceInfo: row.device_info || null,
      serverVersion: row.server_version || "1.0.0",
      date: row.session_date ||
        (row.created_at
          ? new Date(row.created_at).toISOString().split("T")[0]
          : ""),
      dayOfWeek: row.day_of_week || "",
      timeListening: Number(row.time_listening) || 0,
      startTime: 0,
      currentTime: Number(row.current_time_pos) || 0,
      startedAt: row.created_at
        ? new Date(row.created_at).getTime()
        : Date.now(),
      updatedAt: row.updated_at
        ? new Date(row.updated_at).getTime()
        : Date.now(),
      audioTracks: [],
      libraryItem: null,
      open: false,
    }));

    const total = count || 0;
    const numPages = Math.max(1, Math.ceil(total / itemsPerPage));

    return c.json({
      total,
      numPages,
      page,
      itemsPerPage,
      sessions,
      ...(userFilter ? { userId: userFilter } : {}),
    }, 200);
  } catch (err) {
    console.error("[settings/sessions] unexpected error:", err);
    return c.json(
      { error: getErrorMessage(err) || "Failed to fetch sessions" },
      500,
    );
  }
});

settingsRouter.openapi(getOpenSessionsRoute, async (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabase = c.get("supabase");
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("playback_sessions")
      .select("*, profiles:user_id(id, username)")
      .gte("updated_at", fiveMinutesAgo)
      .order("updated_at", { ascending: false });

    if (error) {
      console.warn("[settings/sessions/open] query error:", error);
      return c.json({ sessions: [], shareSessions: [] }, 200);
    }

    const sessions = (data || []).map((row: any) => ({
      id: String(row.id),
      userId: String(row.user_id || ""),
      user: row.profiles
        ? { id: row.profiles.id, username: row.profiles.username }
        : null,
      libraryId: String(row.library_id || ""),
      libraryItemId: String(row.media_item_id || ""),
      mediaType: row.media_item_type || "book",
      mediaMetadata: row.media_metadata || {},
      chapters: [],
      displayTitle: row.display_title || "Unknown Title",
      displayAuthor: row.display_author || "Unknown Author",
      coverPath: row.cover_path || null,
      duration: Number(row.duration) || 0,
      playMethod: Number(row.play_method) || 0,
      mediaPlayer: row.media_player || "Web Player",
      deviceInfo: row.device_info || null,
      serverVersion: row.server_version || "1.0.0",
      date: row.session_date ||
        (row.created_at
          ? new Date(row.created_at).toISOString().split("T")[0]
          : ""),
      dayOfWeek: row.day_of_week || "",
      timeListening: Number(row.time_listening) || 0,
      startTime: 0,
      currentTime: Number(row.current_time_pos) || 0,
      startedAt: row.created_at
        ? new Date(row.created_at).getTime()
        : Date.now(),
      updatedAt: row.updated_at
        ? new Date(row.updated_at).getTime()
        : Date.now(),
      audioTracks: [],
      libraryItem: null,
      open: true,
    }));

    return c.json({ sessions, shareSessions: [] }, 200);
  } catch (err) {
    console.error("[settings/sessions/open] unexpected error:", err);
    return c.json({ sessions: [], shareSessions: [] }, 200);
  }
});

settingsRouter.openapi(deleteBatchSessionsRoute, async (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabase = c.get("supabase");
  try {
    const body = await c.req.json().catch(() => ({}));
    const sessionIds = Array.isArray(body?.sessionIds) ? body.sessionIds : [];
    if (sessionIds.length > 0) {
      const { error } = await supabase
        .from("playback_sessions")
        .delete()
        .in("id", sessionIds);
      if (error) {
        console.error("[settings/sessions/batch/delete] error:", error);
        return c.json({ error: error.message }, 500);
      }
    }
    return c.json({ success: true }, 200);
  } catch (err) {
    console.error("[settings/sessions/batch/delete] unexpected error:", err);
    return c.json(
      { error: getErrorMessage(err) || "Failed to batch delete sessions" },
      500,
    );
  }
});

settingsRouter.openapi(deleteSessionRoute, async (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing session id" }, 400);

  const { error } = await supabase
    .from("playback_sessions")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(`[settings/sessions] delete error for ${id}:`, error);
    return c.json({ error: error.message }, 500);
  }
  return c.json({ success: true }, 200);
});

const handleCloseSession = async (c: Context<{ Variables: Variables }>) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing session id" }, 400);

  await supabase
    .from("playback_sessions")
    .update({
      updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    })
    .eq("id", id);

  return c.json({ success: true }, 200);
};

settingsRouter.openapi(closeSessionRoute, handleCloseSession);
settingsRouter.openapi(closeSessionAltRoute, handleCloseSession);

settingsRouter.openapi(postShareMediaItemRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({
    id: "mock-share",
    libraryItemId: "mock",
    slug: "mock-share",
    expiresAt: null,
    createdAt: Date.now(),
  }, 200);
});
settingsRouter.openapi(deleteShareMediaItemRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ success: true }, 200);
});

settingsRouter.openapi(getFeedsRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ feeds: [] }, 200);
});
settingsRouter.openapi(openFeedRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({
    feed: {
      id: "mock",
      entityId: "mock",
      entityType: "item",
      coverPath: "",
      episodes: [],
    },
  }, 200);
});
settingsRouter.openapi(closeFeedRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ success: true }, 200);
});

settingsRouter.openapi(getProvidersRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ customMetadataProviders: [] }, 200);
});
settingsRouter.openapi(postProviderRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ provider: { id: "mock", name: "Mock Provider" } }, 200);
});
settingsRouter.openapi(deleteProviderRoute, (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  return c.json({ success: true }, 200);
});

// REAL ENDPOINTS
settingsRouter.openapi(deleteGenreRoute, async (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabase = c.get("supabase");
  const { genre } = c.req.valid("param");

  const { data: books } = await supabase.from("library_items").select(
    "id, genres",
  );
  let numItemsUpdated = 0;
  for (const book of books ?? []) {
    const genres = book.genres as string[] | null;
    if (Array.isArray(genres) && genres.includes(genre)) {
      const newGenres = genres.filter((g) => g !== genre);
      await supabase.from("library_items").update({ genres: newGenres }).eq(
        "id",
        book.id,
      );
      numItemsUpdated++;
    }
  }
  return c.json({ numItemsUpdated }, 200);
});

const handlePutGenre = async (c: Context<{ Variables: Variables }>) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabase = c.get("supabase");
  const genre = c.req.param("genre");
  if (!genre) return c.json({ error: "Missing genre param" }, 400);

  let body;
  try {
    body = await c.req.json();
  } catch (_e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const parsed = GenreUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload" }, 400);
  }
  const newGenreName = parsed.data.newGenreName;

  const { data: books } = await supabase.from("library_items").select(
    "id, genres",
  );
  let numItemsUpdated = 0;
  let genreMerged = false;
  for (const book of books ?? []) {
    const genres = book.genres as string[] | null;
    if (Array.isArray(genres) && genres.includes(genre)) {
      const newGenres = genres.map((g) => (g === genre ? newGenreName : g));
      if (
        newGenres.includes(newGenreName) &&
        newGenres.filter((g) => g === newGenreName).length > 1
      ) {
        genreMerged = true;
      }
      await supabase
        .from("library_items")
        .update({
          genres: [...new Set(newGenres)],
        })
        .eq("id", book.id);
      numItemsUpdated++;
    }
  }
  return c.json({ genreMerged, numItemsUpdated }, 200);
};

settingsRouter.openapi(putGenreRoute, handlePutGenre);
settingsRouter.openapi(patchGenreRoute, handlePutGenre);

settingsRouter.openapi(deleteTagRoute, async (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabase = c.get("supabase");
  const { tag } = c.req.valid("param");

  const { data: books } = await supabase.from("library_items").select(
    "id, tags",
  );
  let numItemsUpdated = 0;
  for (const book of books ?? []) {
    const tags = book.tags as string[] | null;
    if (Array.isArray(tags) && tags.includes(tag)) {
      const newTags = tags.filter((t) => t !== tag);
      await supabase.from("library_items").update({ tags: newTags }).eq(
        "id",
        book.id,
      );
      numItemsUpdated++;
    }
  }
  return c.json({ numItemsUpdated }, 200);
});

const handlePutTag = async (c: Context<{ Variables: Variables }>) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabase = c.get("supabase");
  const tag = c.req.param("tag");
  if (!tag) return c.json({ error: "Missing tag param" }, 400);

  let body;
  try {
    body = await c.req.json();
  } catch (_e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const parsed = TagUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload" }, 400);
  }
  const newTagName = parsed.data.newTagName;

  const { data: books } = await supabase.from("library_items").select(
    "id, tags",
  );
  let numItemsUpdated = 0;
  let tagMerged = false;
  for (const book of books ?? []) {
    const tags = book.tags as string[] | null;
    if (Array.isArray(tags) && tags.includes(tag)) {
      const newTags = tags.map((t) => (t === tag ? newTagName : t));
      if (newTags.filter((t) => t === newTagName).length > 1) {
        tagMerged = true;
      }
      await supabase
        .from("library_items")
        .update({
          tags: [...new Set(newTags)],
        })
        .eq("id", book.id);
      numItemsUpdated++;
    }
  }
  return c.json({ tagMerged, numItemsUpdated }, 200);
};

settingsRouter.openapi(putTagRoute, handlePutTag);
settingsRouter.openapi(patchTagRoute, handlePutTag);

// 10x pro: real storage sync – compares Supabase Storage vs DB, reports orphans
// and can prune them (action=prune). Never auto-prunes without explicit ?action=prune.
async function handleStorageSync(c: Context<{ Variables: Variables }>) {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabase = c.get("supabase");
  const url = new URL(c.req.url);
  const action = url.searchParams.get("action"); // null | prune | migrate-check
  const bucketParam = url.searchParams.get("bucket") || "all"; // audio-files | covers | all

  try {
    // Snapshot quota via DB helper (works with service_role)
    let quota: any = null;
    try {
      const { data: snap } = await (supabase as any).rpc(
        "storage_quota_snapshot",
      );
      if (Array.isArray(snap)) {
        const total = snap.find((r: any) => r.bucket_id === "_total");
        quota = {
          totalBytes: Number((total as any)?.total_bytes ?? 0),
          buckets: snap.filter((r: any) => r.bucket_id !== "_total").map((
            r: any,
          ) => ({
            bucket: r.bucket_id,
            count: Number(r.object_count),
            bytes: Number(r.total_bytes),
            pretty: r.pretty,
          })),
        };
      }
    } catch { /* RPC may not exist locally */ }

    // Fallback if RPC unavailable
    if (!quota) {
      const { data: audioList } = await supabase.storage.from("audio-files")
        .list("", { limit: 1000 });
      const { data: coverList } = await supabase.storage.from("covers").list(
        "",
        { limit: 1000 },
      );
      quota = {
        totalBytes: 0,
        buckets: [
          {
            bucket: "audio-files",
            count: audioList?.length ?? 0,
            bytes: 0,
            pretty: "unknown",
          },
          {
            bucket: "covers",
            count: coverList?.length ?? 0,
            bytes: 0,
            pretty: "unknown",
          },
        ],
      };
    }

    // Deep orphan scan – paginated storage.objects via list() recursion
    const listAllObjects = async (
      bucket: string,
    ): Promise<Array<{ name: string; size: number; created_at?: string }>> => {
      const out: Array<{ name: string; size: number; created_at?: string }> =
        [];
      // Top-level prefixes are UUID folders; list each prefix
      const { data: top } = await supabase.storage.from(bucket).list("", {
        limit: 1000,
      });
      const prefixes = (top || []).filter((f: any) =>
        f.id === null && f.name && !f.name.startsWith(".")
      ).map((f: any) => f.name);
      // Also include files at root (unlikely)
      for (const f of (top || []).filter((x: any) => x.id !== null)) {
        out.push({ name: f.name, size: f.metadata?.size ?? 0 });
      }

      for (const pref of prefixes) {
        let offset = 0;
        for (;;) {
          const { data } = await supabase.storage.from(bucket).list(pref, {
            limit: 1000,
            offset,
          });
          if (!data || data.length === 0) break;
          for (const obj of data as any[]) {
            if (obj.id !== null) {
              out.push({
                name: `${pref}/${obj.name}`,
                size: obj.metadata?.size ?? 0,
                created_at: obj.created_at,
              });
            } // nested folders (e.g. authors/<uuid>/photo.jpg) – one more level
            else if (obj.name && !obj.name.startsWith(".")) {
              const subPref = `${pref}/${obj.name}`;
              const { data: sub } = await supabase.storage.from(bucket).list(
                subPref,
                { limit: 1000 },
              );
              for (const s of (sub || []) as any[]) {
                if (s.id !== null) {
                  out.push({
                    name: `${subPref}/${s.name}`,
                    size: s.metadata?.size ?? 0,
                    created_at: s.created_at,
                  });
                }
              }
            }
          }
          if (data.length < 1000) break;
          offset += 1000;
        }
      }
      return out;
    };

    const bucketsToScan = bucketParam === "all"
      ? ["audio-files", "covers"]
      : [bucketParam];
    const { data: items } = await supabase.from("library_items").select(
      "id, title, cover_path, audio_files, library_files",
    );
    const idSet = new Set((items || []).map((i: any) => i.id));
    const coverMap = new Map(
      (items || []).map((i: any) => [i.id, i.cover_path]),
    );
    const audioNameSet = new Map<string, Set<string>>();
    for (const it of (items || []) as any[]) {
      const s = new Set<string>();
      for (const af of (it.audio_files || []) as any[]) {
        const n = String(af?.metadata?.filename ?? af?.metadata?.relPath ?? "")
          .trim();
        if (n) s.add(n);
        const p = String(af?.metadata?.path ?? "");
        const leaf = p.split("/").pop() || "";
        if (leaf) s.add(leaf);
      }
      audioNameSet.set(it.id, s);
    }

    let totalOrphans: Array<any> = [];
    let totalScanned = 0;
    let totalBytes = 0;
    const perBucket: Record<
      string,
      { scanned: number; orphans: number; bytes: number }
    > = {};

    for (const bucket of bucketsToScan) {
      const objs = await listAllObjects(bucket);
      totalScanned += objs.length;
      let orphans: Array<any> = [];
      let orphanBytes = 0;
      for (const o of objs) {
        totalBytes += o.size;
        const folder = o.name.split("/")[0];
        const file = o.name.split("/").pop() || "";
        let isOrphan = false;
        let reason = "";
        if (bucket === "covers") {
          if (o.name.startsWith("authors/")) {
            // authors/<uuid>/photo.* – check authors table
            const authorId = o.name.split("/")[1];
            const { data: author } = await supabase.from("authors").select("id")
              .eq("id", authorId).maybeSingle();
            if (!author) {
              isOrphan = true;
              reason = "author missing";
            }
          } else {
            // covers/<uuid>/cover.*
            if (!idSet.has(folder)) {
              isOrphan = true;
              reason = "library_item missing";
            } else {
              const expected = coverMap.get(folder);
              if (
                expected && expected !== o.name &&
                expected !== `covers/${o.name}`
              ) {
                // file for this item but not the current cover_path – likely stale cover (e.g. cover.jpg vs cover.png)
                // Only orphan if the DB cover_path does not match this file and file is not the same prefix
                const base = expected.split("/").pop();
                if (file !== base) {
                  isOrphan = true;
                  reason = `stale cover (expected ${base})`;
                }
              }
              // Also orphan if filename not in item's audio? No, covers are independent
            }
          }
        } else { // audio-files
          if (!idSet.has(folder)) {
            isOrphan = true;
            reason = "library_item missing";
          } else {
            const names = audioNameSet.get(folder);
            if (names && names.size > 0 && !names.has(file)) {
              // File exists in bucket but not referenced in DB – orphan or renamed file
              isOrphan = true;
              reason = "filename not in audio_files";
            }
          }
          // Special: Supabase `._*` AppleDouble and empty 4096-byte files from import script are orphans
          if (
            file.startsWith("._") || (file.startsWith("._") && o.size === 4096)
          ) {
            isOrphan = true;
            reason = "AppleDouble";
          }
          if (o.size === 4096 && file.startsWith("._")) {
            isOrphan = true;
            reason = "AppleDouble 4K";
          }
        }
        if (isOrphan) {
          orphans.push({
            bucket,
            name: o.name,
            file,
            folder,
            size: o.size,
            pretty: `${(o.size / 1024 / 1024).toFixed(2)} MB`,
            reason,
            created_at: o.created_at,
          });
          orphanBytes += o.size;
        }
      }

      // Prune if requested
      let pruned = 0, prunedBytes = 0, pruneErrors: string[] = [];
      if (action === "prune" && orphans.length > 0) {
        // Safety: never prune more than 200 objects per call; require pagination via ?offset
        const batch = orphans.slice(0, 200);
        const byBucket = new Map<string, string[]>();
        for (const o of batch) {
          if (!byBucket.has(o.bucket)) byBucket.set(o.bucket, []);
          byBucket.get(o.bucket)!.push(o.name);
        }
        for (const [b, names] of byBucket) {
          const { error } = await supabase.storage.from(b).remove(names);
          if (error) pruneErrors.push(`${b}: ${error.message}`);
          else {
            pruned += names.length;
            prunedBytes += batch.filter((x) => x.bucket === b).reduce(
              (s, x) => s + x.size,
              0,
            );
          }
        }
        // Return pruned subset
        orphans = batch;
      }

      perBucket[bucket] = {
        scanned: objs.length,
        orphans: orphans.length,
        bytes: orphanBytes,
      };
      totalOrphans.push(...orphans);
      if (action === "prune") {
        return c.json({
          synced: true,
          pruned: true,
          bucket,
          perBucket,
          quota,
          orphans: totalOrphans.slice(0, 100),
          totalScanned,
          message: `Pruned ${totalOrphans.length} orphan objects (${
            (orphanBytes / 1024 / 1024).toFixed(1)
          } MB) from ${bucket}. Re-run to prune next batch.`,
          pruneErrors,
        }, 200);
      }
    }

    const orphanBytes = totalOrphans.reduce(
      (s: number, o: any) => s + o.size,
      0,
    );
    return c.json({
      synced: true,
      perBucket,
      quota,
      orphans: totalOrphans.slice(0, 200),
      totalScanned,
      totalOrphanBytes: orphanBytes,
      totalOrphanPretty: `${(orphanBytes / 1024 / 1024).toFixed(1)} MB / ${
        (orphanBytes / 1024 / 1024 / 1024).toFixed(2)
      } GB`,
      message: totalOrphans.length
        ? `Found ${totalOrphans.length} orphan objects (${
          (orphanBytes / 1024 / 1024).toFixed(1)
        } MB). Call POST ?action=prune to delete (max 200 per call). Migrate Supabase audio-files to B2 first if needed.`
        : "No orphans – storage matches DB.",
      hint: quota?.totalBytes > 1073741824
        ? "Over 1 GiB free quota – run prune after B2 migration or upgrade to Pro (100 GiB via server_settings.storage_quota_bytes)."
        : undefined,
    }, 200);
  } catch (e: unknown) {
    return c.json({
      synced: false,
      error: getErrorMessage(e),
      orphans: [],
      totalAudioFiles: 0,
    }, 500);
  }
}

settingsRouter.openapi(getStorageSyncRoute, handleStorageSync);
settingsRouter.openapi(postStorageSyncRoute, handleStorageSync);

settingsRouter.openapi(backupDatabaseRoute, async (c) => {
  if (!adminCheck(c)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const supabase = c.get("supabase");
  try {
    const libraries = await supabase.from("libraries").select("*").limit(1000);
    const libraryItems = await supabase.from("library_items").select("*").limit(
      1000,
    );
    const mediaProgress = await supabase.from("media_progress").select("*")
      .limit(1000);

    const backupData = {
      timestamp: new Date().toISOString(),
      libraries: libraries.data || [],
      libraryItems: libraryItems.data || [],
      mediaProgress: mediaProgress.data || [],
    };

    const filename = `backup-${new Date().toISOString().split("T")[0]}.json`;
    await supabase.storage.from("backups").upload(
      filename,
      JSON.stringify(backupData, null, 2),
      { contentType: "application/json", upsert: true },
    );

    return c.json({
      success: true,
      message: "Backup created",
      filename,
    }, 200);
  } catch (e: unknown) {
    return c.json({
      success: false,
      error: getErrorMessage(e),
    }, 500);
  }
});
