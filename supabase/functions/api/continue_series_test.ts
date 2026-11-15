import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "./index.ts";
import {
  BookmarkCreateSchema,
  BookmarkUpdateSchema,
} from "./routes/bookmarks.ts";

Deno.test("Continue Series: GET /api/me/continue-series requires authentication", async () => {
  const req = new Request("http://localhost/api/me/continue-series", {
    method: "GET",
  });

  const res = await app.request(req);
  assertEquals(res.status >= 400, true);
});

Deno.test("Bookmarks: BookmarkCreateSchema validates and preserves multi-line note", () => {
  const payload = {
    library_item_id: "a0000000-0000-4000-8000-000000000001",
    time_pos: 12345,
    title: "Key revelation in chapter 4",
    note:
      "This quote resonates deeply with the character arc:\n'All that is gold does not glitter...'",
  };

  const parsed = BookmarkCreateSchema.safeParse(payload);
  assertEquals(parsed.success, true);
  if (parsed.success) {
    assertEquals(parsed.data.note, payload.note);
    assertEquals(parsed.data.title, payload.title);
  }
});

Deno.test("Bookmarks: BookmarkUpdateSchema accepts note field update", () => {
  const updatePayload = {
    note: "Updated commentary: Verified timestamp.",
  };

  const parsed = BookmarkUpdateSchema.safeParse(updatePayload);
  assertEquals(parsed.success, true);
  if (parsed.success) {
    assertEquals(parsed.data.note, updatePayload.note);
  }
});

Deno.test("Libraries: GET /api/libraries/:id/personalized requires authentication", async () => {
  const req = new Request("http://localhost/api/libraries/lib-1/personalized", {
    method: "GET",
  });

  const res = await app.request(req);
  assertEquals(res.status >= 400, true);
});
