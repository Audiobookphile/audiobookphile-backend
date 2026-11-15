import { buildUserPayload } from "../_shared/payloads.ts";
import { createOpenApiRouter, z } from "../_shared/openapi.ts";

export const meRouter = createOpenApiRouter();

const ServerErrorSchema = z.object({ error: z.string() });

const PermissionsSchema = z.object({
  download: z.boolean(),
  update: z.boolean(),
  delete: z.boolean(),
  upload: z.boolean(),
  accessAllLibraries: z.boolean(),
  accessAllTags: z.boolean(),
  accessExplicitContent: z.boolean(),
});

const MeProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().nullable(),
  type: z.string(),
  token: z.string(),
  refreshToken: z.string().nullable(),
  mediaProgress: z.array(z.unknown()),
  seriesHideFromContinueListening: z.array(z.unknown()),
  bookmarks: z.array(z.unknown()),
  isActive: z.boolean(),
  isLocked: z.boolean(),
  lastSeen: z.number(),
  createdAt: z.number(),
  permissions: PermissionsSchema,
  librariesAccessible: z.array(z.unknown()),
  itemTagsAccessible: z.array(z.unknown()),
  userDefaultLibraryId: z.string().nullable(),
  serverSettings: z.object({}).passthrough(),
  source: z.string(),
}).passthrough();

const MediaProgressSchema = z.object({
  id: z.string(),
  library_item_id: z.string(),
  duration: z.number().nullable(),
  progress: z.number().nullable(),
  is_finished: z.boolean().nullable(),
  finished_at: z.string().nullable(),
  last_update: z.string().nullable(),
  started_at: z.string().nullable(),
  title: z.string().nullable(),
});

const RecentSessionSchema = z.object({
  id: z.string(),
  display_title: z.string().nullable(),
  display_author: z.string().nullable(),
  time_listening: z.number().nullable(),
  session_date: z.string().nullable(),
  updated_at: z.string(),
});

const meProfileRoute = {
  method: "get" as const,
  path: "/",
  tags: ["me"],
  responses: {
    200: {
      description: "Current user profile payload",
      content: { "application/json": { schema: MeProfileSchema } },
    },
    500: {
      description: "Profile fetch failure",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const meStatsRoute = {
  method: "get" as const,
  path: "/stats",
  tags: ["me"],
  responses: {
    200: {
      description: "User listening stats and recent sessions",
      content: {
        "application/json": {
          schema: z.object({
            mediaProgress: z.array(MediaProgressSchema),
            recentSessions: z.array(RecentSessionSchema),
          }),
        },
      },
    },
    500: {
      description: "Stats fetch failure",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

meRouter.openapi(meProfileRoute, async (c: any) => {
  const user = c.get("user")!;
  const supabase = c.get("supabase");

  try {
    const { data: profile, error } = await supabase.from("profiles").select("*")
      .eq("id", user.id).single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    const authorization = c.req.header("authorization") || "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");

    const userPayload = buildUserPayload(profile as any, {
      access_token: accessToken,
      refresh_token: null,
    }, {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
    });

    return c.json(
      {
        ...userPayload.user,
        ...userPayload,
        email: user.email,
        id: user.id,
      },
      200,
    );
  } catch (err: any) {
    console.error("[me] profile fetch failed:", err);
    return c.json({ error: "Failed to fetch profile" }, 500);
  }
});

meRouter.openapi(meStatsRoute, async (c: any) => {
  const user = c.get("user")!;
  const supabase = c.get("supabase");

  try {
    // Fetch media progress joined with library_items for title
    const { data: progressData, error: progressError } = await supabase
      .from("media_progress")
      .select(
        `
        id,
        library_item_id,
        duration,
        progress,
        is_finished,
        finished_at,
        last_update,
        started_at,
        library_items ( title )
      `,
      )
      .eq("user_id", user.id)
      .order("last_update", { ascending: false });

    if (progressError) throw progressError;

    // Fetch recent playback sessions
    const { data: sessionsData, error: sessionsError } = await supabase
      .from("playback_sessions")
      .select(
        "id, display_title, display_author, time_listening, session_date, updated_at",
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (sessionsError) throw sessionsError;

    const mediaProgress = (progressData ?? []).map((row: any) => ({
      id: row.id,
      library_item_id: row.library_item_id,
      duration: row.duration ?? null,
      progress: row.progress ?? null,
      is_finished: row.is_finished ?? null,
      finished_at: row.finished_at ?? null,
      last_update: row.last_update ?? null,
      started_at: row.started_at ?? null,
      title: row.library_items?.title ?? null,
    }));

    const recentSessions = (sessionsData ?? []).map((row: any) => ({
      id: row.id,
      display_title: row.display_title ?? null,
      display_author: row.display_author ?? null,
      time_listening: row.time_listening ?? null,
      session_date: row.session_date ?? null,
      updated_at: row.updated_at,
    }));

    return c.json({ mediaProgress, recentSessions }, 200);
  } catch (err: any) {
    console.error("[me] stats failed:", err);
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

const ContinueSeriesItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  cover_path: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  num_tracks: z.number().nullable().optional(),
  series: z.object({
    id: z.string(),
    name: z.string(),
    sequence: z.string().nullable().optional(),
  }),
  authors: z.array(z.string()).optional(),
  prior_finished_title: z.string().optional(),
});

const ContinueSeriesResponseSchema = z.object({
  items: z.array(ContinueSeriesItemSchema),
});

const meContinueSeriesRoute = {
  method: "get" as const,
  path: "/continue-series",
  tags: ["me"],
  responses: {
    200: {
      description:
        "List of recommended next books in series where prior books were finished",
      content: { "application/json": { schema: ContinueSeriesResponseSchema } },
    },
    500: {
      description: "Fetch failure",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

meRouter.openapi(meContinueSeriesRoute, async (c: any) => {
  const user = c.get("user")!;
  const supabase = c.get("supabase");

  try {
    // 1. Fetch finished items for this user
    const { data: progressData, error: progressError } = await supabase
      .from("media_progress")
      .select("library_item_id, library_items(id, title)")
      .eq("user_id", user.id)
      .eq("is_finished", true);

    if (progressError) throw progressError;

    if (!progressData || progressData.length === 0) {
      return c.json({ items: [] }, 200);
    }

    const finishedMap = new Map<string, string>();
    for (const p of progressData) {
      finishedMap.set(p.library_item_id, (p.library_items as any)?.title || "");
    }
    const finishedItemIds = Array.from(finishedMap.keys());

    // 2. Fetch series for these finished items
    const { data: finishedSeriesData, error: fsError } = await supabase
      .from("book_series")
      .select("series_id, sequence, library_item_id, series(id, name)")
      .in("library_item_id", finishedItemIds);

    if (fsError) throw fsError;
    if (!finishedSeriesData || finishedSeriesData.length === 0) {
      return c.json({ items: [] }, 200);
    }

    // Map series_id -> { series, maxSeq, finishedTitle }
    const seriesMaxMap = new Map<
      string,
      { series: any; maxSeq: number; finishedTitle: string }
    >();
    for (const row of finishedSeriesData) {
      if (!row.series_id || !row.series) continue;
      const seq = parseFloat(row.sequence) || 0;
      const existing = seriesMaxMap.get(row.series_id);
      if (!existing || seq > existing.maxSeq) {
        seriesMaxMap.set(row.series_id, {
          series: row.series,
          maxSeq: seq,
          finishedTitle: finishedMap.get(row.library_item_id) || "",
        });
      }
    }

    const targetSeriesIds = Array.from(seriesMaxMap.keys());
    if (targetSeriesIds.length === 0) {
      return c.json({ items: [] }, 200);
    }

    // 3. Query all books in these series
    const { data: allSeriesBooks, error: allBooksError } = await supabase
      .from("book_series")
      .select(`
        series_id,
        sequence,
        library_items (
          id,
          title,
          cover_path,
          duration,
          num_tracks,
          book_authors ( authors ( id, name ) )
        )
      `)
      .in("series_id", targetSeriesIds);

    if (allBooksError) throw allBooksError;

    // 4. For each series, find the next uncompleted book with sequence > maxSeq
    const nextBooks: any[] = [];
    for (const [seriesId, meta] of seriesMaxMap.entries()) {
      const candidates = (allSeriesBooks || [])
        .filter((bs: any) => bs.series_id === seriesId && bs.library_items)
        .map((bs: any) => ({
          ...bs,
          seqVal: parseFloat(bs.sequence) || 0,
        }))
        .filter((bs: any) =>
          bs.seqVal > meta.maxSeq && !finishedMap.has(bs.library_items.id)
        )
        .sort((a: any, b: any) => a.seqVal - b.seqVal);

      if (candidates.length > 0) {
        const nextInSeries = candidates[0];
        const item = nextInSeries.library_items;
        const authors = (item.book_authors || [])
          .map((ba: any) => ba.authors?.name)
          .filter(Boolean);

        nextBooks.push({
          id: item.id,
          title: item.title,
          cover_path: item.cover_path ?? null,
          duration: item.duration ?? null,
          num_tracks: item.num_tracks ?? null,
          series: {
            id: meta.series.id,
            name: meta.series.name,
            sequence: nextInSeries.sequence != null
              ? String(nextInSeries.sequence)
              : null,
          },
          authors,
          prior_finished_title: meta.finishedTitle,
        });
      }
    }

    return c.json({ items: nextBooks }, 200);
  } catch (err: any) {
    console.error("[me] continue-series failed:", err);
    return c.json({ error: "Failed to fetch continue-series" }, 500);
  }
});
