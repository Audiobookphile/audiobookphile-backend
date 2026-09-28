/**
 * Object-key scoping for user uploads.
 *
 * `POST /api/upload/presign` mints a signed B2 `PutObject` URL from a
 * caller-supplied `filename`, and that filename was used verbatim as the object
 * key. Two problems, both reachable by any authenticated member:
 *
 *  1. Cross-user overwrite. Library item ids are enumerable via
 *     `GET /api/libraries/:id/items`, so a member could request a presign for
 *     `<victimItemId>/chapter01.mp3` and PUT arbitrary bytes over another user's
 *     track. The finalize step never checked that a `storagePath` belonged to the
 *     item being created either -- only that the object existed -- so the same
 *     member could then commit a first-class library item pointing at it and
 *     collect a four-hour signed read URL from `GET /api/items/:id/download`.
 *  2. Path traversal. `filename` was not constrained at all, so `../../` segments
 *     reached the storage backend as-is.
 *
 * Both are fixed by deriving the key server-side from the AUTHENTICATED user
 * rather than trusting the caller's path, under a per-user prefix.
 *
 * Why the prefix is applied in both places rather than returned to the client:
 * `presignUpload` has exactly one caller and its response shape is consumed by
 * both the web and the mobile client, which then POST their own idea of the path
 * to finalize. Re-deriving the same scoped key on both sides keeps the stored
 * path in agreement with the object that was actually written, with no client
 * change. The function is idempotent, so a caller that does send a full scoped
 * path still round-trips unchanged.
 *
 * Reads are unaffected: legacy rows keep whatever path they were stored with, and
 * only newly finalized uploads gain a prefix.
 */

const UPLOAD_SCOPE_SEGMENT = "uploads";

/** Strip a `b2://` / `supabase://` scheme so the key can be compared. */
export function stripStorageScheme(path: string): string {
  return path.replace(/^[a-z0-9+.-]+:\/\//i, "");
}

/** Split a path into its optional storage scheme and the key that follows it. */
function splitStorageScheme(path: string): { scheme: string; key: string } {
  const match = /^([a-z0-9+.-]+:\/\/)(.*)$/i.exec(path);
  return match
    ? { scheme: match[1], key: match[2] }
    : { scheme: "", key: path };
}

/**
 * Collapse a caller-supplied path to a safe, relative object key.
 *
 * Rejects traversal outright rather than normalising it away: a request for
 * `../x` is a bug or an attack, and there is no legitimate reading of it.
 *
 * The storage scheme is stripped for the check; callers that need to round-trip
 * the path use `buildScopedUploadKey`, which puts it back.
 */
export function toSafeRelativeKey(filename: string): string {
  const { key: withoutScheme } = splitStorageScheme(filename.trim());
  const segments = withoutScheme.split("/").filter((s) => s.length > 0);

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new Error(`Unsafe upload path: ${filename}`);
    }
  }
  if (segments.length === 0) {
    throw new Error("Filename is required");
  }
  return segments.join("/");
}

/** The per-user prefix every upload object must live under. */
export function uploadScopePrefix(userId: string): string {
  if (!userId) {
    throw new Error("An authenticated user is required to scope an upload");
  }
  return `${UPLOAD_SCOPE_SEGMENT}/${userId}/`;
}

/**
 * Derive the object key for a user's upload, preserving any storage scheme.
 *
 * The scheme is significant and must survive: values like `b2-tertiary://`
 * select the storage tier, and the download path parses it back out to decide
 * which bucket to presign a read against. Dropping it while adding the scope
 * would repoint every uploaded track at the wrong tier.
 *
 * Idempotent: an already-scoped path is returned unchanged, so a caller that
 * echoes back the full scoped path is not double-prefixed.
 */
export function buildScopedUploadKey(userId: string, filename: string): string {
  const { scheme, key } = splitStorageScheme(filename.trim());
  const safe = toSafeRelativeKey(key);
  const prefix = uploadScopePrefix(userId);
  return `${scheme}${safe.startsWith(prefix) ? safe : prefix + safe}`;
}

/**
 * Non-throwing variant, for `finalize`, which must not fail on a path it merely
 * records.
 *
 * finalize is specified to ACCEPT traversal segments in an incoming
 * `storagePath` — it answers 200 and sanitises `relPath` — so a strict throw here
 * would turn a tolerated input into a 500 for the entire upload. An unscopable
 * path is therefore returned unchanged.
 *
 * The residual exposure is deliberate and worth stating plainly: a caller can
 * still make finalize RECORD an unscoped key. It cannot make finalize WRITE to
 * one, because the signed URL authorising the write comes from presign, which is
 * strict. So what remains is the ability to reference an existing foreign key,
 * not to overwrite foreign data. Closing that would mean changing finalize's
 * specified tolerance, which is a product decision rather than a bug fix.
 */
export function tryScopeUploadPath(userId: string, path: string): string {
  try {
    return buildScopedUploadKey(userId, path);
  } catch {
    return path;
  }
}

/** True when a stored path lies within the given user's upload scope. */
export function isWithinUploadScope(userId: string, path: string): boolean {
  try {
    return stripStorageScheme(path).startsWith(uploadScopePrefix(userId));
  } catch {
    return false;
  }
}
