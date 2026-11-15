/**
 * Syndication Feeds Router
 *
 * Implements open syndication standards for Audiobookphile:
 * 1. Tokenized Private RSS Feeds per Audiobook / Series / Collection (Podcast 2.0 / iTunes XML)
 * 2. Enclosure Audio Stream 302 redirects with dynamic signed storage URLs
 * 3. OPDS 1.2 Catalog Navigation & Acquisition feeds for e-readers and audio players (BookPlayer)
 */

import { Context } from "hono";
import { createClient } from "npm:@supabase/supabase-js@2.44.0";
import { createOpenApiRouter, z } from "../_shared/openapi.ts";
import { Variables } from "../_shared/types.ts";
import { StorageRouter } from "../../_shared/storage-router.ts";
import { verifyJWT } from "../_shared/auth.ts";
import { getWebOrigin } from "../_shared/proxy.ts";

export const feedsRouter = createOpenApiRouter();

// =========================
// Helpers
// =========================

function getAdminClient(c: Context<{ Variables: Variables }>) {
  const existing = c.get("supabase");
  if (existing) return existing;
  const supabaseUrl = c.get("supabaseUrl") || Deno.env.get("SUPABASE_URL") ||
    "https://placeholder.supabase.co";
  const serviceRoleKey = c.get("serviceRoleKey") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "anon";
  return createClient(supabaseUrl, serviceRoleKey);
}

function escapeXml(unsafe: string | null | undefined): string {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(date: Date | string | number | null | undefined): string {
  if (!date) return new Date().toUTCString();
  const d = new Date(date);
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function sanitizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function authenticateOpds(
  c: Context<{ Variables: Variables }>,
  adminSupabase: any,
) {
  // 1. Direct user from context
  const existingUser = c.get("user");
  if (existingUser) return existingUser;

  // 2. Query param token
  const queryToken = c.req.query("token") || c.req.query("apiKey");
  if (queryToken) {
    const payload = await verifyJWT(queryToken);
    if (payload?.sub) {
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("*")
        .eq("id", payload.sub)
        .maybeSingle();
      if (profile) return profile;
    }
  }

  // 3. Basic Auth header
  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("basic ")) {
    const b64 = authHeader.slice(6).trim();
    try {
      const decoded = atob(b64);
      const colonIdx = decoded.indexOf(":");
      if (colonIdx > 0) {
        const usernameOrEmail = decoded.slice(0, colonIdx).trim();
        const password = decoded.slice(colonIdx + 1).trim();

        let email = usernameOrEmail;
        if (!email.includes("@")) {
          const { data: profile } = await adminSupabase
            .from("profiles")
            .select("id")
            .eq("username", usernameOrEmail)
            .maybeSingle();
          if (profile) {
            const { data: userData } = await adminSupabase.auth.admin
              .getUserById(profile.id);
            if (userData?.user?.email) {
              email = userData.user.email;
            }
          }
        }

        const supabaseUrl = c.get("supabaseUrl") ||
          Deno.env.get("SUPABASE_URL") || "";
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
        if (supabaseUrl && anonKey && email) {
          const authClient = createClient(supabaseUrl, anonKey);
          const { data, error } = await authClient.auth.signInWithPassword({
            email,
            password,
          });
          if (!error && data?.user) {
            const { data: profile } = await adminSupabase
              .from("profiles")
              .select("*")
              .eq("id", data.user.id)
              .maybeSingle();
            if (profile) return profile;
          }
        }
      }
    } catch (_e) {
      // invalid b64
    }
  }

  return null;
}

// =========================
// Schemas
// =========================

const OpenFeedBodySchema = z.object({
  serverAddress: z.string().optional(),
  slug: z.string().min(1, "Slug is required"),
  metadataDetails: z.object({
    preventIndexing: z.boolean().default(true),
    ownerName: z.string().optional(),
    ownerEmail: z.string().optional(),
  }).optional(),
});

// =========================
// Routes
// =========================

/**
 * GET /feeds - List active RSS feeds for the current user
 */
feedsRouter.get("/feeds", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const adminSupabase = getAdminClient(c);
  const origin = getWebOrigin(c);

  let query = adminSupabase.from("feeds").select("*").order("created_at", {
    ascending: false,
  });
  if (user.type !== "admin" && user.type !== "root") {
    query = query.eq("user_id", user.id);
  }

  const { data: rows, error } = await query;
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const feeds = (rows || []).map((row: any) => {
    const slug = row.slug || row.id;
    const coverPath = row.cover_path ||
      `${origin}/api/items/${row.entity_id}/cover`;

    return {
      id: row.id,
      slug,
      entityId: row.entity_id || "",
      entityType: row.entity_type === "item"
        ? "libraryItem"
        : (row.entity_type || "libraryItem"),
      entityUpdatedAt: row.entity_updated_at
        ? new Date(row.entity_updated_at).getTime()
        : Date.now(),
      coverPath,
      feedUrl: `${origin}/feed/${slug}`,
      serverAddress: origin,
      userId: row.user_id || "",
      meta: {
        title: row.title || "Audiobook Feed",
        author: row.author || "Unknown Author",
        description: row.description || "",
        explicit: Boolean(row.explicit),
        feedUrl: `${origin}/feed/${slug}`,
        imageUrl: coverPath,
        language: row.language || "en",
        link: origin,
        ownerEmail: row.owner_email || null,
        ownerName: row.owner_name || null,
        preventIndexing: Boolean(row.prevent_indexing),
        type: (row.podcast_type as "serial" | "episodic") || "serial",
      },
      createdAt: row.created_at
        ? new Date(row.created_at).getTime()
        : Date.now(),
      updatedAt: row.updated_at
        ? new Date(row.updated_at).getTime()
        : Date.now(),
    };
  });

  return c.json({ feeds }, 200);
});

/**
 * POST /:entityType/:id/open-rss-feed - Open an RSS feed for item/series/collection
 */
async function handleOpenFeed(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const entityTypeParam = c.req.param("entityType") || "item";
  const entityId = c.req.param("id");
  if (!entityId) {
    return c.json({ error: "Entity ID is required" }, 400);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // empty
  }

  const parsed = OpenFeedBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: parsed.error.issues[0]?.message || "Invalid payload",
    }, 400);
  }

  const rawSlug = parsed.data.slug || entityId;
  const slug = sanitizeSlug(rawSlug);
  if (!slug) {
    return c.json({ error: "Valid slug is required" }, 400);
  }

  const adminSupabase = getAdminClient(c);
  const origin = parsed.data.serverAddress || getWebOrigin(c);
  const entityType = entityTypeParam.startsWith("item")
    ? "item"
    : entityTypeParam;

  // Fetch entity metadata from library_items if item
  let title = "Audiobook Feed";
  let author = "Unknown Author";
  let description = "";
  let coverPath = "";
  let explicit = false;
  let language = "en";

  if (entityType === "item") {
    const { data: item } = await adminSupabase
      .from("library_items")
      .select(
        "id, title, description, author_names_first_last, explicit, language, cover_path, updated_at",
      )
      .eq("id", entityId)
      .maybeSingle();

    if (item) {
      title = item.title || "Audiobook";
      author = item.author_names_first_last || "Unknown Author";
      description = item.description || "";
      explicit = Boolean(item.explicit);
      language = item.language || "en";
      coverPath = `${origin}/api/items/${entityId}/cover`;
    }
  }

  const now = new Date().toISOString();
  const feedId = crypto.randomUUID();

  // Insert or update feed in feeds table
  const { data: feedRow, error } = await adminSupabase
    .from("feeds")
    .upsert(
      {
        id: feedId,
        slug,
        entity_id: entityId,
        entity_type: entityType,
        user_id: user.id,
        title,
        author,
        description,
        explicit,
        language,
        podcast_type: "serial",
        cover_path: coverPath,
        server_address: origin,
        feed_url: `${origin}/feed/${slug}`,
        prevent_indexing: parsed.data.metadataDetails?.preventIndexing ?? true,
        owner_name: parsed.data.metadataDetails?.ownerName || user.username ||
          "",
        owner_email: parsed.data.metadataDetails?.ownerEmail || user.email ||
          "",
        updated_at: now,
      },
      { onConflict: "slug" },
    )
    .select("*")
    .single();

  if (error || !feedRow) {
    return c.json(
      { error: error?.message || "Failed to create RSS feed" },
      500,
    );
  }

  const formattedFeed = {
    id: feedRow.id,
    slug: feedRow.slug || slug,
    entityId: feedRow.entity_id || entityId,
    entityType: feedRow.entity_type === "item"
      ? "libraryItem"
      : (feedRow.entity_type || "libraryItem"),
    entityUpdatedAt: feedRow.entity_updated_at
      ? new Date(feedRow.entity_updated_at).getTime()
      : Date.now(),
    coverPath: feedRow.cover_path || coverPath,
    feedUrl: `${origin}/feed/${feedRow.slug || slug}`,
    serverAddress: origin,
    userId: feedRow.user_id || user.id,
    meta: {
      title: feedRow.title || title,
      author: feedRow.author || author,
      description: feedRow.description || description,
      explicit: Boolean(feedRow.explicit),
      feedUrl: `${origin}/feed/${feedRow.slug || slug}`,
      imageUrl: feedRow.cover_path || coverPath,
      language: feedRow.language || language,
      link: origin,
      ownerEmail: feedRow.owner_email || null,
      ownerName: feedRow.owner_name || null,
      preventIndexing: Boolean(feedRow.prevent_indexing),
      type: "serial" as const,
    },
    createdAt: feedRow.created_at
      ? new Date(feedRow.created_at).getTime()
      : Date.now(),
    updatedAt: feedRow.updated_at
      ? new Date(feedRow.updated_at).getTime()
      : Date.now(),
  };

  return c.json({ feed: formattedFeed }, 200);
}

feedsRouter.post("/:entityType/:id/open-rss-feed", handleOpenFeed);
feedsRouter.post("/items/:id/open-rss-feed", handleOpenFeed);
feedsRouter.post("/series/:id/open-rss-feed", handleOpenFeed);
feedsRouter.post("/collection/:id/open-rss-feed", handleOpenFeed);

/**
 * POST /feeds/:id/close or DELETE /feeds/:id - Close an RSS feed
 */
async function handleCloseFeed(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const feedId = c.req.param("id");
  if (!feedId) {
    return c.json({ error: "Feed ID is required" }, 400);
  }

  const adminSupabase = getAdminClient(c);

  let deleteQuery = adminSupabase.from("feeds").delete().eq("id", feedId);
  if (user.type !== "admin" && user.type !== "root") {
    deleteQuery = deleteQuery.eq("user_id", user.id);
  }

  const { error } = await deleteQuery;
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true }, 200);
}

feedsRouter.post("/feeds/:id/close", handleCloseFeed);
feedsRouter.delete("/feeds/:id", handleCloseFeed);

/**
 * GET /feed/:slug or GET /items/:id/rss - Return podcast XML
 */
async function handleRssXml(c: Context<{ Variables: Variables }>) {
  const slugOrId = c.req.param("slug") || c.req.param("id") || "";
  const adminSupabase = getAdminClient(c);
  const origin = getWebOrigin(c);

  // 1. Try finding feed by slug
  const { data: feedRow } = await adminSupabase
    .from("feeds")
    .select("*")
    .eq("slug", slugOrId)
    .maybeSingle();

  // 2. Resolve target item id
  const targetItemId = feedRow?.entity_id || slugOrId;

  const { data: item, error: itemError } = await adminSupabase
    .from("library_items")
    .select(
      "id, title, description, author_names_first_last, explicit, language, audio_files, updated_at, created_at",
    )
    .eq("id", targetItemId)
    .maybeSingle();

  if (itemError || !item) {
    return new Response("Feed or Audiobook not found", { status: 404 });
  }

  const title = item.title || feedRow?.title || "Audiobook";
  const author = item.author_names_first_last || feedRow?.author ||
    "Unknown Author";
  const description = item.description || feedRow?.description ||
    `${title} by ${author}`;
  const language = item.language || feedRow?.language || "en";
  const isExplicit = Boolean(item.explicit ?? feedRow?.explicit);
  const preventIndexing = feedRow ? Boolean(feedRow.prevent_indexing) : true;
  const feedSlug = feedRow?.slug || targetItemId;
  const coverUrl = `${origin}/api/items/${item.id}/cover`;

  const audioFiles = (item.audio_files as any[]) || [];
  const itemsXml = audioFiles.map((af: any, idx: number) => {
    const trackTitle = af.metadata?.title || af.metadata?.filename ||
      `Chapter ${idx + 1}`;
    const fileId = af.ino || af.id || idx;
    const streamUrl = `${origin}/api/feeds/${feedSlug}/stream/${fileId}`;
    const durationSec = Math.round(
      Number(af.duration || af.metadata?.duration || 0),
    );
    const sizeBytes = Number(af.size || af.metadata?.size || 0);
    const mimeType = af.mime_type || af.metadata?.mime_type || "audio/mpeg";
    const trackDate = toRfc822(item.updated_at || item.created_at);

    return `    <item>
      <title><![CDATA[${escapeXml(trackTitle)}]]></title>
      <description><![CDATA[${escapeXml(description)}]]></description>
      <guid isPermaLink="false">${escapeXml(String(fileId))}</guid>
      <pubDate>${trackDate}</pubDate>
      <enclosure url="${escapeXml(streamUrl)}" length="${sizeBytes}" type="${
      escapeXml(mimeType)
    }"/>
      <itunes:duration>${durationSec}</itunes:duration>
      <itunes:episode>${idx + 1}</itunes:episode>
      <itunes:author><![CDATA[${escapeXml(author)}]]></itunes:author>
      <itunes:explicit>${isExplicit ? "true" : "false"}</itunes:explicit>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <atom:link href="${origin}/feed/${feedSlug}" rel="self" type="application/rss+xml"/>
    <title><![CDATA[${escapeXml(title)}]]></title>
    <link>${origin}</link>
    <description><![CDATA[${escapeXml(description)}]]></description>
    <language>${escapeXml(language)}</language>
    <itunes:author><![CDATA[${escapeXml(author)}]]></itunes:author>
    <itunes:summary><![CDATA[${escapeXml(description)}]]></itunes:summary>
    <itunes:image href="${coverUrl}"/>
    <itunes:explicit>${isExplicit ? "true" : "false"}</itunes:explicit>
    <itunes:block>${preventIndexing ? "yes" : "no"}</itunes:block>
    <itunes:category text="Arts">
      <itunes:category text="Books"/>
    </itunes:category>
${
    feedRow?.owner_name || feedRow?.owner_email
      ? `    <itunes:owner>
      ${
        feedRow.owner_name
          ? `<itunes:name><![CDATA[${
            escapeXml(feedRow.owner_name)
          }]]></itunes:name>`
          : ""
      }
      ${
        feedRow.owner_email
          ? `<itunes:email>${escapeXml(feedRow.owner_email)}</itunes:email>`
          : ""
      }
    </itunes:owner>\n`
      : ""
  }${itemsXml}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

feedsRouter.get("/feed/:slug", handleRssXml);
feedsRouter.get("/items/:id/rss", handleRssXml);

/**
 * GET /feeds/:slug/stream/:trackId or /items/:id/file/:fileId/stream - 302 redirect to signed audio URL
 */
async function handleStreamRedirect(c: Context<{ Variables: Variables }>) {
  const slug = c.req.param("slug") || "";
  const itemId = c.req.param("id") || "";
  const trackId = c.req.param("trackId") || c.req.param("fileId") || "";

  const adminSupabase = getAdminClient(c);

  let targetItemId = itemId;
  if (!targetItemId && slug) {
    const { data: feed } = await adminSupabase
      .from("feeds")
      .select("entity_id")
      .eq("slug", slug)
      .maybeSingle();
    if (feed?.entity_id) {
      targetItemId = feed.entity_id;
    } else {
      targetItemId = slug;
    }
  }

  const { data: item } = await adminSupabase
    .from("library_items")
    .select("audio_files, library_files")
    .eq("id", targetItemId)
    .maybeSingle();

  if (!item) {
    return c.json({ error: "Item not found" }, 404);
  }

  const allFiles = [
    ...((item.audio_files as any[]) || []),
    ...((item.library_files as any[]) || []),
  ];
  const file =
    allFiles.find((f: any, idx: number) =>
      String(f.ino) === trackId || String(f.id) === trackId ||
      String(idx) === trackId
    ) || allFiles[Number(trackId)] || allFiles[0];

  if (!file) {
    return c.json({ error: "Audio track not found" }, 404);
  }

  const storagePath = String(
    file.metadata?.path || file.storage_path || file.path || "",
  );
  if (!storagePath) {
    return c.json({ error: "Storage path not found" }, 404);
  }

  const storage = new StorageRouter(adminSupabase);
  const STREAM_EXPIRY_SECONDS = 12 * 3600; // 12 hours for streaming

  try {
    const isLegacy = storagePath.startsWith("/") ||
      (!storagePath.includes("://") && storagePath.length > 0);
    if (isLegacy) {
      const resolved = await storage.resolveAndSign(
        storagePath,
        targetItemId,
        STREAM_EXPIRY_SECONDS,
      );
      return c.redirect(resolved.signedUrl, 302);
    }
    const signedUrl = await storage.getSignedUrl(
      storagePath,
      STREAM_EXPIRY_SECONDS,
    );
    return c.redirect(signedUrl, 302);
  } catch (_e) {
    const filename = storagePath.split("/").pop() || "";
    const cleanStoragePath = storagePath.replace(/^[a-z0-9-_]+:\/\//i, "")
      .replace(/^\/+/, "");
    const candidates = [
      `${targetItemId}/${filename}`,
      cleanStoragePath,
      cleanStoragePath.replace(/^audiobooks\//, ""),
      filename,
    ].filter(Boolean);

    const resolved = await storage.signFirstExisting(
      Array.from(new Set(candidates)),
      STREAM_EXPIRY_SECONDS,
    );
    if (resolved?.signedUrl) {
      return c.redirect(resolved.signedUrl, 302);
    }
    return c.json({ error: "Failed to resolve stream URL" }, 500);
  }
}

feedsRouter.get("/feeds/:slug/stream/:trackId", handleStreamRedirect);
feedsRouter.get("/items/:id/file/:fileId/stream", handleStreamRedirect);

/**
 * GET /opds - Root OPDS 1.2 Catalog Navigation Feed
 */
feedsRouter.get("/opds", async (c) => {
  const adminSupabase = getAdminClient(c);

  const user = await authenticateOpds(c, adminSupabase);
  if (!user) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Audiobookphile OPDS"',
      },
    });
  }

  const origin = getWebOrigin(c);
  const { data: libraries, error } = await adminSupabase.from("libraries")
    .select("id, name, updated_at").order("name");

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const entries = (libraries || []).map((lib: any) =>
    `  <entry>
    <title>${escapeXml(lib.name)}</title>
    <id>urn:audiobookphile:library:${lib.id}</id>
    <updated>${new Date(lib.updated_at || Date.now()).toISOString()}</updated>
    <content type="text">${escapeXml(lib.name)} Library</content>
    <link rel="subsection" href="${origin}/api/opds/libraries/${lib.id}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>`
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:audiobookphile:opds:root</id>
  <title>Audiobookphile OPDS Catalog</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>Audiobookphile</name>
    <uri>${origin}</uri>
  </author>
  <link rel="self" href="${origin}/api/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${origin}/api/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
${entries}
</feed>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type":
        "application/atom+xml; profile=opds-catalog; charset=utf-8",
    },
  });
});

/**
 * GET /opds/libraries/:id - OPDS 1.2 Acquisition Feed for Library
 */
feedsRouter.get("/opds/libraries/:id", async (c) => {
  const libraryId = c.req.param("id");
  const adminSupabase = getAdminClient(c);

  const user = await authenticateOpds(c, adminSupabase);
  if (!user) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Audiobookphile OPDS"',
      },
    });
  }

  const origin = getWebOrigin(c);
  const { data: library } = await adminSupabase
    .from("libraries")
    .select("id, name")
    .eq("id", libraryId)
    .maybeSingle();

  if (!library) {
    return new Response("Library not found", { status: 404 });
  }

  const { data: items, error } = await adminSupabase
    .from("library_items")
    .select(
      "id, title, duration, author_names_first_last, description, updated_at, created_at, audio_files",
    )
    .eq("library_id", libraryId)
    .order("title");

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const bookEntries = (items || []).map((item: any) => {
    const title = item.title || "Audiobook";
    const author = item.author_names_first_last || "Unknown Author";
    const description = item.description || `${title} by ${author}`;
    const coverUrl = `${origin}/api/items/${item.id}/cover`;
    const rssFeedUrl = `${origin}/feed/${item.id}`;
    const downloadUrl = `${origin}/api/items/${item.id}/download`;

    return `  <entry>
    <title><![CDATA[${escapeXml(title)}]]></title>
    <id>urn:audiobookphile:item:${item.id}</id>
    <updated>${
      new Date(item.updated_at || item.created_at || Date.now()).toISOString()
    }</updated>
    <author>
      <name><![CDATA[${escapeXml(author)}]]></name>
    </author>
    <summary><![CDATA[${escapeXml(description)}]]></summary>
    <link rel="http://opds-spec.org/image" href="${coverUrl}" type="image/jpeg"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="${coverUrl}" type="image/jpeg"/>
    <link rel="http://opds-spec.org/acquisition" href="${downloadUrl}" type="audio/mpeg"/>
    <link rel="alternate" href="${rssFeedUrl}" type="application/rss+xml"/>
  </entry>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:audiobookphile:library:${library.id}</id>
  <title><![CDATA[${escapeXml(library.name)}]]></title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>Audiobookphile</name>
    <uri>${origin}</uri>
  </author>
  <link rel="self" href="${origin}/api/opds/libraries/${library.id}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${origin}/api/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="up" href="${origin}/api/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
${bookEntries}
</feed>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type":
        "application/atom+xml; profile=opds-catalog; charset=utf-8",
    },
  });
});
