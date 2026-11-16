import { createOpenApiRouter, z } from "../_shared/openapi.ts";

// ===== Zod schemas for bookmark endpoints =====
export const BookmarkCreateSchema = z.object({
  library_item_id: z.string().uuid("Invalid library item ID"),
  time_pos: z.number().min(0).max(999999), // milliseconds up to ~12.5 hours
  title: z.string().max(256).optional(),
  note: z.string().max(4000).optional(),
});

export const BookmarkUpdateSchema = z.object({
  time_pos: z.number().min(0).max(999999).optional(),
  title: z.string().max(256).optional(),
  note: z.string().max(4000).optional(),
});

export const bookmarksRouter = createOpenApiRouter();

function formatTime(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const sec = total % 60;
  const min = Math.floor((total / 60) % 60);
  const hr = Math.floor(total / 3600);
  if (hr > 0) {
    return `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}:${
      String(sec).padStart(2, "0")
    }`;
  }
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const ServerErrorSchema = z.object({ error: z.string() });
const BookmarkResultSchema = z.object({
  bookmark: z.record(z.string(), z.any()),
});
const BookmarkListSchema = z.object({
  bookmarks: z.array(z.record(z.string(), z.any())),
});
const SuccessSchema = z.object({ success: z.boolean() });

const exportBookmarksRoute = {
  method: "get" as const,
  path: "/export",
  tags: ["bookmarks"],
  responses: {
    200: {
      description: "Exported bookmarks formatted as markdown, csv, or json",
    },
    400: {
      description: "Missing or invalid libraryItemId",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
    500: {
      description: "Query failure",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const listBookmarksRoute = {
  method: "get" as const,
  path: "/",
  tags: ["bookmarks"],
  responses: {
    200: {
      description: "List of bookmarks for a library item",
      content: { "application/json": { schema: BookmarkListSchema } },
    },
    400: {
      description: "Missing or invalid libraryItemId",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
    500: {
      description: "Query failure",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const createBookmarkRoute = {
  method: "post" as const,
  path: "/",
  tags: ["bookmarks"],
  request: {
    body: {
      content: {
        "application/json": { schema: BookmarkCreateSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Bookmark created",
      content: { "application/json": { schema: BookmarkResultSchema } },
    },
    400: {
      description: "Invalid payload",
      content: {
        "application/json": {
          schema: z.record(z.string(), z.any()),
        },
      },
    },
    500: {
      description: "Database error",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const updateBookmarkRoute = {
  method: "patch" as const,
  path: "/:id",
  tags: ["bookmarks"],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "Bookmark updated",
      content: { "application/json": { schema: BookmarkResultSchema } },
    },
    400: {
      description: "Invalid payload",
      content: {
        "application/json": {
          schema: z.record(z.string(), z.any()),
        },
      },
    },
    500: {
      description: "Database error",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const deleteBookmarkRoute = {
  method: "delete" as const,
  path: "/:id",
  tags: ["bookmarks"],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "Bookmark deleted",
      content: { "application/json": { schema: SuccessSchema } },
    },
    500: {
      description: "Database error",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

bookmarksRouter.openapi(listBookmarksRoute, async (c) => {
  const user = c.get("user")!;
  const supabase: any = c.get("supabase");

  let libraryItemId = c.req.query("libraryItemId");
  if (!libraryItemId) {
    return c.json({ error: "libraryItemId query parameter is required" }, 400);
  }

  // Validate UUID format with Zod
  const uuidSchema = z.string().uuid();
  const parsed = uuidSchema.safeParse(libraryItemId);
  if (!parsed.success) {
    return c.json({ error: "Invalid library item ID (UUID required)" }, 400);
  }

  libraryItemId = parsed.data;

  const { data: bookmarks, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", user.id)
    .eq("library_item_id", libraryItemId)
    .order("time_pos", { ascending: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ bookmarks: bookmarks || [] }, 200);
});

bookmarksRouter.openapi(exportBookmarksRoute, async (c) => {
  const user = c.get("user")!;
  const supabase: any = c.get("supabase");

  let libraryItemId = c.req.query("libraryItemId");
  if (!libraryItemId) {
    return c.json({ error: "libraryItemId query parameter is required" }, 400);
  }

  const uuidSchema = z.string().uuid();
  const parsed = uuidSchema.safeParse(libraryItemId);
  if (!parsed.success) {
    return c.json({ error: "Invalid library item ID (UUID required)" }, 400);
  }
  libraryItemId = parsed.data;

  const format = (c.req.query("format") || "markdown").toLowerCase();

  // Fetch book details & authors
  const { data: item } = await supabase
    .from("library_items")
    .select("id, title, duration, book_authors(authors(name))")
    .eq("id", libraryItemId)
    .maybeSingle();

  const title = item?.title || "Audiobook";
  const authors = (item?.book_authors || [])
    .map((ba: any) => ba.authors?.name)
    .filter(Boolean)
    .join(", ");

  const { data: bookmarks, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", user.id)
    .eq("library_item_id", libraryItemId)
    .order("time_pos", { ascending: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const list = bookmarks || [];
  const safeFilename = title.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();

  if (format === "json") {
    return c.json({
      title,
      authors: authors || null,
      libraryItemId,
      exportedAt: new Date().toISOString(),
      bookmarks: list.map((b: any) => ({
        id: b.id,
        timePosMs: b.time_pos,
        timePosSeconds: Math.round((b.time_pos / 1000) * 10) / 10,
        formattedTime: formatTime(b.time_pos / 1000),
        title: b.title,
        note: b.note,
        createdAt: b.created_at,
      })),
    }, 200);
  }

  if (format === "csv") {
    const csvRows = [
      ["Title", "TimeSeconds", "Timestamp", "Note", "CreatedAt"].join(","),
    ];
    for (const b of list) {
      const timeSec = Math.round(b.time_pos / 1000);
      const timeFormatted = formatTime(timeSec);
      const escapeCsv = (val: string | null | undefined) =>
        `"${(val || "").replace(/"/g, '""')}"`;
      csvRows.push([
        escapeCsv(b.title || `Bookmark at ${timeFormatted}`),
        timeSec,
        escapeCsv(timeFormatted),
        escapeCsv(b.note),
        escapeCsv(b.created_at),
      ].join(","));
    }
    const csvContent = csvRows.join("\n");
    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          `attachment; filename="${safeFilename}-bookmarks.csv"`,
      },
    });
  }

  // Markdown format (default)
  const lines: string[] = [
    `# Bookmarks & Notes: ${title}`,
    authors ? `**Author:** ${authors}` : "",
    `**Exported:** ${new Date().toISOString().slice(0, 10)}`,
    `**Total Bookmarks:** ${list.length}`,
    "",
    "---",
    "",
  ].filter((l) => l !== "");

  if (list.length === 0) {
    lines.push("_No bookmarks recorded for this title._");
  } else {
    for (const b of list) {
      const timeFormatted = formatTime(b.time_pos / 1000);
      const bmTitle = b.title || `Bookmark at ${timeFormatted}`;
      lines.push(`### [${timeFormatted}] ${bmTitle}`);
      if (b.note && b.note.trim()) {
        const quotedNote = b.note
          .trim()
          .split("\n")
          .map((line: string) => `> ${line}`)
          .join("\n");
        lines.push(quotedNote);
      }
      lines.push("");
    }
  }

  const markdownContent = lines.join("\n");
  return new Response(markdownContent, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition":
        `attachment; filename="${safeFilename}-bookmarks.md"`,
    },
  });
});

bookmarksRouter.openapi(createBookmarkRoute, async (c) => {
  const user = c.get("user")!;
  const supabase: any = c.get("supabase");

  let body;
  try {
    body = await c.req.json();
  } catch (_e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Validate with Zod schema
  const parsed = BookmarkCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { library_item_id, time_pos, title, note } = parsed.data;

  const { data: bookmark, error } = await supabase
    .from("bookmarks")
    .insert({
      user_id: user.id,
      library_item_id,
      time_pos,
      title: title || null,
      note: note || null,
    })
    .select("*")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ bookmark }, 200);
});

bookmarksRouter.openapi(updateBookmarkRoute, async (c) => {
  const user = c.get("user")!;
  const supabase: any = c.get("supabase");
  const { id } = c.req.valid("param");

  let body;
  try {
    body = await c.req.json();
  } catch (_e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Validate with Zod schema (some fields can be omitted for partial updates)
  const parsed = BookmarkUpdateSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { time_pos, title, note } = parsed.data;

  const updates: any = {};
  if (time_pos !== undefined) updates.time_pos = time_pos;
  if (title !== undefined) updates.title = title;
  if (note !== undefined) updates.note = note || null;

  const { data: bookmark, error } = await supabase.from("bookmarks").update(
    updates,
  ).eq("id", id).eq("user_id", user.id).select("*").single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ bookmark }, 200);
});

bookmarksRouter.openapi(deleteBookmarkRoute, async (c) => {
  const user = c.get("user")!;
  const supabase: any = c.get("supabase");
  const { id } = c.req.valid("param");

  const { error } = await supabase.from("bookmarks").delete().eq("id", id).eq(
    "user_id",
    user.id,
  );

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true }, 200);
});
