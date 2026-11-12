---
name: supabase-migrations
description: Guidelines for authoring PostgreSQL migrations, Row Level Security (RLS) policies, and indexing in Audiobookphile.
---

# Supabase Migrations & Database Design (Audiobookphile Backend)

## Migration Guidelines

1. **Idempotence**:
   - Write migrations defensively (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
   - Use deterministic timestamp prefixes: `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql`.
2. **Row Level Security (RLS) Baseline**:
   - `ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;` is mandatory for all public tables.
   - Separate policies for authenticated users vs service role operations.
   - Enforce user tenant isolation: `USING (auth.uid() = user_id)`.
3. **Foreign Keys & Cascading**:
   - Explicit `ON DELETE CASCADE` for child records (e.g., chapter bookmarks when an item is deleted).
   - Foreign key indexes on high-throughput query columns (`user_id`, `library_id`, `item_id`).
4. **Verification**:
   - Run `supabase db reset` locally to test migration replayability from scratch.
   - Ensure `deno test` passes against the new schema.

