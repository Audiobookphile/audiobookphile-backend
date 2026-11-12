# Backend Architecture & Systems Design

The Audiobookphile backend provides a completely serverless, high-concurrency API and storage backbone built atop **Supabase** and **Backblaze B2**.

```
                           ┌───────────────────────────┐
                           │   Clients (Web / Mobile)  │
                           └─────────────┬─────────────┘
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │    Supabase Edge Functions (Deno)     │
                     │    - Hono Routing Framework           │
                     │    - JWT Authentication & RBAC        │
                     │    - Non-throwing API Handlers        │
                     │    - Sentry Global Error Reporting    │
                     └───────┬───────────────────────┬───────┘
                             │                       │
                SQL / RLS    │                       │ S3 Presigned URLs
                             ▼                       ▼
               ┌───────────────────────────┐   ┌───────────────────────────┐
               │    PostgreSQL Database    │   │     Backblaze B2 (S3)     │
               │    - Row Level Security   │   │    - Multi-GB Audiobooks  │
               │    - Vault Secret Store   │   │    - Direct Client Stream │
               │    - pgvector Embeddings  │   │    - Range Request Byte   │
               └───────────────────────────┘   └───────────────────────────┘
```

---

## 1. System Components

### A. Edge Function API Layer (`supabase/functions/api/`)
- Powered by **Deno 2.x** and **Hono 4.x**.
- Provides a unified REST API interface for all clients (Web, iOS, Android).
- Zero cold-start latency with edge distribution across global regions.
- Authenticates users via Supabase Auth JWTs.

### B. PostgreSQL Database
- PostgreSQL 15+ hosted on Supabase.
- Strict **Row Level Security (RLS)** guarantees multi-tenant isolation.
- Sensitive API keys (Sentry, Backblaze, LLM providers) stored encrypted in **Supabase Vault**.

### C. Multi-Tier Hybrid Storage
- **Supabase Storage**: Low-latency storage for book cover art and user avatars.
- **Backblaze B2**: High-capacity S3-compatible cloud storage for multi-gigabyte audiobooks and podcasts.
- Clients stream audio directly from Backblaze B2 via short-lived presigned URLs generated on-demand by the API.

---

## 2. Authentication & Authorization Flow

1. Client signs in via `/api/auth/login` (email/password), OAuth (Google), or Passkey (WebAuthn).
2. Supabase Auth returns a short-lived access JWT and an HTTP-only refresh token.
3. Every request to `/api/*` transmits the JWT in the `Authorization: Bearer <token>` header.
4. Edge Function middleware decodes the JWT and validates user roles:
   - `root`: Global system administrator.
   - `admin`: Library and user administrator.
   - `member`: Standard listener with restricted permissions.

