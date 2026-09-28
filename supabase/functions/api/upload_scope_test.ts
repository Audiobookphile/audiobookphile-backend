import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildScopedUploadKey,
  isWithinUploadScope,
  stripStorageScheme,
  toSafeRelativeKey,
  tryScopeUploadPath,
  uploadScopePrefix,
} from "../_shared/uploadScope.ts";

/**
 * Upload object-key scoping.
 *
 * `POST /api/upload/presign` mints a signed B2 `PutObject` URL from a
 * caller-supplied `filename` that was used verbatim as the object key, reachable by
 * any authenticated member. Both of these were possible:
 *
 *  1. Overwriting another member's audio. Library item ids are enumerable via
 *     `GET /api/libraries/:id/items`, so presigning `<victimItemId>/chapter01.mp3`
 *     and PUTting bytes over it destroyed a book another user depends on. Finalize
 *     never checked that a `storagePath` belonged to the item being created, only
 *     that the object existed, so the same member could then mint a library item
 *     pointing at it and collect a signed read URL.
 *  2. Path traversal. `filename` had no constraints at all, so `../` segments
 *     reached the storage backend unchanged.
 */
const ALICE = "alice-user-id";
const BOB = "bob-user-id";

Deno.test("uploadScope: a key is namespaced to the uploading user", () => {
  assertEquals(
    buildScopedUploadKey(ALICE, "item-1/track01.mp3"),
    `uploads/${ALICE}/item-1/track01.mp3`,
  );
});

Deno.test("uploadScope: one member cannot write into another's namespace", () => {
  // The overwrite attack, from its own side: whatever the attacker names, the key
  // lands under the attacker's id, not the victim's.
  const attackerKey = buildScopedUploadKey(ALICE, "victim-item/chapter01.mp3");
  assert(attackerKey.startsWith(`uploads/${ALICE}/`));
  assert(
    !isWithinUploadScope(BOB, attackerKey),
    "must not be inside another user's scope",
  );
  // And naming a victim's scope explicitly does not escape it either -- the
  // function re-derives the prefix from the authenticated user.
  const forged = buildScopedUploadKey(
    ALICE,
    `uploads/${BOB}/item-1/track01.mp3`,
  );
  assert(forged.startsWith(`uploads/${ALICE}/`));
});

Deno.test("uploadScope: the rule is idempotent", () => {
  // Required for the finalize re-derivation to be safe: a client that echoes back
  // the full scoped path must not get a second prefix.
  const once = buildScopedUploadKey(ALICE, "item-1/track01.mp3");
  const twice = buildScopedUploadKey(ALICE, once);
  assertEquals(twice, once);
});

Deno.test("uploadScope: path traversal is rejected, not normalised", () => {
  // There is no legitimate reading of a request for `../x`.
  for (
    const hostile of [
      "../other/item/track.mp3",
      "item-1/../../victim/track.mp3",
      "..",
      "./../x",
    ]
  ) {
    assertThrows(
      () => buildScopedUploadKey(ALICE, hostile),
      Error,
      "Unsafe upload path",
      `expected ${hostile} to be rejected`,
    );
  }
});

Deno.test("uploadScope: leading and duplicated slashes are collapsed", () => {
  // Not attacks, just sloppy clients. The key must stay a clean relative path.
  assertEquals(toSafeRelativeKey("/item-1//track01.mp3"), "item-1/track01.mp3");
  assertEquals(
    buildScopedUploadKey(ALICE, "///item-1/track01.mp3"),
    `uploads/${ALICE}/item-1/track01.mp3`,
  );
});

Deno.test("uploadScope: the storage scheme is preserved through scoping", () => {
  // finalize receives `b2-tertiary://...` paths, and that scheme selects the
  // storage TIER -- the download path parses it back out to decide which bucket to
  // presign a read against. Scoping must not drop it, or every uploaded track
  // gets repointed at the wrong bucket.
  assertEquals(stripStorageScheme("b2://item-1/a.mp3"), "item-1/a.mp3");
  assertEquals(
    buildScopedUploadKey(ALICE, "supabase://covers/item-1/cover.jpg"),
    `supabase://uploads/${ALICE}/covers/item-1/cover.jpg`,
  );
  assertEquals(
    buildScopedUploadKey(ALICE, `b2-tertiary://item-1/a.mp3`),
    `b2-tertiary://uploads/${ALICE}/item-1/a.mp3`,
  );
  // Scoping a scheme-bearing path is still idempotent, scheme included.
  const once = buildScopedUploadKey(ALICE, "b2-test://item-1/a.mp3");
  assertEquals(buildScopedUploadKey(ALICE, once), once);
  assert(isWithinUploadScope(ALICE, `b2://uploads/${ALICE}/item-1/a.mp3`));
});

Deno.test("uploadScope: finalize's variant never throws on an unscopable path", () => {
  // finalize is SPECIFIED to accept traversal segments in a storagePath: it
  // answers 200 and neutralises them into relPath. A strict throw there would
  // turn a tolerated input into a 500 for the whole upload.
  const hostile = "b2-test://item/../../evil.mp3";
  assertEquals(
    tryScopeUploadPath(ALICE, hostile),
    hostile,
    "preserved unchanged",
  );

  // A well-formed path is still scoped, so the common path gains the guarantee.
  assertEquals(
    tryScopeUploadPath(ALICE, "b2-test://item-1/a.mp3"),
    `b2-test://uploads/${ALICE}/item-1/a.mp3`,
  );
  // And an empty user id must not collapse everything into one shared prefix.
  assertEquals(tryScopeUploadPath("", "item-1/a.mp3"), "item-1/a.mp3");
});

Deno.test("uploadScope: an unauthenticated caller cannot scope an upload", () => {
  // Fails closed rather than producing a key under an empty scope segment, which
  // would collapse every anonymous upload into one shared prefix.
  assertThrows(() => uploadScopePrefix(""), Error);
  assertThrows(() => buildScopedUploadKey("", "item-1/a.mp3"), Error);
  assert(!isWithinUploadScope("", "uploads//item-1/a.mp3"));
});

Deno.test("uploadScope: isWithinUploadScope is an exact prefix test", () => {
  const key = buildScopedUploadKey(ALICE, "item-1/a.mp3");
  assert(isWithinUploadScope(ALICE, key));
  assert(!isWithinUploadScope(BOB, key));
  // A user whose id is a prefix of another's must not match their scope.
  assert(!isWithinUploadScope("alice", key), "partial id must not pass");
});
