# Audiobookphile Backend Documentation 🗄️

Welcome to the documentation for [`audiobookphile-backend`](https://github.com/Audiobookphile/audiobookphile-backend), the serverless Supabase and Backblaze B2 backend for Audiobookphile.

## Documentation Index

- [**Architecture Guide**](./ARCHITECTURE.md): Multi-tier architecture overview, Supabase PostgreSQL, Deno Edge API, Backblaze B2 S3 storage, and security layers.
- [**API Reference**](./API_REFERENCE.md): Complete REST endpoint catalog for the unified Hono Edge Function (`/api/*`).
- [**Database Schema & RLS**](./DATABASE_SCHEMA.md): PostgreSQL tables, entity relationships, indexes, and Row Level Security (RLS) security matrix.
- [**Hybrid Storage Strategy**](./STORAGE_STRATEGY.md): Multi-tier storage architecture, S3 presigned URL generation, and fallback streaming.
- [**Local Development Guide**](./LOCAL_DEVELOPMENT.md): Supabase CLI setup, `sync-env.sh` environment synchronization, and Deno test execution.
- [**Environment Variables**](./ENV.md): Exhaustive environment variable reference for local development and production.
- [**Operations & Backups**](./OPERATIONS.md): Operational runbooks, database backups, automated health probes, and migration workflows.

---

## Quick Reference Commands

```bash
# Run security & quality audit across monorepo
bash scripts/security-audit.sh

# Run full Edge Function test suite (179+ tests)
deno test --config supabase/functions/deno.json --allow-all supabase/functions/api/

# Synchronize local environment files across repos
bash scripts/sync-env.sh
```

