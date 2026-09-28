import { createOpenApiRouter, z } from "../_shared/openapi.ts";

export const playlistsRouter = createOpenApiRouter();

// ===== Zod schemas for playlist endpoints =====
const PlaylistCreateSchema = z.object({
  libraryId: z.string().min(1),
  name: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
  items: z.array(z.string()).optional(), // array of library item IDs (auto-ordered)
});

const PlaylistUpdateSchema = z.object({
  name: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
});

const PlaylistItemsAddSchema = z.array(
  z.object({
    libraryItemId: z.string().uuid(),
    order: z.number().optional(),
  }),
);

const PlaylistItemDeleteSchema = z.object({
  libraryItemId: z.string().uuid(),
});

/**
 * Payload shapes for "add to" and "remove from" a playlist.
 *
 * The web client speaks `{ items: [...] }` for both, while this file originally
 * accepted a bare array for add and a single `{libraryItemId}` for remove. Neither
 * call matched, so "Add to playlist" and "Remove from playlist" both returned 404
 * in the modal -- the client called `/batch-add` and `/batch-remove`, routes that
 * were never implemented here.
 *
 * Rather than add two more near-duplicate routes for one caller, both operations
 * are expressed on the routes that already exist and the reader is tolerant of
 * either shape. The single-object form is kept for `DELETE /:id/items` so any
 * existing caller of the original contract keeps working.
 */
const PlaylistItemsPayloadSchema = z.union([
  z.object({ items: PlaylistItemsAddSchema }),
  PlaylistItemsAddSchema,
]);

const PlaylistItemsRemoveSchema = z.union([
  z.object({ items: z.array(PlaylistItemDeleteSchema) }),
  z.array(PlaylistItemDeleteSchema),
  PlaylistItemDeleteSchema,
]);

/** Normalise the accepted add shapes to a single array. */
function addItems(
  parsed: z.infer<typeof PlaylistItemsPayloadSchema>,
): z.infer<typeof PlaylistItemsAddSchema> {
  return Array.isArray(parsed) ? parsed : parsed.items;
}

/** Normalise the accepted remove shapes to a single array. */
function removeItems(
  parsed: z.infer<typeof PlaylistItemsRemoveSchema>,
): z.infer<typeof PlaylistItemDeleteSchema>[] {
  if (Array.isArray(parsed)) return parsed;
  if ("items" in parsed) return parsed.items;
  return [parsed];
}

const ServerErrorSchema = z.object({ error: z.string() });
const PlaylistResultSchema = z.record(z.string(), z.any());
const SuccessSchema = z.object({ success: z.boolean() });

const createPlaylistRoute = {
  method: "post" as const,
  path: "/",
  tags: ["playlists"],
  request: {
    body: {
      content: { "application/json": { schema: PlaylistCreateSchema } },
    },
  },
  responses: {
    200: {
      description: "Playlist created",
      content: { "application/json": { schema: PlaylistResultSchema } },
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

const updatePlaylistRoute = {
  method: "patch" as const,
  path: "/:id",
  tags: ["playlists"],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": { schema: PlaylistUpdateSchema.partial() },
      },
    },
  },
  responses: {
    200: {
      description: "Playlist updated",
      content: { "application/json": { schema: PlaylistResultSchema } },
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
    404: {
      description: "No playlist with that id belongs to the caller",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const addPlaylistItemsRoute = {
  method: "post" as const,
  path: "/:id/items",
  tags: ["playlists"],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: { "application/json": { schema: PlaylistItemsPayloadSchema } },
    },
  },
  responses: {
    200: {
      description: "Items added to playlist",
      content: { "application/json": { schema: PlaylistResultSchema } },
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

const deletePlaylistItemRoute = {
  method: "delete" as const,
  path: "/:id/items",
  tags: ["playlists"],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: { "application/json": { schema: PlaylistItemsRemoveSchema } },
    },
  },
  responses: {
    200: {
      description: "Item removed from playlist",
      content: { "application/json": { schema: PlaylistResultSchema } },
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

playlistsRouter.openapi(createPlaylistRoute, async (c) => {
  const supabase = c.get("supabase");
  const user = c.get("user")!;

  let body;
  try {
    body = await c.req.json();
  } catch (_e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Validate with Zod schema
  const parsed = PlaylistCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { libraryId, name, description, items } = parsed.data;
  const newId = crypto.randomUUID();

  // Validate item IDs (if provided) - each must be a valid UUID string
  if (items && items.length > 0) {
    for (const itemId of items) {
      try {
        z.string().uuid().parse(itemId);
      } catch (_e) {
        return c.json({ error: `Invalid library item ID: ${itemId}` }, 400);
      }
    }
  }

  const { data, error } = await supabase
    .from("playlists")
    .insert({
      id: newId,
      library_id: libraryId,
      name,
      description: description ?? null,
      user_id: user.id,
    })
    .select()
    .single();
  if (error) {
    console.error("[playlists] Create error:", error);
    return c.json({ error: "Failed to create playlist" }, 500);
  }

  if (items && items.length > 0) {
    const playlistItems = items.map((item: string, index: number) => ({
      id: crypto.randomUUID(),
      playlist_id: data.id,
      media_item_id: item,
      order: index,
      media_item_type: "book",
    }));
    await supabase.from("playlist_media_items").insert(playlistItems);
  }
  return c.json(data, 200);
});

playlistsRouter.openapi(updatePlaylistRoute, async (c) => {
  const supabase = c.get("supabase");
  const user = c.get("user");
  const { id: playlistId } = c.req.valid("param");

  let body;
  try {
    body = await c.req.json();
  } catch (_e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Validate with Zod schema (partial update allowed - optional fields)
  const parsed = PlaylistUpdateSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name, description } = parsed.data;

  const { data, error } = await supabase
    .from("playlists")
    .update({
      name,
      description,
    })
    .eq("id", playlistId)
    // A playlist is a personal object -- `user_id` is written on create -- so
    // the id alone is not proof of ownership. Without this filter any signed-in
    // user could rename or re-describe anybody else's playlist by guessing (or
    // enumerating) its id.
    .eq("user_id", user?.id ?? "")
    .select()
    .single();
  if (error) {
    console.error("[playlists] Update error:", error);
    return c.json({ error: "Failed to update playlist" }, 500);
  }
  if (!data) {
    return c.json({ error: "Playlist not found" }, 404);
  }
  return c.json(data, 200);
});

playlistsRouter.openapi(addPlaylistItemsRoute, async (c) => {
  const supabase = c.get("supabase");
  const user = c.get("user");
  const { id: playlistId } = c.req.valid("param");

  let rows;
  try {
    rows = await c.req.json(); // Array of items with libraryItemId
  } catch (_e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const parsed = PlaylistItemsPayloadSchema.safeParse(rows);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const items = addItems(parsed.data);

  const { count } = await supabase
    .from("playlist_media_items")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("playlist_id", playlistId);

  const insertRows = items.map((r, index: number) => ({
    id: crypto.randomUUID(),
    playlist_id: playlistId,
    media_item_id: r.libraryItemId,
    order: (count ?? 0) + index,
    media_item_type: "book",
  }));
  // The insert's error was discarded, so a failed write still returned 200 with
  // the playlist unchanged and the caller saw a silent success.
  const { error: insertError } = await supabase.from("playlist_media_items")
    .insert(insertRows);
  if (insertError) {
    console.error("[playlists] Insert items error:", insertError);
    return c.json({ error: "Failed to add items to playlist" }, 500);
  }

  const { data, error } = await supabase.from("playlists").select(
    "*, playlist_media_items(*)",
  ).eq("id", playlistId).eq("user_id", user?.id ?? "").single();
  if (error) {
    console.error("[playlists] Add items error:", error);
    return c.json({ error: "Failed to add items to playlist" }, 500);
  }
  return c.json(data, 200);
});

playlistsRouter.openapi(deletePlaylistItemRoute, async (c) => {
  const supabase = c.get("supabase");
  const user = c.get("user");
  const { id: playlistId } = c.req.valid("param");

  let body;
  try {
    body = await c.req.json();
  } catch (_e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const parsed = PlaylistItemsRemoveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const items = removeItems(parsed.data);

  // One delete for the whole batch rather than a round trip per item: the modal
  // removes every selected item in a single user action.
  const mediaItemIds = items.map((i) => i.libraryItemId);
  // If we had episode differentiation, we'd do it here, but media_item_id maps to
  // library_item_id generally.
  const { error: deleteError } = await supabase
    .from("playlist_media_items")
    .delete()
    .eq("playlist_id", playlistId)
    .in("media_item_id", mediaItemIds);
  if (deleteError) {
    console.error("[playlists] Delete items error:", deleteError);
    return c.json({ error: "Failed to remove items from playlist" }, 500);
  }

  const { data, error } = await supabase.from("playlists").select(
    "*, playlist_media_items(*)",
  ).eq("id", playlistId).eq("user_id", user?.id ?? "").single();
  if (error) {
    console.error("[playlists] Delete item error:", error);
    return c.json({ error: "Failed to delete item from playlist" }, 500);
  }
  return c.json(data, 200);
});

const deletePlaylistRoute = {
  method: "delete" as const,
  path: "/:id",
  tags: ["playlists"],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Playlist deleted",
      content: { "application/json": { schema: SuccessSchema } },
    },
    404: {
      description: "No playlist with that id belongs to the caller",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
    500: {
      description: "Database error",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

playlistsRouter.openapi(deletePlaylistRoute, async (c) => {
  // The web client's "Delete playlist" called DELETE /api/playlists/:id, which
  // was never implemented here, so it 404'd and the card showed a generic
  // "Failed to remove" toast. No equivalent route existed, so this adds one.
  const supabase = c.get("supabase");
  const user = c.get("user");
  const { id: playlistId } = c.req.valid("param");

  // The playlist's media items go first, scoped by playlist_id. `user_id` is the
  // ownership proof, applied in the delete below.
  const { error: itemsError } = await supabase
    .from("playlist_media_items")
    .delete()
    .eq("playlist_id", playlistId);
  if (itemsError) {
    console.error("[playlists] Delete items error:", itemsError);
    return c.json({ error: "Failed to delete playlist" }, 500);
  }

  // Scoped to the caller: without user_id this would let any signed-in user
  // delete anyone else's playlist by id.
  const { data, error } = await supabase
    .from("playlists")
    .delete()
    .eq("id", playlistId)
    .eq("user_id", user?.id ?? "")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[playlists] Delete error:", error);
    return c.json({ error: "Failed to delete playlist" }, 500);
  }
  if (!data) {
    return c.json({ error: "Playlist not found" }, 404);
  }
  return c.json({ success: true }, 200);
});
