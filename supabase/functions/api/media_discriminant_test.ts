// Contract-drift guard: the mapper must emit every field the client's media-type
// narrowing depends on.
//
// ── WHY THIS TEST EXISTS ──
// `isBookMedia(media)` in the web is `media.mediaType === 'book'`, and it is
// the only thing the app narrows on to decide whether a book is playable. The
// mapper set `mediaType` on the *parent item* but not inside `media`, so every
// book looked like a podcast, playability fell through to the podcast branch,
// and **not a single Play button rendered anywhere in the app** -- while the API
// contract tests, the unit tests, and the playback endpoint all passed
// perfectly.
//
// Nothing caught it, because both sides were internally consistent: the schema
// omitted `mediaType` from `BookMediaSchema` too, so the type, the schema and
// the payload all agreed with each other and disagreed only with the client.
//
// The invariant worth pinning is therefore narrow and mechanical: the discriminant
// the client narrows on must be present in the media object the mapper builds,
// and declared in the schema that describes it. If someone later "tidies up" the
// redundant-looking `mediaType`, this fails immediately instead of silently
// removing every Play button in the product.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BookMediaSchema } from "../../../src/types/schemas.ts";
import { mapBookForMobile } from "./mappers.ts";

/** Minimal row shaped like the real `library_items` row the mapper reads. */
function fakeBook(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    library_id: "22222222-2222-4222-8222-222222222222",
    title: "A Perfectly Ordinary Book",
    author_names_first_last: "A. Author",
    media_type: "book",
    cover_path: null,
    duration: 3600,
    size: 1024,
    is_missing: false,
    is_invalid: false,
    tags: [],
    genres: [],
    narrators: [],
    subtitle: null,
    published_year: null,
    published_date: null,
    publisher: null,
    description: null,
    isbn: null,
    asin: null,
    language: null,
    explicit: false,
    abridged: false,
    path: "/audiobooks/x",
    rel_path: "x",
    ino: "1",
    is_file: false,
    mtime: 0,
    ctime: 0,
    birthtime: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    audio_files: [
      {
        index: 1,
        ino: "1",
        duration: 3600,
        metadata: {
          filename: "01 - Opening.mp3",
          ext: "mp3",
          path: "b2://abc/01 - Opening.mp3",
          relPath: "01 - Opening.mp3",
          size: 1024,
          mtimeMs: 0,
          ctimeMs: 0,
          birthtimeMs: 0,
        },
      },
    ],
    chapters: [],
    book_authors: [],
    book_series: [],
    ...overrides,
  };
}

Deno.test("mapBookForMobile: media carries the discriminant the client narrows on", () => {
  const mapped = mapBookForMobile(fakeBook() as never) as {
    mediaType?: string;
    media: { mediaType?: string; numTracks?: number };
  };

  // The parent always had it; the media object did not. That asymmetry is the
  // whole bug, so both are asserted together.
  assertEquals(
    mapped.mediaType,
    "book",
    "parent discriminant missing",
  );
  assertEquals(
    mapped.media?.mediaType,
    "book",
    "media.mediaType missing: isBookMedia(media) will return false and every book will be treated as a podcast",
  );
});

Deno.test("BookMediaSchema declares the discriminant the client narrows on", () => {
  // A schema that omits the field makes the drift invisible to typecheck,
  // which is precisely how the original bug survived review.
  const shape = BookMediaSchema.shape as Record<string, unknown>;
  assertEquals(
    "mediaType" in shape,
    true,
    "BookMediaSchema must declare mediaType, or the mapper can omit it without any check failing",
  );
});

Deno.test("mapBookForMobile: a podcast item is discriminated as a podcast", () => {
  const mapped = mapBookForMobile(
    fakeBook({ media_type: "podcast" }) as never,
  ) as { mediaType?: string; media: { mediaType?: string } };
  assertEquals(mapped.mediaType, "podcast");
  assertEquals(mapped.media?.mediaType, "podcast");
});

Deno.test("mapBookForMobile: list mode still advertises playability", () => {
  // The shelf projection omits audio_files to stay small, so numTracks comes
  // from the trigger-maintained counter instead. Without it the client has no
  // way to tell a playable book from an empty one.
  const mapped = mapBookForMobile(
    fakeBook() as never,
    undefined,
    { includeFiles: false },
  ) as {
    media: { mediaType?: string; numTracks?: number; audioFiles?: unknown[] };
  };
  assertEquals(mapped.media?.mediaType, "book");
  assertEquals(
    typeof mapped.media?.numTracks,
    "number",
    "list mode must report a numTracks so the shelf can decide playability",
  );
});

Deno.test("mapBookForMobile: the terminal 'missing' cover sentinel reaches the client verbatim", () => {
  // cover_path = 'missing' is a terminal verdict: the backend confirmed the
  // work genuinely has no art. The cover endpoint answers it with a JSON 404
  // that the browser blocks in an <img> (ORB), so the client short-circuits
  // it to the local placeholder. The mapper used to rewrite the sentinel to
  // the API URL, which made that short-circuit dead code in production and
  // sent every sentinel item on a request that could never succeed.
  const mapped = mapBookForMobile(
    fakeBook({ cover_path: "missing" }) as never,
  ) as { media: { coverPath?: string | null } };
  assertEquals(
    mapped.media?.coverPath,
    "missing",
    "the sentinel must be emitted verbatim, not rewritten to the cover API URL",
  );
});

Deno.test("mapBookForMobile: a null cover path still maps to the cover API URL", () => {
  // Null means "unknown, let the endpoint try the providers on the fly" --
  // the opposite verdict from 'missing', and it must keep requesting.
  const mapped = mapBookForMobile(
    fakeBook({ cover_path: null }) as never,
  ) as { media: { coverPath?: string | null } };
  assertEquals(
    mapped.media?.coverPath,
    "/api/items/11111111-1111-4111-8111-111111111111/cover",
  );
});
