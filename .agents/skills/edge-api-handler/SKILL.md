---
name: edge-api-handler
description: Scaffolding, security patterns, and testing protocols for Deno Edge Functions in the Audiobookphile Supabase backend.
---

# Edge API Handler (Audiobookphile Backend)

All backend endpoints are executed serverlessly as Deno Edge Functions inside `supabase/functions/api/`.

## Core Conventions

1. **Routing with Hono**:
   - Sub-routes in `supabase/functions/api/routes/<name>.ts`.
   - Mount in `supabase/functions/api/index.ts`.
2. **Context & Dependency Injection**:
   - Variables are typed via `Variables` (`supabase`, `user`, `requestId`).
   - Access the Supabase client: `const supabase = c.get('supabase')`.
   - Access authenticated user: `const user = c.get('user')`.
3. **Security Standards**:
   - Never log authorization headers, passwords, or personal credentials.
   - Sentry error capture is wired globally in `index.ts`.
   - Always return typed JSON responses with appropriate HTTP error codes.
4. **Testing Protocol**:
   - Every route MUST have a corresponding Deno test in `supabase/functions/api/<name>_test.ts`.
   - Run tests:
     ```bash
     deno test --config supabase/functions/deno.json --allow-all supabase/functions/api/
     ```
