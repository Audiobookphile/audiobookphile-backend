import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "./index.ts";

Deno.test("Feeds: GET /api/feeds requires authentication", async () => {
  const req = new Request("http://localhost/api/feeds", {
    method: "GET",
  });

  const res = await app.request(req);
  assertEquals(res.status, 401);
});

Deno.test("Feeds: POST /api/items/:id/open-rss-feed requires authentication", async () => {
  const req = new Request(
    "http://localhost/api/items/11111111-2222-3333-4444-555555555555/open-rss-feed",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "test-slug" }),
    },
  );

  const res = await app.request(req);
  assertEquals(res.status, 401);
});

Deno.test("Feeds: POST /api/feeds/:id/close requires authentication", async () => {
  const req = new Request(
    "http://localhost/api/feeds/11111111-2222-3333-4444-555555555555/close",
    {
      method: "POST",
    },
  );

  const res = await app.request(req);
  assertEquals(res.status, 401);
});

Deno.test("Feeds: GET /api/opds challenges with WWW-Authenticate Basic when unauthenticated", async () => {
  const req = new Request("http://localhost/api/opds", {
    method: "GET",
  });

  const res = await app.request(req);
  assertEquals(res.status, 401);
  const wwwAuth = res.headers.get("www-authenticate");
  assertEquals(Boolean(wwwAuth && wwwAuth.includes("Basic")), true);
});

Deno.test("Feeds: GET /feed/:slug returns 404 for unknown feed", async () => {
  const req = new Request("http://localhost/feed/nonexistent-test-slug-9999", {
    method: "GET",
  });

  const res = await app.request(req);
  assertEquals(res.status, 404);
});
