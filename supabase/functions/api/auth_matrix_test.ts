import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SignJWT } from "jose";
import { app } from "./index.ts";

/**
 * Authorization Matrix tests.
 *
 * Runs the real Hono app (index.ts) with cryptographically valid JWTs minted
 * against SUPABASE_JWT_SECRET, and a fake Supabase REST/Auth stack implemented
 * by intercepting globalThis.fetch. Every request therefore exercises the
 * real authMiddleware (JWT verification + DB-fresh profile lookup) and the
 * per-route requireAdminRole guards — without any network access.
 */

const SECRET = "auth-matrix-test-secret-0123456789abcdef";
Deno.env.set("SUPABASE_JWT_SECRET", SECRET);
Deno.env.set("SUPABASE_URL", "https://matrix-test.supabase.internal");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service_role_matrix_test");
Deno.env.set("NODE_ENV", "test");
Deno.env.delete("ZAI_API_KEY");
Deno.env.delete("ZHIPU_API_KEY");

const PROFILES: Record<string, any> = {
  "member-1": {
    id: "member-1",
    username: "member1",
    user_type: "user",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_banned: false,
    is_locked: false,
    default_library_id: null,
  },
  "member-2": {
    id: "member-2",
    username: "member2",
    user_type: "user",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_banned: false,
    is_locked: false,
    default_library_id: null,
  },
  "admin-1": {
    id: "admin-1",
    username: "admin1",
    user_type: "admin",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_banned: false,
    is_locked: false,
    default_library_id: null,
  },
  "root-1": {
    id: "root-1",
    username: "root1",
    user_type: "root",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_banned: false,
    is_locked: false,
    default_library_id: null,
  },
};

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

globalThis.fetch = async (input: any, init?: RequestInit) => {
  const url = new URL(String(input));
  const path = url.pathname;

  if (path.endsWith("/rest/v1/profiles")) {
    const idFilter = url.searchParams.get("id");
    if (idFilter) {
      const profile = PROFILES[idFilter.replace(/^eq\./, "")];
      return jsonResponse(profile ? [profile] : []);
    }
    return jsonResponse(Object.values(PROFILES));
  }

  if (path.includes("/rest/v1/rpc/delete_library_item_atomic")) {
    return jsonResponse({ found: false, retry: false, item_id: ITEM_ID });
  }

  if (path.includes("/rest/v1/")) {
    return jsonResponse([], 200, { "content-range": "0-0/4" });
  }

  if (path.includes("/auth/v1/admin/users")) {
    const method = (init?.method ?? "GET").toUpperCase();
    const maybeId = path.split("/").pop()!;
    if (method === "GET" && PUBLIC_IDS.has(maybeId)) {
      return jsonResponse({
        user: { id: maybeId, email: `${maybeId}@test.local` },
      });
    }
    if (method === "GET") {
      return jsonResponse({
        users: Object.values(PROFILES).map((p) => ({
          id: p.id,
          email: `${p.id}@test.local`,
          role: "authenticated",
          created_at: p.created_at,
          user_metadata: { username: p.username },
        })),
        next_page: null,
      });
    }
    return jsonResponse({});
  }

  return jsonResponse({});
};

const PUBLIC_IDS = new Set(Object.keys(PROFILES));

async function mintToken(sub: string, secret = SECRET): Promise<string> {
  return await new SignJWT({
    email: `${sub}@test.local`,
    role: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

async function requestStatus(
  method: string,
  path: string,
  token?: string,
  body?: object,
): Promise<number> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await app.request(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return res.status;
}

const FORBIDDEN = new Set([401, 403]);
const ITEM_ID = "11111111-2222-3333-4444-555555555555";

function assertAccess(
  expectedForbidden: boolean,
  status: number,
  label: string,
) {
  if (expectedForbidden) {
    assert(
      FORBIDDEN.has(status),
      `${label}: expected 401/403 (forbidden), got ${status}`,
    );
  } else {
    assert(
      !FORBIDDEN.has(status),
      `${label}: expected allowed (not 401/403), got ${status}`,
    );
  }
}

// Every server-global / management surface that must be admin-or-root only.
const protectedRoutes: Array<[string, string]> = [
  ["GET", "/api/users"],
  ["POST", "/api/users"],
  ["POST", "/api/auth/invite"],
  ["GET", "/api/admin-analytics"],
  ["GET", "/api/admin/analytics"],
  ["GET", "/api/filesystem"],
  ["GET", "/api/sessions"],
  ["DELETE", "/api/backups/backup-1"],
  ["POST", "/api/sessions/batch/delete"],
  ["POST", "/api/backup-database"],
  ["PATCH", "/api/genres/Fantasy"],
  ["PUT", "/api/tags/narrated"],
  ["DELETE", "/api/tags/narrated"],
  ["PATCH", "/api/narrators/narrator-1"],
  ["DELETE", "/api/narrators/narrator-1"],
  ["DELETE", "/api/tags/tag-1"],
  ["DELETE", "/api/genres/genre-1"],
  ["POST", "/api/match-book"],
  ["POST", "/api/scrape-metadata"],
  ["POST", "/api/metadata/scrape"],
  ["PATCH", "/api/authors/author-1"],
  ["DELETE", "/api/authors/author-1"],
  ["POST", "/api/authors/author-1/match"],
  ["POST", "/api/authors/author-1/image"],
  ["DELETE", "/api/authors/author-1/image"],
  ["POST", "/api/authors/sync-authors"],
  ["POST", "/api/libraries"],
  ["PATCH", "/api/libraries/library-1"],
  ["DELETE", "/api/libraries/library-1"],
  ["POST", "/api/libraries/library-1/scan"],
  ["POST", "/api/libraries/library-1/smart-sort"],
  ["POST", "/api/libraries/library-1/deduplicate"],
  // A GET, but it rewrites every item in the library and re-uploads covers --
  // same mutation class as scan/smart-sort/deduplicate above.
  ["GET", "/api/libraries/library-1/matchall"],
  // Service-role raw-row dump, and attacker-controlled Sentry event injection.
  ["GET", "/api/debug/item-1"],
  ["POST", "/api/debug/sentry-test"],
  ["DELETE", `/api/items/${ITEM_ID}`],
  ["DELETE", "/api/items/item-1/cover"],
  ["POST", "/api/items/item-1/cover"],
  ["PATCH", "/api/items/item-1/cover"],
  ["POST", "/api/items/sync-covers"],
  ["POST", "/api/items/sync-durations"],
  ["POST", "/api/items/sync-insights"],
  ["POST", "/api/migrate-batch"],
];

Deno.test("AuthZ Matrix: every protected route rejects members", async () => {
  const token = await mintToken("member-1");
  for (const [method, path] of protectedRoutes) {
    const status = await requestStatus(
      method,
      path,
      token,
      method === "GET" ? undefined : {},
    );
    assertAccess(true, status, `member ${method} ${path}`);
  }
});

Deno.test("AuthZ Matrix: admin and root reach every protected route", async () => {
  for (const role of ["admin-1", "root-1"]) {
    const token = await mintToken(role);
    for (const [method, path] of protectedRoutes) {
      const status = await requestStatus(
        method,
        path,
        token,
        method === "GET" ? undefined : {},
      );
      assertAccess(false, status, `${role} ${method} ${path}`);
    }
  }
});

Deno.test("AuthZ Matrix: query-string bearer tokens are rejected", async () => {
  const token = await mintToken("admin-1");
  const response = await app.request(
    new Request(`http://localhost/api/me?token=${encodeURIComponent(token)}`),
  );
  assertEquals(response.status, 401);
});

Deno.test("AuthZ Matrix: guests without tokens are rejected", async () => {
  for (const [method, path] of protectedRoutes) {
    const status = await requestStatus(
      method,
      path,
      undefined,
      method === "GET" ? undefined : {},
    );
    assertEquals(status, 401, `guest ${method} ${path}`);
  }
});

Deno.test("AuthZ Matrix: self-service and role-change rules", async () => {
  const member = await mintToken("member-1");
  const _member2 = await mintToken("member-2");
  const admin = await mintToken("admin-1");

  // Self-elevation is impossible for members (role change on self or any other user)
  assertAccess(
    true,
    await requestStatus("PATCH", "/api/users/member-1", member, {
      type: "admin",
    }),
    "member self-elevation",
  );
  assertAccess(
    true,
    await requestStatus("PATCH", "/api/users/admin-1", member, {
      type: "admin",
    }),
    "member elevates admin",
  );
  // Plain self-edit stays allowed
  assertAccess(
    false,
    await requestStatus("PATCH", "/api/users/member-1", member, {
      username: "renamed",
    }),
    "member self rename",
  );
  // Self-deletion is allowed; deleting others requires admin
  assertAccess(
    false,
    await requestStatus("DELETE", "/api/users/member-1", member),
    "member self delete",
  );
  assertAccess(
    true,
    await requestStatus("DELETE", "/api/users/member-2", member),
    "member deletes other",
  );
  // Admins can never change their OWN role
  assertAccess(
    true,
    await requestStatus("PATCH", "/api/users/admin-1", admin, { type: "root" }),
    "admin self elevation",
  );
  // Admins manage other users
  assertAccess(
    false,
    await requestStatus("PATCH", "/api/users/member-1", admin, {
      type: "admin",
    }),
    "admin promotes member",
  );
  assertAccess(
    false,
    await requestStatus("DELETE", "/api/users/member-2", admin),
    "admin deletes member",
  );
});

Deno.test("AuthZ Matrix: forged and tampered tokens are rejected", async () => {
  // Signed with a different secret — must fail signature verification
  const forged = await mintToken("member-1", "attacker-controlled-secret");
  assertEquals(
    await requestStatus("GET", "/api/users", forged),
    401,
    "forged signature",
  );

  // Complete garbage
  assertEquals(
    await requestStatus("GET", "/api/users", "not.a.jwt"),
    401,
    "garbage token",
  );
});

Deno.test("AuthZ Matrix: user-facing routes remain open to members", async () => {
  const member = await mintToken("member-1");
  const openRoutes: Array<[string, string]> = [
    ["GET", "/api/me"],
    ["GET", "/api/me/stats"],
    ["GET", "/api/search/history"],
    ["GET", "/api/items/item-1"],
    ["GET", "/api/items/item-1/cover"],
    ["POST", "/api/chapter-ai"],
    ["POST", "/api/ai/chapter"],
    ["POST", "/api/ai/insights"],
    ["POST", "/api/upload-presign"],
    ["POST", "/api/items/upload-presign"],
    ["GET", "/api/libraries/library-1/items"],
    ["GET", "/api/users/me/preferences"],
  ];
  for (const [method, path] of openRoutes) {
    const status = await requestStatus(
      method,
      path,
      member,
      method === "GET" ? undefined : {},
    );
    assertAccess(false, status, `member ${method} ${path} (user-facing)`);
  }

  // Health check is public
  assertEquals(
    await requestStatus("GET", "/api/health", undefined),
    200,
    "public health",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Progress payload contract
//
// `progress` used to be REQUIRED by ProgressPayloadSchema, and the batch
// endpoint accepted only a top-level array. Between them, every "mark finished"
// and "remove from Continue Listening" action in the web client returned 400:
//
//   PATCH /api/me/progress/:id      {isFinished, episodeId}     -> 400 Required
//   PATCH /api/me/progress-batch    {items:[...]}               -> 400 Expected array
//
// Both are now accepted, which is what the shared upsertMediaProgress always
// supported. These assert the HTTP contract so the loosening cannot silently
// regress, and so the refine() that rejects a content-free body is pinned too.
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("progress: a finish-only payload is accepted without a position", async () => {
  const token = await mintToken("member-1");
  // No `progress`, no `duration`: marking finished is an intent in its own
  // right and is independent of playback position.
  assertEquals(
    await requestStatus("PATCH", "/api/me/progress/item-1", token, {
      isFinished: true,
    }),
    200,
    "mark finished with no position",
  );
  assertEquals(
    await requestStatus("PATCH", "/api/me/progress/item-1", token, {
      isFinished: true,
      episodeId: "ep-1",
    }),
    200,
    "mark episode finished",
  );
  assertEquals(
    await requestStatus("PATCH", "/api/me/progress/item-1", token, {
      hideFromContinueListening: true,
    }),
    200,
    "hide from Continue Listening with no position",
  );
});

Deno.test("progress: a position-only payload still works", async () => {
  const token = await mintToken("member-1");
  assertEquals(
    await requestStatus("PATCH", "/api/me/progress/item-1", token, {
      progress: 0.42,
      duration: 3600,
    }),
    200,
    "position-only update",
  );
});

Deno.test("progress: an out-of-range position is still rejected", async () => {
  const token = await mintToken("member-1");
  // The loosening must not have removed the bound that stops a bogus resume
  // position being written (the Sapiens 19.8h-duration incident).
  assertEquals(
    await requestStatus("PATCH", "/api/me/progress/item-1", token, {
      progress: 19.8,
    }),
    400,
    "progress above 1 must be rejected",
  );
});

Deno.test("progress: a body with nothing to write is still rejected", async () => {
  const token = await mintToken("member-1");
  // Without this, an empty body would return 200 having written nothing, which
  // at the call site is indistinguishable from a real success.
  assertEquals(
    await requestStatus("PATCH", "/api/me/progress/item-1", token, {}),
    400,
    "empty payload must be rejected",
  );
  assertEquals(
    await requestStatus("PATCH", "/api/me/progress/item-1", token, {
      unknownField: true,
    }),
    400,
    "unknown-fields-only payload must be rejected",
  );
});

Deno.test("progress: the batch endpoint accepts both wire shapes", async () => {
  const token = await mintToken("member-1");
  const entries = [
    { libraryItemId: "item-1", isFinished: true },
    { libraryItemId: "item-2", isFinished: true },
  ];
  // The shape the web client sends.
  assertEquals(
    await requestStatus("PATCH", "/api/me/progress-batch", token, {
      items: entries,
    }),
    200,
    "batch as {items:[...]}",
  );
  // The shape this endpoint originally accepted, kept working.
  assertEquals(
    await requestStatus("PATCH", "/api/me/progress-batch", token, entries),
    200,
    "batch as a top-level array",
  );
});

Deno.test("progress: the series endpoint no longer claims success it cannot deliver", async () => {
  const token = await mintToken("member-1");
  // The handler is a stub. It used to answer 200 {success: true} without writing
  // anything, so a caller concluded the series was updated while the Continue
  // Listening shelf was untouched. It must now fail loudly.
  const res = await app.request(
    new Request("http://localhost/api/me/progress/series/series-1", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }),
  );
  assertEquals(res.status, 501, "series progress must report not-implemented");
  const body = await res.json() as { success: boolean };
  assertEquals(
    body.success,
    false,
    "must not report success for work not done",
  );
});

Deno.test("progress: removing one item from Continue Listening uses the implemented route", async () => {
  const token = await mintToken("member-1");
  // The web client used to PATCH this path, which is not a route, so every use
  // 404'd while the item stayed on the shelf. DELETE is what the server
  // implements, and it is scoped to the caller's own user_id.
  assertEquals(
    await requestStatus("DELETE", "/api/me/progress/id/progress-1", token),
    200,
    "delete progress by id",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Collection add-item payload contract
//
// This endpoint had three dialects in flight and no two agreed: the create route
// takes `{items:[...]}`, this route took a bare array, and the web client sent
// `{libraryItemId}`. "Add to collection" therefore failed for every user with
// 400 "Expected array, received object" — a mismatch that was invisible from
// either side of the wire. These pin every accepted shape.
// ─────────────────────────────────────────────────────────────────────────────

const COLLECTION_ID = "22222222-3333-4444-5555-666666666666";
const ITEM_A = "11111111-1111-1111-1111-111111111111";
const ITEM_B = "11111111-1111-1111-1111-222222222222";

Deno.test("collections: the add-item endpoint accepts the canonical envelope", async () => {
  const token = await mintToken("member-1");
  // The shape the create route already used, and now the one the web client sends.
  assertEquals(
    await requestStatus(
      "POST",
      `/api/collections/${COLLECTION_ID}/items`,
      token,
      {
        items: [ITEM_A, ITEM_B],
      },
    ),
    200,
    "add items as {items:[...]}",
  );
});

Deno.test("collections: the add-item endpoint still accepts a bare array", async () => {
  const token = await mintToken("member-1");
  // Kept for any other caller; a tolerant reader costs nothing.
  assertEquals(
    await requestStatus(
      "POST",
      `/api/collections/${COLLECTION_ID}/items`,
      token,
      [ITEM_A],
    ),
    200,
    "add items as a bare array",
  );
});

Deno.test("collections: a non-UUID item id is still rejected", async () => {
  const token = await mintToken("member-1");
  // The union must not have loosened the per-id UUID check that follows it.
  assertEquals(
    await requestStatus(
      "POST",
      `/api/collections/${COLLECTION_ID}/items`,
      token,
      {
        items: ["not-a-uuid"],
      },
    ),
    400,
    "non-UUID item id must be rejected",
  );
});

Deno.test("collections: a shape matching neither dialect is still rejected", async () => {
  const token = await mintToken("member-1");
  // The exact payload the web client used to send. It is now fixed client-side,
  // but the server must not accept it: an object with no `items` key is not a
  // valid request and silently ignoring the id would be another silent no-op.
  assertEquals(
    await requestStatus(
      "POST",
      `/api/collections/${COLLECTION_ID}/items`,
      token,
      {
        libraryItemId: ITEM_A,
      },
    ),
    400,
    "{libraryItemId} must be rejected, not silently ignored",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Playlist contract
//
// The web client called three routes the server did not implement, so "Delete
// playlist", "Add to playlist" and "Remove from playlist" all failed:
//   DELETE  /api/playlists/:id            -> 404 (no such route)
//   POST    /api/playlists/:id/batch-add  -> 404
//   POST    /api/playlists/:id/batch-remove -> 404
// The two operations that DID exist (`POST` and `DELETE /:id/items`) also
// disagreed with the client on payload shape: a bare array for add, a single
// object for delete, against the client's `{items: [...]}`.
// ─────────────────────────────────────────────────────────────────────────────

const PLAYLIST_ID = "33333333-4444-5555-6666-777777777777";
const PLAYLIST_ITEM = "44444444-5555-6666-7777-888888888888";

Deno.test("playlists: the client routes now exist", async () => {
  const token = await mintToken("member-1");
  assertEquals(
    await requestStatus("DELETE", `/api/playlists/${PLAYLIST_ID}`, token),
    200,
    "delete a playlist (was 404)",
  );
});

Deno.test("playlists: add accepts the client's {items:[...]} envelope", async () => {
  const token = await mintToken("member-1");
  assertEquals(
    await requestStatus("POST", `/api/playlists/${PLAYLIST_ID}/items`, token, {
      items: [{ libraryItemId: PLAYLIST_ITEM, order: 0 }],
    }),
    200,
    "batch add as {items:[...]}",
  );
  // The original shape still works for any other caller.
  assertEquals(
    await requestStatus("POST", `/api/playlists/${PLAYLIST_ID}/items`, token, [
      { libraryItemId: PLAYLIST_ITEM, order: 0 },
    ]),
    200,
    "add as a bare array",
  );
});

Deno.test("playlists: remove accepts a batch and still accepts a single item", async () => {
  const token = await mintToken("member-1");
  assertEquals(
    await requestStatus(
      "DELETE",
      `/api/playlists/${PLAYLIST_ID}/items`,
      token,
      {
        items: [{ libraryItemId: PLAYLIST_ITEM }],
      },
    ),
    200,
    "batch remove as {items:[...]}",
  );
  assertEquals(
    await requestStatus(
      "DELETE",
      `/api/playlists/${PLAYLIST_ID}/items`,
      token,
      {
        libraryItemId: PLAYLIST_ITEM,
      },
    ),
    200,
    "remove a single item (the original contract)",
  );
});

Deno.test("playlists: a malformed item id is still rejected", async () => {
  const token = await mintToken("member-1");
  // The unions must not have loosened the per-item uuid check.
  assertEquals(
    await requestStatus("POST", `/api/playlists/${PLAYLIST_ID}/items`, token, {
      items: [{ libraryItemId: "not-a-uuid" }],
    }),
    400,
    "non-uuid libraryItemId must be rejected on add",
  );
  assertEquals(
    await requestStatus(
      "DELETE",
      `/api/playlists/${PLAYLIST_ID}/items`,
      token,
      {
        items: [{ libraryItemId: "not-a-uuid" }],
      },
    ),
    400,
    "non-uuid libraryItemId must be rejected on remove",
  );
});
