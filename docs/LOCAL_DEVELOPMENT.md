# Local Development Guide

This guide walks through running the complete Audiobookphile backend locally using the Supabase CLI and Deno.

---

## 1. Prerequisites

- [Docker Desktop](https://www.docker.com/) or Podman running locally.
- [Supabase CLI](https://supabase.com/docs/guides/cli):
  ```bash
  brew install supabase/tap/supabase
  ```
- [Deno](https://deno.com/):
  ```bash
  brew install deno
  ```

---

## 2. Environment Initialization

Synchronize local environment files across all three repositories:

```bash
cd audiobookphile-backend
bash scripts/sync-env.sh
```

This creates:
- `env/local.env` (backend)
- `../audiobookphile-web/.env.local` (web client)
- `../audiobookphile-app/Skip.env` (mobile client)

---

## 3. Starting the Local Supabase Stack

```bash
supabase start
```

This starts:
- PostgreSQL database (`localhost:54322`)
- Supabase Studio dashboard (`http://localhost:54323`)
- Supabase Auth service
- Supabase Storage service
- In-memory Mailpit SMTP server (`http://localhost:54324`)

---

## 4. Running Tests & Audits

### Edge Function Tests
```bash
deno test --config supabase/functions/deno.json --allow-all supabase/functions/api/
```

### Security & Quality Audit
```bash
bash scripts/security-audit.sh
```
The audit scans 235+ files for hardcoded localhost URLs, secret leakage, and missing error handlers.

