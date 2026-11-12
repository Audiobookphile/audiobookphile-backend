# Audiobookphile Backend 🗄️

The official Supabase backend for the [Audiobookphile](https://audiobookphile.app) ecosystem. This repository contains the PostgreSQL database schema, Row Level Security (RLS) policies, and Deno Edge Functions powering both the [Web](https://github.com/Audiobookphile/audiobookphile-web) and [Mobile](https://github.com/Audiobookphile/audiobookphile-app) applications.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green.svg)](https://supabase.com)
[![Deno](https://img.shields.io/badge/Runtime-Deno%20v2-black.svg)](https://deno.land)

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │    Client Apps (Web, iOS, Android)     │
                      └───────────────────┬────────────────────┘
                                          │
                     HTTPS / WSS (Bearer JWT, apikey)
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │         Supabase API Gateway           │
                      └──────────────┬──────────────────┬──────┘
                                     │                  │
                PostgREST (Direct RLS)                  │ /functions/v1/api/*
                                     │                  │
                                     ▼                  ▼
                    ┌──────────────────┐      ┌────────────────────────┐
                    │  PostgreSQL DB   │◄─────┤   Deno Edge Functions  │
                    │  - Schema & RLS  │      │   - Auth & WebAuthn    │
                    │  - Triggers      │      │   - Playback & Progress│
                    │  - Vault Secrets │      │   - Storage Presigning │
                    └────────┬─────────┘      └───────────┬────────────┘
                             │                            │
                             ▼                            ▼
                    ┌──────────────────┐      ┌────────────────────────┐
                    │ Supabase Storage │      │  Backblaze B2 Storage  │
                    │ (covers, backups)│      │  (multi-tier audio)    │
                    └──────────────────┘      └────────────────────────┘
```

---

## Tech Stack

- **Database Engine**: PostgreSQL 15+ (via Supabase) with `pg_crypto`, `pgjwt`, `uuid-ossp`, and `vault`.
- **Edge Runtime**: [Deno](https://deno.land) v2 with TypeScript.
- **Object Storage**: Native Supabase Storage (`covers`, `audio-files`, `backups`) and multi-tier Backblaze B2 presigned S3-compatible storage.
- **Local Toolchain**: Supabase CLI, Bun, and Deno.

---

## Repository Structure

```
├── supabase/
│   ├── migrations/       # Idempotent PostgreSQL schema migrations
│   ├── functions/        # Unified Deno Edge Functions
│   │   ├── _shared/      # Reusable utilities (CORS, B2, Sentry, storage router)
│   │   └── api/          # Unified Edge API routes (/auth, /items, /libraries, etc.)
│   └── config.toml       # Local Supabase CLI configuration
├── env/                  # Environment source of truth (env/local.env.example)
├── scripts/              # Automation and maintenance scripts (sync-env, health probes)
└── crates/               # Native Rust CLI utilities (backup, storage audit)
```

---

## Getting Started

### Prerequisites

1. **Docker Desktop** or container engine (for local Supabase emulation).
2. **Supabase CLI**:
   ```bash
   brew install supabase/tap/supabase
   # Or run via bun/npx:
   bunx supabase --version
   ```
3. **Deno** (v2.x) for running and testing Edge Functions:
   ```bash
   curl -fsSL https://deno.land/install.sh | sh
   ```
4. **Bun** for running maintenance scripts:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

### Quickstart

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Audiobookphile/audiobookphile-backend.git
   cd audiobookphile-backend
   ```

2. **Configure your local environment:**
   ```bash
   cp env/local.env.example env/local.env
   ./scripts/sync-env.sh
   ```

3. **Start local Supabase containers:**
   ```bash
   supabase start
   ```
   This will spin up PostgreSQL, PostgREST, GoTrue Auth, Storage, and Studio at `http://localhost:54323`.

4. **Serve Edge Functions locally:**
   ```bash
   supabase functions serve api --no-verify-jwt
   ```

---

## Database Migrations

All database schema definitions and Row Level Security policies are managed via versioned migration files in `supabase/migrations/`:

- **Create a new migration:**
  ```bash
  supabase migration new your_feature_name
  ```
- **Apply migrations locally:**
  ```bash
  supabase db reset
  ```
- **Deploy migrations to a linked remote project:**
  ```bash
  supabase db push
  ```

---

## Edge API Testing

The unified Edge API has comprehensive contract and unit tests:

```bash
deno test --allow-all supabase/functions/api/
```

---

## Deployment to Production

Database migrations and Edge Function updates are automatically pushed on merge to `main` via GitHub Actions (`.github/workflows/deploy-backend.yml`).

To deploy manually via the Supabase CLI:

```bash
# Link to your remote Supabase project
supabase link --project-ref <your-project-id>

# Push database migrations
supabase db push

# Deploy unified Edge API function
supabase functions deploy api --no-verify-jwt
```

---

## Related Repositories

- [Audiobookphile Web](https://github.com/Audiobookphile/audiobookphile-web) — Next.js 16 Web Application.
- [Audiobookphile Mobile App](https://github.com/Audiobookphile/audiobookphile-app) — Cross-platform iOS & Android mobile client.

---

## Security & Vulnerabilities

Please review our [Security Policy](./SECURITY.md) for vulnerability reporting procedures.

---

## License

This project is licensed under the [MIT License](./LICENSE).
