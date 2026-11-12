# REST API Reference (`/api/*`)

All endpoints are hosted within the unified `api` Supabase Edge Function under `/functions/v1/api/*` (proxied by the web client at `/api/*`).

---

## 1. Authentication Endpoints (`/api/auth/*`)

### `POST /api/auth/login`
Authenticates a user with email and password.
- **Request Body**:
  ```json
  { "email": "user@example.com", "password": "securepassword" }
  ```
- **Response `200 OK`**:
  ```json
  {
    "user": { "id": "uuid", "email": "user@example.com", "type": "admin" },
    "token": "jwt_access_token",
    "refreshToken": "refresh_token"
  }
  ```

### `POST /api/auth/logout`
Revokes the current session and invalidates refresh tokens.

### `GET /api/me`
Retrieves the profile and permissions of the currently authenticated user.

---

## 2. Library & Item Endpoints (`/api/libraries/*`, `/api/items/*`)

### `GET /api/libraries`
Returns all libraries accessible to the user.

### `GET /api/libraries/:id/items`
Returns audiobooks and media items belonging to a library.
- **Query Parameters**:
  - `limit`: Number of items to return (default: `50`).
  - `offset`: Pagination offset.
  - `sort`: Field to sort by (`title`, `addedAt`, `publishedYear`).

### `GET /api/items/:id`
Returns full metadata, chapter marks, and duration for a single audiobook.

### `GET /api/items/:id/cover`
Returns the cover art image for an audiobook. Supports conditional requests (`If-Modified-Since`) and cache-busting timestamps.

---

## 3. Playback & Streaming Endpoints (`/api/playback/*`, `/api/session/*`)

### `POST /api/playback/start`
Initializes a playback session and returns a dynamic streaming URL.
- **Request Body**:
  ```json
  { "itemId": "uuid", "supportedMimeTypes": ["audio/mp4", "audio/mpeg"] }
  ```
- **Response `200 OK`**:
  ```json
  {
    "sessionId": "uuid",
    "streamUrl": "https://f000.backblazeb2.com/file/bucket/book.m4b?token=...",
    "startTime": 1245.5,
    "duration": 34820.0
  }
  ```

### `POST /api/session/:id/sync`
Synchronizes ongoing playback progress.
- **Request Body**:
  ```json
  { "currentTime": 1260.0, "timeListened": 15.0, "duration": 34820.0 }
  ```

---

## 4. Administration & Utilities

### `GET /api/health`
Health check endpoint reporting API uptime and database connectivity.

### `POST /api/backup-database`
*(Admin only)* Triggers an immediate schema and data export backup.
