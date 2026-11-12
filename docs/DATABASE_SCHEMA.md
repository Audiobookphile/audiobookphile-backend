# Database Schema & Security Matrix

Audiobookphile runs on **PostgreSQL 15+** managed via Supabase migrations.

---

## 1. Core Tables & Relationships

```
              ┌───────────────┐
              │  auth.users   │
              └───────┬───────┘
                      │ 1:1
                      ▼
              ┌───────────────┐
              │ public.users  │
              └───────┬───────┘
                      │
        ┌─────────────┴─────────────┐
        │ 1:N                       │ 1:N
        ▼                           ▼
┌───────────────┐           ┌────────────────────┐
│   libraries   │           │   media_progress   │
└───────┬───────┘           └─────────┬──────────┘
        │ 1:N                         │
        ▼                             │ N:1
┌───────────────┐                     │
│ library_items │◄────────────────────┘
└───────┬───────┘
        │ 1:N
        ▼
┌───────────────┐
│   chapters    │
└───────────────┘
```

---

## 2. Table Specifications

### `public.users`
Extends `auth.users` with application-level profile data.
- `id`: `UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `email`: `TEXT NOT NULL UNIQUE`
- `type`: `TEXT NOT NULL DEFAULT 'member'` (`'root'`, `'admin'`, `'member'`)
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())`

### `public.libraries`
Top-level organizational collection (e.g., "Audiobooks", "Podcasts").
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `name`: `TEXT NOT NULL`
- `media_type`: `TEXT NOT NULL DEFAULT 'book'`
- `folders`: `JSONB DEFAULT '[]'::jsonb`

### `public.library_items`
Individual audiobooks or podcast episodes.
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `library_id`: `UUID NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE`
- `title`: `TEXT NOT NULL`
- `author`: `TEXT`
- `narrator`: `TEXT`
- `duration`: `NUMERIC DEFAULT 0`
- `size`: `BIGINT DEFAULT 0`
- `storage_path`: `TEXT NOT NULL` (e.g. `b2://audiobookphile-media/author/title.m4b`)
- `cover_path`: `TEXT` (e.g. `supabase://covers/item-id.jpg`)

### `public.media_progress`
User listening progress tracking.
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id`: `UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE`
- `library_item_id`: `UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE`
- `current_time`: `NUMERIC NOT NULL DEFAULT 0`
- `is_finished`: `BOOLEAN NOT NULL DEFAULT FALSE`
- `last_listened_at`: `TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())`

---

## 3. Row Level Security (RLS) Matrix

| Table | Operation | Role | Policy Rule |
|---|---|---|---|
| `users` | `SELECT` | `authenticated` | `auth.uid() = id OR public.is_admin()` |
| `libraries` | `SELECT` | `authenticated` | Permitted for all authenticated users |
| `libraries` | `ALL` | `authenticated` | `public.is_admin()` |
| `library_items` | `SELECT` | `authenticated` | Permitted for all authenticated users |
| `library_items` | `ALL` | `authenticated` | `public.is_admin()` |
| `media_progress` | `ALL` | `authenticated` | `auth.uid() = user_id` |

