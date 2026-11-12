# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it by
opening a
[GitHub Security Advisory](https://github.com/Audiobookphile/audiobookphile-backend/security/advisories/new)
or by emailing the maintainer directly. All reports will be reviewed promptly.

Please include the following in your report:

- Type of issue (e.g., XSS, SQL injection, authentication bypass, insecure
  direct object reference)
- The affected file, component, or endpoint
- Step-by-step instructions to reproduce the issue
- Potential impact of the vulnerability

## Scope

This repository covers the Audiobookphile Supabase backend, including PostgreSQL
database schemas, migrations, Row Level Security (RLS) policies, and Deno Edge
Functions.

### Key Security Boundaries

- Row Level Security (RLS) is strictly enforced at the database engine level on
  every public table. All client access is bounded by user ownership or tenant
  isolation.
- Supabase Vault (`vault.secrets`) encrypts production credentials and Sentry
  DSNs at rest, accessible only through the security-definer function
  `public.read_secret()` restricted to `service_role`.
- Edge Functions authenticate incoming requests with Supabase JWT bearer tokens
  and validate role-based scopes (`user_type` = `root`, `admin`, `user`).
- Storage audio files and private attachments use time-limited presigned S3/B2
  URLs generated on demand.

## Supported Versions

Security updates are provided for the latest release on the `main` branch.

## Acknowledgements

We appreciate the work of security researchers who help keep this project and
its users safe.
