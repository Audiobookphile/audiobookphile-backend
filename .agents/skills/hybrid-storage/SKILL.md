---
name: hybrid-storage
description: Multi-tier storage architecture, S3-compatible Backblaze B2 presigning, and Supabase Storage rules.
---

# Hybrid Storage Architecture (Audiobookphile Backend)

Audiobookphile uses a cost-optimized, high-throughput dual-tier storage strategy:

## Tiering Matrix

| Asset Type | Typical Size | Storage Provider | URL Scheme | Access Method |
|---|---|---|---|---|
| **Cover Art / Images** | < 25 MB | Supabase Storage | `supabase://` | Public CDN / cached signed URL |
| **Audiobook Files (M4B, MP3)** | >= 25 MB (up to 10GB+) | Backblaze B2 | `b2://` | Dynamic S3 Presigned URL (1h TTL) |

## Implementation Rules

1. **Audio Streaming Presigning**:
   - The `/api/playback/start` endpoint dynamically generates presigned S3 URLs via `@aws-sdk/s3-request-presigner`.
   - Never expose raw Backblaze B2 master keys or secret application keys to clients.
2. **Fallback Streaming**:
   - If direct B2 presigning is not configured (e.g. in local dev), the API falls back to streaming directly from local storage or Supabase Storage buckets.
3. **Rust CLI Storage Management**:
   - The `audiobookphile-cli` tool in `crates/cli` manages bulk uploads and backups.
   - It reads `SUPABASE_URL` dynamically from the environment and enforces multi-part uploads with retry exponential backoff.

