---
name: security-audit
description: Monorepo pre-push security audit rules, regex validations, and zero hardcoded secret policies.
---

# Security Audit Protocol (Audiobookphile Backend)

Every pull request and git push executes `scripts/security-audit.sh` via Lefthook.

## Audited Invariants

1. **Zero Hardcoded Localhost**:
   - Production source files in `crates/cli` and `supabase/functions/api` must NEVER contain hardcoded `localhost` or `127.0.0.1` URLs.
   - Use dynamic environment variables: `env::var("SUPABASE_URL").or_else(...)`.
2. **Zero Hardcoded Supabase Project IDs**:
   - Project refs like `kfidobawnbziftwxavyl` must never appear in tracked source code, config files, or git history.
3. **Zero Secrets in Git**:
   - `.env`, `.env.*`, `env/*.env`, `*.p8`, and private credentials must remain in `.gitignore`.
   - Use `env/local.env.example` as the canonical documentation of required variables.
4. **Execution**:
   ```bash
   bash scripts/security-audit.sh
   ```
   Must exit with code `0` and scan all tracked files cleanly.

