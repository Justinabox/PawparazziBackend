# Pawparazzi API Reference

This document describes every HTTP endpoint exposed by the Pawparazzi Cloudflare Worker, the required inputs, validations, and returned payloads. All routes live under the same base URL (the worker's public hostname).

## Conventions

- **Content type**: request bodies must be JSON with `Content-Type: application/json`. Only string fields are consumed.
- **Response envelope**: every JSON response includes:

  ```json
  {
    "success": true,
    "error": "",
    "...additional fields"
  }
  ```

  On failures `success` is `false` and `error` contains a message; other fields may be omitted or set to useful defaults.
- **Authentication**: authenticated endpoints expect a `session_token` string in the JSON body. Tokens are 64-character SHA-256 hex strings issued by `/users/register` or `/users/login`.
- **Status codes**: validation problems return `400`, authentication failures return `401`, missing records return `404`, conflicts return `409`, and unexpected server errors return `500` unless otherwise noted.

## Domain Objects

- **User** (`user` in responses):
  - `username` (string), `bio` (nullable string), `location` (nullable string), `email` (string), `avatar_url` (nullable string pointing to the user's R2/CDN avatar).
- **Cat** (`cat` entries in listings or detail responses):
  - `id` (UUID v4), `name`, `tags` (`string[]`), `created_at` (ISO timestamp), `username` (owner), `description` (nullable), `location.latitude`/`longitude` (`number | null`), `image_url` (string pointing to R2/CDN), `likes` (number), `poster_avatar_url` (nullable string pointing to the owner's avatar), `user_liked` (boolean indicating whether the requesting user has liked the post; defaults to `false` when no session token is supplied).
- **FollowerSummary** (`followers` array items):
  - `username`, `bio`, `location`, `avatar_url`, `followed_at` (ISO timestamp).
- **Pagination helpers**:
  - Cat list/search responses include `next_cursor` (base64 string encoding `{ created_at, id }`); treat as opaque.
  - Follower listings include `next_cursor` (ISO timestamp string) to be passed back as the `cursor` query/body field.

## Endpoints

### Root

#### `GET /`

Returns `200 OK` with the plain text body `Hello World!`. Useful for health checks.

### User Endpoints

#### `GET /users/checkUsername`

Check whether a username is available.

- **Query parameters**: `username` (required). If omitted in the URL, you may place `username` in the JSON body.
- **Validation**: username must be 4–32 characters.
- **Success** `200 OK`:
  ```json
  { "success": true, "error": "", "available": true }
  ```
- **Failure** `400 Bad Request`: `available` is set to `false`.

#### `POST /users/register`

Create a new user and issue a session token.

- **Body fields**:
  - `username` (string, 4–32 chars)
  - `passwd_hash` (string, 64-char SHA-256 hex)
  - `email` (valid email address; automatically lower-cased before storage)
- **Success** `200 OK`:
  ```json
  { "success": true, "error": "", "session_token": "…" }
  ```
- **Failure**:
  - `400` for validation issues (invalid username/email/hash)
  - `409` when the username or email is already registered
  - `500` for storage errors

#### `POST /users/login`

Authenticate a user and rotate their session token.

- **Body fields**: `email`, `passwd_hash` (same format as registration; email is normalized to lowercase before verification).
- **Success** `200 OK`:
  ```json
  {
    "success": true,
    "error": "",
    "session_token": "…",
    "user": {
      "username": "…",
      "bio": null,
      "location": null,
      "email": "…",
      "avatar_url": null
    }
  }
  ```
- **Failure**:
  - `400` invalid email format or malformed hash
  - `401` invalid credentials
  - `500` Supabase errors

#### `GET /users/profile`

Return the authenticated user's profile using their current session token.

- **Query parameters / body fields**:
  - `session_token` (required). You may supply this either as a `session_token` query parameter or inside a JSON body.
- **Success** `200 OK`:
  ```json
  {
    "success": true,
    "error": "",
    "user": {
      "username": "catfan",
      "bio": null,
      "location": null,
      "email": "catfan@example.com",
      "avatar_url": null
    }
  }
  ```
- **Failure**:
  - `401` missing/invalid session token
  - `500` Supabase read errors

#### `POST /users/update`

Update the authenticated user's profile.

- **Body fields**:
  - `session_token` (required)
  - `bio` (optional string or `null`)
  - `location` (optional string or `null`)
- **Success** `200 OK`: `{ "success": true, "error": "", "user": { …updated profile with avatar_url… } }`
- **Failure**:
  - `401` missing/invalid session token
  - `500` update errors

#### `POST /users/changePassword`

Change the authenticated user's password.

- **Body fields**:
  - `session_token` (required)
  - `current_passwd_hash` (required SHA-256 hex)
  - `new_passwd_hash` (required SHA-256 hex)
- **Success** `200 OK`: `{ "success": true, "error": "" }`
- **Failure**:
  - `401` invalid session token or wrong current password
  - `400` malformed hashes

#### `POST /users/changeAvatar`

Upload and persist a new avatar for the authenticated user.

- **Body fields**:
  - `session_token` (required)
  - `avatar_base64` (required; same formats as `image_base64` in cat uploads, but limited to 5 MB; accepts optional `data:image/{jpeg|png|webp};base64,…` prefix)
- **Behavior**: validates the session token, uploads the decoded image to R2 at `avatars/<username>/<uuid>.<ext>`, deletes the previous avatar if one existed, updates the user record, and returns the refreshed profile.
- **Success** `200 OK`:
  ```json
  {
    "success": true,
    "error": "",
    "user": {
      "username": "catfan",
      "bio": null,
      "location": null,
      "email": "catfan@example.com",
      "avatar_url": "https://cdn.example.com/avatars/catfan/abc123.jpg"
    }
  }
  ```
- **Failure**:
  - `401` missing/invalid session token
  - `400` invalid or unsupported `avatar_base64`
  - `413` when the payload exceeds 5 MB
  - `500` for storage/R2 errors

### Follow Endpoints

#### `POST /users/follow`

Follow or unfollow another user.

- **Body fields**:
  - `session_token` (required)
  - `target_username` (required, validated same as other usernames)
  - `action` (optional, `"follow"` default or `"unfollow"`)
- **Success** `200 OK`: `{ "success": true, "error": "", "status": "followed" | "unfollowed" }`
- **Failure**:
  - `401` invalid session token
  - `400` invalid usernames, invalid action, or attempts to (un)follow self
  - `404` target user not found
  - `500` Supabase write errors

#### `GET /users/listFollowers`

List followers for a public profile. Authentication is not required.

- **Query parameters** (can also be provided in the JSON body for backwards compatibility):
  - `username` (required)
  - `limit` (optional, defaults to 25, capped at 100)
  - `cursor` (optional ISO timestamp returned by `next_cursor`)
- **Success** `200 OK`:
  ```json
  {
    "success": true,
    "error": "",
    "followers": [
      {
        "username": "catfan",
        "bio": null,
        "location": "Berlin",
        "avatar_url": "https://cdn.example.com/avatars/catfan/avatar.jpg",
        "followed_at": "2024-05-01T12:34:56Z"
      }
    ],
    "next_cursor": "2024-04-30T09:00:00Z"
  }
  ```
- **Failure**:
  - `400` invalid usernames, limit, or cursor formats
  - `404` when the target user does not exist
  - `500` Supabase read errors

### Cat Endpoints

#### `POST /cats/post`

Create a new cat post. Requires authentication.

- **Body fields**:
  - `session_token` (required)
  - `name` (required, <= 100 characters)
  - `description` (optional, <= 500 characters)
  - `tags` (optional comma-separated list, max 10 unique tags, each <= 32 chars; comparison is case-insensitive)
  - `location_latitude` / `location_longitude` (optional strings parsable as floats; latitude -90..90, longitude -180..180)
  - `image_base64` (required; accepts raw base64 or a `data:image/{jpeg|png|webp};base64,…` URL; max 10 MB)
- **Behavior**: uploads the image to R2, stores metadata in Supabase, and echoes the persisted record.
- **Success** `201 Created`:
  ```json
  { "success": true, "error": "", "cat": { "...see Cat shape..." } }
  ```
- **Failure**:
  - `401` invalid session token
  - `400` validation issues (missing name/image, bad tags, invalid coordinates, unsupported image type)
  - `413` image exceeds 10 MB
  - `500` storage/R2 errors

#### `GET /cats/list` (and `GET /cats`)

Paginated, reverse-chronological list of cat posts. `/cats` is a backwards-compatible alias for this handler.

- **Query parameters**:
  - `limit` (optional, default 20, max 50)
  - `cursor` (optional, opaque base64 string previously returned as `next_cursor`)
  - `username` (optional filter for posts authored by a specific user; validated same as other usernames)
  - `session_token` (optional; when supplied, `user_liked` reflects whether this session's user has liked each returned cat)
- **Success** `200 OK`:
  ```json
  {
    "success": true,
    "error": "",
    "cats": [ { "...Cat..." }, { "...Cat..." } ],
    "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNC0wNS0wMVQxMjo..."} 
  }
  ```
- **Failure**: `400` invalid limit/cursor/username, `500` query errors.

#### `GET /cats/get`

Fetch a single cat post by ID.

- **Query parameters**:
  - `id` (required UUID v4)
  - `session_token` (optional; populates `user_liked` for the caller)
- **Success** `200 OK`: `{ "success": true, "error": "", "cat": { … } }`
- **Failure**:
  - `400` missing/invalid UUID
  - `404` cat not found
  - `500` query errors

#### `GET /cats/search/tags`

Search cats by tags.

- **Query parameters**:
  - `tags` (required comma-separated list; same normalization rules as creation)
  - `mode` (optional: `"any"` default matches overlapping tags, `"all"` requires every provided tag)
  - `limit` (optional, default 20, max 50)
  - `cursor` (optional opaque base64 string from `next_cursor`)
  - `session_token` (optional; when supplied, `user_liked` reflects this session's like status)
- **Success** `200 OK`: same payload shape as `/cats/list`.
- **Failure**:
  - `400` when tags missing/invalid, no tags supplied, invalid mode, limit, or cursor
  - `500` query errors

#### `POST /cats/like`

Register a like on a cat.

- **Body fields**:
  - `session_token` (required)
  - `cat_id` (required UUID v4)
- **Success** `200 OK`:
  ```json
  { "success": true, "error": "", "cat_id": "…", "likes": 42, "liked": true }
  ```
- **Failure**:
  - `401` invalid session token
  - `400` missing/invalid `cat_id`
  - `404` cat not found (propagated from the service)
  - `500` data errors

#### `POST /cats/removeLike`

The inverse of `/cats/like`; removes the caller's like.

- **Body fields**: same as `/cats/like`.
- **Success** `200 OK`: identical payload with `"liked": false`.
- **Failure**: same as `/cats/like`.

## Error Handling Reference

- `AuthError` → `401 Unauthorized` with the supplied message.
- `ConflictError` → `409 Conflict`.
- Generic `HttpError` → the embedded status code.
- Unexpected exceptions → `500 Internal Server Error` with `error: "Internal server error"`.

Clients should always inspect the `success` flag before trusting other fields and should persist/forward `next_cursor` tokens exactly as received for pagination.


