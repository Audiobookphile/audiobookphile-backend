# Contributing to Audiobookphile Backend

Thank you for your interest in contributing to the Audiobookphile Supabase Backend! This repository houses the PostgreSQL schemas, migrations, Row Level Security (RLS) policies, and Deno Edge Functions that power the entire Audiobookphile ecosystem.

---

## Code of Conduct

All contributors and participants are expected to adhere to the [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Architecture & Principles

1. **Security at the Database Layer**: Every public table MUST have Row Level Security (RLS) enabled.
2. **Idempotent Migrations**: All migration files in `supabase/migrations/` must be idempotent (`CREATE TABLE IF NOT EXISTS`, `DO $$ BEGIN ... END $$`, etc.).
3. **Deno Edge Functions**: Edge functions run on the Deno runtime with TypeScript. Secrets are fetched via `Deno.env.get()` or Supabase Vault via `public.read_secret()`.

---

## Getting Started

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) (or `bunx supabase`).
- [Deno](https://deno.land/) (v2.x) for Edge Function development and testing.
- [Bun](https://bun.sh) for running helper scripts.
- Docker (for local Supabase emulation).

### Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Audiobookphile/audiobookphile-backend.git
   cd audiobookphile-backend
   ```

2. **Configure environment:**
   ```bash
   cp env/local.env.example env/local.env
   ./scripts/sync-env.sh
   ```

3. **Start local Supabase services:**
   ```bash
   supabase start
   ```

4. **Serve Edge Functions locally:**
   ```bash
   supabase functions serve api --no-verify-jwt
   ```

---

## Migration Guidelines

When adding or modifying database tables:
1. Generate a new migration file:
   ```bash
   supabase migration new descriptive_migration_name
   ```
2. Write declarative SQL and include appropriate indexes and RLS policies.
3. Test applying the migration against your local database:
   ```bash
   supabase db reset
   ```

---

## Edge Function Testing

Run the Deno unit tests for the unified Edge API:

```bash
deno test --allow-all supabase/functions/api/
```

---

## Submitting a Pull Request

1. **Create a topic branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Follow Conventional Commits:**
   - `feat(db): add audiobook chapter bookmarks table`
   - `fix(edge): prevent redundant cover fetch calls`
   - `docs(env): document Backblaze B2 multi-tier storage variables`
3. **Push to your fork and submit a PR:**
   - Detail any database schema changes or Edge Function additions.
   - Verify that all Deno tests and migration checks pass.
