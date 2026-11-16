import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "./index.ts";

Deno.test("Sessions: GET /api/sessions rejects unauthorized requests", async () => {
  const req = new Request("http://localhost/api/sessions", {
    method: "GET",
  });
  const res = await app.request(req);
  assertEquals(res.status >= 400, true);
});

Deno.test("Sessions: GET /api/sessions/open rejects unauthorized requests", async () => {
  const req = new Request("http://localhost/api/sessions/open", {
    method: "GET",
  });
  const res = await app.request(req);
  assertEquals(res.status >= 400, true);
});

Deno.test("Sessions: DELETE /api/sessions/:id rejects unauthorized requests", async () => {
  const req = new Request("http://localhost/api/sessions/test-session-id", {
    method: "DELETE",
  });
  const res = await app.request(req);
  assertEquals(res.status >= 400, true);
});

Deno.test("Sessions: POST /api/sessions/batch/delete rejects unauthorized requests", async () => {
  const req = new Request("http://localhost/api/sessions/batch/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionIds: ["session-1", "session-2"] }),
  });
  const res = await app.request(req);
  assertEquals(res.status >= 400, true);
});

Deno.test("Sessions: POST /api/sessions/:id/close rejects unauthorized requests", async () => {
  const req = new Request(
    "http://localhost/api/sessions/test-session-id/close",
    {
      method: "POST",
    },
  );
  const res = await app.request(req);
  assertEquals(res.status >= 400, true);
});
