import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCollectionItemRows } from "./routes/collections.ts";

/**
 * "Add to collection" must add every requested book.
 *
 * The handler validated the whole payload array and then inserted only
 * `parsed.data[0]`. Adding three books to a collection therefore returned 200,
 * the first book appeared in the collection, and the other two were silently
 * discarded -- with nothing in the response to distinguish that from a complete
 * success. The sibling create-collection path already mapped every item, so the
 * loss was specific to adding to an existing collection.
 *
 * The row builder is a separate exported function so this is a unit test of the
 * real code path. An inlined `.map()` here would have been just as wrong and just
 * as untested: nothing in the type system or the HTTP response catches it.
 */
const COLLECTION = "11111111-2222-3333-4444-555555555555";
const item = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

Deno.test("collections: every requested item gets a row", () => {
  const ids = [item(1), item(2), item(3)];
  const rows = buildCollectionItemRows(COLLECTION, ids, 0);

  assertEquals(
    rows.length,
    3,
    "one row per requested item, not just the first",
  );
  assertEquals(rows.map((r) => r.library_item_id), ids);
});

Deno.test("collections: a single item still produces exactly one row", () => {
  const rows = buildCollectionItemRows(COLLECTION, [item(1)], 0);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].library_item_id, item(1));
});

Deno.test("collections: an empty array inserts nothing (and does not throw)", () => {
  assertEquals(buildCollectionItemRows(COLLECTION, [], 0).length, 0);
  assertEquals(buildCollectionItemRows(COLLECTION, [], 7).length, 0);
});

Deno.test("collections: order continues from the existing item count", () => {
  const rows = buildCollectionItemRows(COLLECTION, [item(1), item(2)], 4);
  assertEquals(rows.map((r) => r.order), [4, 5]);
});

Deno.test("collections: every row is uniquely identified and correctly scoped", () => {
  const rows = buildCollectionItemRows(
    COLLECTION,
    [item(1), item(2), item(3)],
    0,
  );
  assertEquals(new Set(rows.map((r) => r.id)).size, 3, "ids must not collide");
  for (const r of rows) {
    assertEquals(r.collection_id, COLLECTION);
  }
});
