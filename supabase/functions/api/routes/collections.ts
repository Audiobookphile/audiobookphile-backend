import { createOpenApiRouter, z } from "../_shared/openapi.ts";

export const collectionsRouter = createOpenApiRouter();

// ===== Zod schemas for collection endpoints =====
const CollectionCreateSchema = z.object({
  libraryId: z.string().min(1),
  name: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
  items: z.array(z.string()).optional(), // array of item IDs to add (auto-ordered)
});

const CollectionUpdateSchema = z.object({
  name: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
});

/**
 * Payload for "add these books to an existing collection".
 *
 * This endpoint, `POST /api/collections/:id/items`, had three incompatible
 * dialects in circulation and no two agreed:
 *
 *   - the create-collection route above takes `{ items: [...] }`
 *   - this route took a bare `[...]`
 *   - the web client sent `{ libraryItemId: "..." }`, matching neither
 *
 * So "Add to collection" failed for every user with
 * `400 Expected array, received object`, and the modal showed its generic
 * failure toast. Nothing about the mismatch was discoverable from either side.
 *
 * `{ items: [...] }` is now the canonical shape because the create route already
 * established it, and one envelope is what a client can learn. The bare array is
 * still accepted so any other caller keeps working, and the reader is tolerant
 * rather than strict: a schema that rejects a shape a sibling route in the same
 * file accepts is the bug, not the caller.
 */
const CollectionItemsPayloadSchema = z.union([
  z.object({ items: z.array(z.string()) }),
  z.array(z.string()),
]);

/** Normalise the accepted shapes to a single array of library item IDs. */
function collectionItemIds(
  parsed: z.infer<typeof CollectionItemsPayloadSchema>,
): string[] {
  return Array.isArray(parsed) ? parsed : parsed.items;
}

/**
 * Build one `collection_items` row per requested library item.
 *
 * Exported for its test rather than inlined, because the bug it replaced was
 * invisible to every type checker and to the response shape: the handler
 * validated the whole array and then wrote only `parsed.data[0]`, so adding three
 * books to a collection returned 200, the first book appeared, and the other two
 * were silently discarded. Nothing about the reply distinguished that from a
 * complete success.
 *
 * `order` continues from the collection's current item count, and each row gets
 * its own position so the collection keeps its display order.
 */
export function buildCollectionItemRows(
  collectionId: string,
  libraryItemIds: string[],
  existingCount: number,
): Array<
  { id: string; collection_id: string; library_item_id: string; order: number }
> {
  return libraryItemIds.map((libraryItemId, index) => ({
    id: crypto.randomUUID(),
    collection_id: collectionId,
    library_item_id: libraryItemId,
    order: existingCount + index,
  }));
}

const ServerErrorSchema = z.object({ error: z.string() });
const CollectionResultSchema = z.record(z.string(), z.any());
const SuccessSchema = z.object({ success: z.boolean() });

const createCollectionRoute = {
  method: "post" as const,
  path: "/",
  tags: ["collections"],
  request: {
    body: {
      content: { "application/json": { schema: CollectionCreateSchema } },
    },
  },
  responses: {
    200: {
      description: "Collection created",
      content: { "application/json": { schema: CollectionResultSchema } },
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

const updateCollectionRoute = {
  method: "patch" as const,
  path: "/:id",
  tags: ["collections"],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": { schema: CollectionUpdateSchema.partial() },
      },
    },
  },
  responses: {
    200: {
      description: "Collection updated",
      content: { "application/json": { schema: CollectionResultSchema } },
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

const deleteCollectionRoute = {
  method: "delete" as const,
  path: "/:id",
  tags: ["collections"],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Collection deleted",
      content: { "application/json": { schema: SuccessSchema } },
    },
    500: {
      description: "Database error",
      content: { "application/json": { schema: ServerErrorSchema } },
    },
  },
};

const addCollectionItemsRoute = {
  method: "post" as const,
  path: "/:id/items",
  tags: ["collections"],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: { "application/json": { schema: CollectionItemsPayloadSchema } },
    },
  },
  responses: {
    200: {
      description: "Items added to collection",
      content: { "application/json": { schema: CollectionResultSchema } },
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

const deleteCollectionItemRoute = {
  method: "delete" as const,
  path: "/:id/items/:itemId",
  tags: ["collections"],
  request: {
    params: z.object({ id: z.string(), itemId: z.string() }),
  },
  responses: {
    200: {
      description: "Item removed from collection",
      content: { "application/json": { schema: CollectionResultSchema } },
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

collectionsRouter.openapi(createCollectionRoute, async (c) => {
  const supabase = c.get("supabase");

  let body;
  try {
    body = await c.req.json();
  } catch (_e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Validate with Zod schema
  const parsed = CollectionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { libraryId, name, description, items } = parsed.data;
  const newId = crypto.randomUUID();

  // Validate item IDs (if provided)
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
    .from("collections")
    .insert({
      id: newId,
      library_id: libraryId,
      name,
      description: description ?? null,
    })
    .select()
    .single();
  if (error) {
    console.error("[collections] Create error:", error);
    return c.json({ error: "Failed to create collection" }, 500);
  }

  if (items && items.length > 0) {
    const collectionItems = items.map((item: string, index: number) => ({
      id: crypto.randomUUID(),
      collection_id: data.id,
      library_item_id: item,
      order: index,
    }));
    await supabase.from("collection_items").insert(collectionItems);
  }
  return c.json(data, 200);
});

collectionsRouter.openapi(updateCollectionRoute, async (c) => {
  const supabase = c.get("supabase");
  const { id: collectionId } = c.req.valid("param");

  let body;
  try {
    body = await c.req.json();
  } catch (_e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Validate with Zod schema (partial update allowed - optional fields)
  const parsed = CollectionUpdateSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name, description } = parsed.data;

  const { data, error } = await supabase
    .from("collections")
    .update({
      name,
      description,
    })
    .eq("id", collectionId)
    .select()
    .single();
  if (error) {
    console.error("[collections] Update error:", error);
    return c.json({ error: "Failed to update collection" }, 500);
  }
  return c.json(data, 200);
});

collectionsRouter.openapi(deleteCollectionRoute, async (c) => {
  const supabase = c.get("supabase");
  const { id: collectionId } = c.req.valid("param");

  const { error } = await supabase.from("collections").delete().eq(
    "id",
    collectionId,
  );
  if (error) {
    console.error("[collections] Delete error:", error);
    return c.json({ error: "Failed to delete collection" }, 500);
  }
  return c.json({ success: true }, 200);
});

collectionsRouter.openapi(addCollectionItemsRoute, async (c) => {
  const supabase = c.get("supabase");
  const { id: collectionId } = c.req.valid("param");

  let body;
  try {
    body = await c.req.json();
  } catch (_e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Validate with Zod schema
  const parsed = CollectionItemsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "items array is required" }, 400);
  }

  // Validate each item ID as UUID
  const itemIds = collectionItemIds(parsed.data);
  for (const itemId of itemIds) {
    try {
      z.string().uuid().parse(itemId);
    } catch (_e) {
      return c.json({ error: `Invalid library item ID: ${itemId}` }, 400);
    }
  }

  const { count } = await supabase
    .from("collection_items")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("collection_id", collectionId);
  // Insert EVERY validated id, in one statement, each with its own order
  // position. This loop previously wrote only `parsed.data[0]`: the validation
  // above walked the whole array, so a multi-item add reported success while
  // silently discarding everything after the first book.
  const insertRows = buildCollectionItemRows(
    collectionId,
    itemIds,
    count ?? 0,
  );
  const { error: insertError } = await supabase
    .from("collection_items")
    .insert(insertRows);
  if (insertError) {
    console.error("[collections] Insert items error:", insertError);
    return c.json({ error: "Failed to add items to collection" }, 500);
  }

  const { data, error } = await supabase.from("collections").select(
    "*, collection_items(*)",
  ).eq("id", collectionId).single();
  if (error) {
    console.error("[collections] Add item error:", error);
    return c.json({ error: "Failed to add item to collection" }, 500);
  }
  return c.json(data, 200);
});

collectionsRouter.openapi(deleteCollectionItemRoute, async (c) => {
  const supabase = c.get("supabase");
  const { id: collectionId, itemId: libraryItemId } = c.req.valid("param");

  // Validate itemId as UUID before deleting
  try {
    z.string().uuid().parse(libraryItemId);
  } catch (_e) {
    return c.json({ error: `Invalid library item ID: ${libraryItemId}` }, 400);
  }

  await supabase.from("collection_items").delete().eq(
    "collection_id",
    collectionId,
  ).eq("library_item_id", libraryItemId);

  const { data, error } = await supabase.from("collections").select(
    "*, collection_items(*)",
  ).eq("id", collectionId).single();
  if (error) {
    console.error("[collections] Delete item error:", error);
    return c.json({ error: "Failed to delete item from collection" }, 500);
  }
  return c.json(data, 200);
});
