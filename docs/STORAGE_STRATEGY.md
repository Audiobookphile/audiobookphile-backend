# Hybrid Storage Architecture

Audiobookphile implements a high-throughput hybrid storage architecture that minimizes hosting costs while optimizing playback performance.

---

## 1. Storage Tiers

```
                                  Media File Ingestion
                                           │
                        ┌──────────────────┴──────────────────┐
                        │ File Size < 25 MB                   │ File Size >= 25 MB
                        ▼                                     ▼
             ┌─────────────────────┐               ┌─────────────────────┐
             │  Supabase Storage   │               │    Backblaze B2     │
             │   (Image CDN)       │               │ (S3 Compatible API) │
             └──────────┬──────────┘               └──────────┬──────────┘
                        │                                     │
                        │ Direct Public URL                   │ Dynamic S3 Presigned URL
                        ▼                                     ▼
                Browser / Client                      Browser / Client
```

---

## 2. Presigned URL Generation (`/api/playback/start`)

For large audio files (`>= 25MB`):
1. Client requests a stream URL:
   ```bash
   POST /api/playback/start { "itemId": "<uuid>" }
   ```
2. The Edge Function verifies user access and fetches the file's `storage_path` (e.g. `b2://my-bucket/audio.m4b`).
3. Using the AWS SDK S3 client configured with Backblaze B2 credentials (fetched from Supabase Vault), the Edge Function creates a presigned `GetObject` URL:
   ```typescript
   const command = new GetObjectCommand({
     Bucket: bucketName,
     Key: objectKey,
   });
   const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
   ```
4. The client receives the presigned URL with a 1-hour expiration.
5. The player streams directly from Backblaze B2 via HTTP range requests without burdening the Supabase Edge runtime or database.

---

## 3. Local Development Fallback

In local development environments where Backblaze B2 credentials may not be configured, the storage subsystem gracefully falls back to local storage directories or Supabase Storage buckets, ensuring developers can run and test the complete stack offline.

