# PetaDrive API

Base URL: `https://<your-vercel-domain>` (or `SITE_URL` if you set it).

All endpoints are serverless functions under `/api/*`. Endpoints marked
**Auth required** need a Firebase ID token in the request header:

```
Authorization: Bearer <firebase-id-token>
```

Get this token client-side with `auth.currentUser.getIdToken()` (Firebase Web SDK).

---

## POST /api/token
**Auth required.**

Issues a one-time upload token. A token is valid for 5 minutes, for exactly
one call to `/api/upload`, by the same signed-in user who requested it.

Request body (JSON):
```json
{ "recaptchaToken": "<optional reCAPTCHA v3 token>" }
```

Response:
```json
{ "success": true, "token": "a1b2c3…", "expiresIn": 300 }
```

---

## POST /api/upload
**Auth required.** Content-Type: `multipart/form-data`.

Uploads **one chunk** of a file through the server-side storage-provider key
(the key itself is never sent to the browser). There is no whole-file size
limit at the application level — the client (`public/assets/js/files.js`)
splits any file larger than `CHUNK_SIZE` (see `firebase-config.js`, currently
3.5 MB) into consecutive chunks and calls this endpoint once per chunk, each
with a freshly-issued token. The platform limit this endpoint itself enforces
(`MAX_FILE` in `api/upload.js`) is the per-request cap imposed by Vercel's
Node serverless functions (~4.5 MB) — not a per-file cap.

Form fields:
| Field | Type | Required |
|---|---|---|
| `file` | binary | yes — one chunk's bytes |
| `token` | string | yes — from `/api/token` |

Response:
```json
{
  "success": true,
  "filename": "video.mp4",
  "size": 3670016,
  "mimeType": "video/mp4",
  "directUrl": "https://<storage-provider>/…",
  "providerUrl": "https://<storage-provider>/…",
  "shortUrl": "",
  "temporary": false,
  "expiresIn": null
}
```

The client collects one `directUrl` per chunk into an ordered `parts` array
and stores that array on the file's Realtime Database record
(`userFiles/{uid}/{fileId}/parts`) — this is what lets large/split files be
re-joined on download.

---

## POST /api/publish
**Auth required.**

Publishes a file the caller owns, returning a public share link. Calling this
again for an already-published file is safe and idempotent — it returns the
existing link if it is still valid, or **silently re-creates** the published
record and returns a fresh link if the old one had gone missing (this is what
prevents a stale cached link from ever showing "Link not found").

Request body:
```json
{ "fileId": "<userFiles key>" }
```

Response:
```json
{ "success": true, "url": "https://your-domain/d/AbCdEf12" }
```

Every published file gets **two** public URLs, sharing the same id:

| Link | Example | What it does |
|---|---|---|
| Download page | `/d/<id>` | A branded PetaDrive page with a preview and a Download button. |
| Direct link | `/f/<id>` | Streams the raw file bytes (see `GET /f/:id` below). Good for `<img>`/`<video>` embeds or hotlinking. |

Neither link ever reveals the underlying storage provider's URL or domain —
`GET /f/:id` fetches from the provider server-side and pipes the bytes
through, so only your own domain is ever visible to a viewer.

---

## POST /api/unpublish
**Auth required.**

Revokes a file's share link. Both `/d/<id>` and `/f/<id>` return 404 /
"Link not found" immediately after this call.

Request body:
```json
{ "fileId": "<userFiles key>" }
```

Response:
```json
{ "success": true }
```

---

## GET /f/:id   (served by `api/f.js`)
**No auth required** — this is the public "direct link".

Streams a published file's bytes. If the file was uploaded in multiple
chunks, they are fetched from the storage provider **in order** and piped
into one continuous response, so the client sees a single merged file with
no visible seams.

- `Content-Type` is the file's stored `mimeType`.
- `Content-Disposition: inline` (so browsers preview images/video/audio/PDF
  instead of forcing a download; the Download button on `/d/:id` adds the
  `download` attribute to force a save instead).
- `Content-Length` is the file's total size.
- Range requests (`Range:` header, used for video scrubbing) are **not**
  currently supported — the whole file streams from the start every time.
  This is a known limitation worth revisiting if you add large-video seeking.

404 response if the id doesn't exist or was revoked:
```json
{ "success": false, "error": "Link not found. It may have been revoked by its owner." }
```

---

## Error shape

Every endpoint that fails returns:
```json
{ "success": false, "error": "Human-readable message." }
```
with a matching HTTP status code (400, 401, 403, 404, 405, 413, 502, 500).

---

## Notes for anyone (human or AI) integrating against this API

- The real storage provider (DropLink, configured via the `DROP_API_KEY` env
  var) is an implementation detail. Nothing in the public API or in any
  response ever exposes its hostname — treat `/f/:id` as the only "raw file"
  URL that exists from the outside.
- File size is effectively unbounded at the application layer; the only
  limits are (a) the per-chunk request size enforced by Vercel, which the
  client already works around by chunking, and (b) the signed-in user's
  storage quota (`FREE_QUOTA` in `firebase-config.js`, plus any
  `admin/extraBytes` granted to that user).
- Upload tokens are single-use and user-bound — a token obtained by user A
  cannot be redeemed by user B, and cannot be replayed.
