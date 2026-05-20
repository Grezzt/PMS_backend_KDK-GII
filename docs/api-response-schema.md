# API Response Schema Documentation

> **Version**: 1.0.0  
> **Last Updated**: 2026-05-13  
> **Base URL**: `http://localhost:3000/api`

---

## Unified Response Schema

Semua endpoint menggunakan skema response yang konsisten.

### Success — Single Object
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": { ...object }
}
```

### Success — List
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": {
    "list": [ ...items ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

> **Query params pagination** (berlaku untuk semua list endpoint):  
> `?page=1&limit=20` — default `page=1`, `limit=20`, max `limit=100`

### Success — Created (POST)
```json
{
  "message": "Created",
  "code": 201,
  "type": "CREATED",
  "data": { ...object }
}
```

### Success — Deleted (DELETE)
> HTTP `204 No Content` — body kosong, tidak ada JSON.

### Error
```json
{
  "message": "Unauthorized",
  "code": 401,
  "type": "ERR_UNAUTHORIZED",
  "data": null
}
```

> Field `name` dihilangkan dari semua error response via custom `onError` handler di `api.service.js`.

### Standard Error Codes

| HTTP | `message` | `type` |
|------|-----------|--------|
| 400 | `"Bad Request"` | `"ERR_BAD_REQUEST"` |
| 401 | `"Unauthorized"` | `"ERR_UNAUTHORIZED"` |
| 403 | `"Forbidden"` | `"ERR_FORBIDDEN"` |
| 404 | `"Not Found"` | `"ERR_NOT_FOUND"` |
| 409 | `"Conflict"` / custom | `"ERR_CONFLICT"` |
| 422 | `"Unprocessable Entity"` | `"ERR_UNPROCESSABLE_ENTITY"` |
| 500 | `"Internal Server Error"` | `"ERR_INTERNAL"` |

---

## Auth Service — `/api/auth`

### `POST /api/auth/login`
Autentikasi user, mengembalikan JWT access token dan refresh token.

**Request Body**
```json
{ "email": "user@example.com", "password": "secret123" }
```

**Response `200`**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "a1b2c3...",
  "expiresIn": "1h"
}
```

**Error `401`** — email/password salah
```json
{ "message": "Invalid email or password", "code": 401, "type": "ERR_INVALID_CREDS", "data": null }
```

---

### `POST /api/auth/register`
Registrasi user baru.

**Request Body**
```json
{ "name": "John Doe", "email": "john@example.com", "password": "secret123" }
```

**Response `201`** (HTTP 201 Created)
```json
{
  "message": "Created",
  "code": 201,
  "type": "CREATED",
  "data": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2026-05-13T...",
    "updatedAt": "2026-05-13T..."
  }
}
```

**Error `409`** — email sudah terdaftar
```json
{ "message": "Email already registered", "code": 409, "type": "ERR_EMAIL_EXISTS", "data": null }
```

---

### `GET /api/auth/me`
Ambil profil user yang sedang login.

**Headers**: `Authorization: Bearer <token>`

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2026-05-13T...",
    "updatedAt": "2026-05-13T..."
  }
}
```

**Error `401`** — token tidak valid / user tidak ditemukan
```json
{ "message": "Unauthorized", "code": 401, "type": "ERR_UNAUTHORIZED", "data": null }
```

---

### `POST /api/auth/refresh`
Perbarui access token menggunakan refresh token.

**Request Body**
```json
{ "refreshToken": "a1b2c3..." }
```

**Response `200`**
```json
{
  "accessToken": "eyJ...",
  "expiresIn": "1h"
}
```

**Error `401`** — token tidak valid / revoked / expired
```json
{ "message": "Unauthorized", "code": 401, "type": "ERR_UNAUTHORIZED", "data": null }
```

---

### `POST /api/auth/logout`
Revoke refresh token (logout).

**Request Body**
```json
{ "refreshToken": "a1b2c3..." }
```

**Response `204`** — HTTP 204 No Content, body kosong.

**Error `404`** — token tidak ditemukan
```json
{ "message": "Not Found", "code": 404, "type": "ERR_NOT_FOUND", "data": null }
```

---

## Users Service — `/api/users`

### `GET /api/users/me`
Ambil profil user yang sedang login.

**Headers**: `Authorization: Bearer <token>`

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2026-05-13T...",
    "updatedAt": "2026-05-13T..."
  }
}
```

**Error `401`** — token valid tapi user tidak ada di DB
```json
{ "message": "Unauthorized", "code": 401, "type": "ERR_UNAUTHORIZED", "data": null }
```

---

### `PATCH /api/users/me`
Update profil sendiri (partial update).

**Headers**: `Authorization: Bearer <token>`

**Request Body** (semua opsional)
```json
{
  "name": "New Name",
  "email": "new@example.com",
  "password": "newpass123",
  "currentPassword": "oldpass123"
}
```

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": { "id": "uuid", "name": "New Name", "email": "new@example.com", ... }
}
```

| Error | Code | Type | Kondisi |
|-------|------|------|---------|
| `"Unauthorized"` | 401 | `ERR_UNAUTHORIZED` | User tidak ada / password salah |
| `"Bad Request"` | 400 | `ERR_BAD_REQUEST` | Ganti password tanpa `currentPassword` |
| `"Email already used"` | 409 | `ERR_CONFLICT` | Email dipakai akun lain |

---

### `GET /api/users/:id`
Lihat profil user lain.

**Headers**: `Authorization: Bearer <token>`

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": { "id": "uuid", "name": "...", "email": "...", "createdAt": "...", "updatedAt": "..." }
}
```

**Error `404`**
```json
{ "message": "Not Found", "code": 404, "type": "ERR_NOT_FOUND", "data": null }
```

---

### `GET /api/users`
List semua user. **Hanya admin.**

**Headers**: `Authorization: Bearer <token>`

**Query Params**: `search?`, `page?` (default: 1), `limit?` (default: 20, max: 100)

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": {
    "list": [ { "id": "uuid", "name": "...", "email": "..." } ],
    "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
  }
}
```

**Error `403`** — bukan admin
```json
{ "message": "Forbidden", "code": 403, "type": "ERR_FORBIDDEN", "data": null }
```

---

## Workspaces Service — `/api/workspaces`

### `GET /api/workspaces`
List workspace milik atau yang user ikuti.

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": {
    "list": [
      { "id": "uuid", "name": "My Workspace", "description": "...", "ownerId": "uuid", "createdAt": "...", "updatedAt": "..." }
    ]
  }
}
```

---

### `GET /api/workspaces/:id`
Detail satu workspace.

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": { "id": "uuid", "name": "My Workspace", "description": "...", "ownerId": "uuid", "createdAt": "...", "updatedAt": "..." }
}
```

| Error | Code | Kondisi |
|-------|------|---------|
| `"Forbidden"` | 403 | Tidak punya akses viewer |
| `"Not Found"` | 404 | Workspace tidak ada |

---

### `POST /api/workspaces`
Buat workspace baru.

**Request Body**
```json
{
  "name": "My Workspace",
  "description": "Optional",
  "members": [
    { "userId": "uuid", "role": "member" }
  ]
}
```

**Response `201`** (HTTP 201)
```json
{
  "message": "Created",
  "code": 201,
  "type": "CREATED",
  "data": { "id": "uuid", "name": "My Workspace", "ownerId": "uuid", ... }
}
```

**Error `422`** — ada `userId` member yang tidak ditemukan
```json
{
  "message": "Unprocessable Entity",
  "code": 422,
  "type": "ERR_UNPROCESSABLE_ENTITY",
  "data": { "missingUserIds": ["uuid-1"] }
}
```

---

### `PATCH /api/workspaces/:id`
Update workspace. Butuh role **admin**.

**Request Body** (minimal satu field)
```json
{ "name": "Updated Name", "description": "Updated desc" }
```

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": { "id": "uuid", "name": "Updated Name", ... }
}
```

---

### `DELETE /api/workspaces/:id`
Hapus workspace. Butuh role **admin**.

**Response `204`** — HTTP 204 No Content, body kosong.

---

### `GET /api/workspaces/:workspaceId/members`
List semua member workspace.

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": {
    "list": [
      { "userId": "uuid", "role": "admin", "isOwner": true, "user": { "id": "uuid", "name": "...", "email": "..." } },
      { "userId": "uuid", "role": "member", "isOwner": false, "user": { "id": "uuid", "name": "...", "email": "..." } }
    ]
  }
}
```

---

### `POST /api/workspaces/:workspaceId/members`
Tambah atau update role member. Butuh role **admin**.

**Request Body**
```json
{ "userId": "uuid", "role": "member" }
```

**Response `201`** (HTTP 201)
```json
{
  "message": "Created",
  "code": 201,
  "type": "CREATED",
  "data": { "workspaceId": "uuid", "userId": "uuid", "role": "MEMBER", "joinedAt": "..." }
}
```

---

## Projects Service — `/api/projects`

### `GET /api/projects`
List project yang user ikuti. Filter opsional per workspace.

**Query Params**: `workspaceId?`

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": {
    "list": [
      { "id": "uuid", "workspaceId": "uuid", "name": "My Project", "leaderId": "uuid", "visibility": "PRIVATE", "createdAt": "...", "updatedAt": "..." }
    ]
  }
}
```

---

### `GET /api/projects/:id`
Detail satu project.

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": { "id": "uuid", "workspaceId": "uuid", "name": "My Project", "leaderId": "uuid", "visibility": "PRIVATE", ... }
}
```

---

### `POST /api/projects`
Buat project baru. Butuh minimal role **member** di workspace.

**Request Body**
```json
{
  "workspaceId": "uuid",
  "name": "My Project",
  "description": "Optional",
  "visibility": "private",
  "statusConfig": {}
}
```

**Response `201`** (HTTP 201)
```json
{
  "message": "Created",
  "code": 201,
  "type": "CREATED",
  "data": { "id": "uuid", "workspaceId": "uuid", "name": "My Project", "leaderId": "uuid", ... }
}
```

---

### `PATCH /api/projects/:id`
Update project. Butuh role **member**.

**Request Body** (semua opsional)
```json
{ "name": "Updated", "description": "...", "visibility": "public", "statusConfig": {} }
```

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": { "id": "uuid", "name": "Updated", ... }
}
```

---

### `DELETE /api/projects/:id`
Hapus project. Butuh role **admin**.

**Response `204`** — HTTP 204 No Content, body kosong.

---

### `GET /api/projects/:projectId/members`
List semua member project.

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": {
    "list": [
      { "userId": "uuid", "role": "admin", "isLeader": true, "user": { "id": "uuid", "name": "...", "email": "..." } },
      { "userId": "uuid", "role": "member", "isLeader": false, "user": { "id": "uuid", "name": "...", "email": "..." } }
    ]
  }
}
```

---

### `POST /api/projects/:projectId/members`
Tambah member ke project. Butuh role **admin**. User harus sudah menjadi workspace member.

**Request Body**
```json
{ "userId": "uuid", "role": "member" }
```

**Response `201`** (HTTP 201)
```json
{
  "message": "Created",
  "code": 201,
  "type": "CREATED",
  "data": { "projectId": "uuid", "userId": "uuid", "role": "MEMBER", "joinedAt": "..." }
}
```

**Error `422`** — user belum jadi workspace member
```json
{
  "message": "Unprocessable Entity",
  "code": 422,
  "type": "ERR_UNPROCESSABLE_ENTITY",
  "data": { "workspaceId": "uuid", "userId": "uuid" }
}
```

---

## Documents Service — `/api/documents`

### `POST /api/documents/upload`
Upload dokumen ke project. Butuh role **member**.

**Request**: `multipart/form-data` — file + field `projectId`

**Response `201`** (HTTP 201)
```json
{
  "message": "Created",
  "code": 201,
  "type": "CREATED",
  "data": {
    "id": "uuid",
    "projectId": "uuid",
    "fileName": "report.pdf",
    "storageKey": "documents/uuid/uuid-report.pdf",
    "createdAt": "...",
    "url": "https://s3.example.com/bucket/documents/..."
  }
}
```

---

### `POST /api/documents/task-attachments`
Upload attachment ke task. Butuh role **member**.

**Request**: `multipart/form-data` — file + field `taskId`

**Response `201`** (HTTP 201)
```json
{
  "message": "Created",
  "code": 201,
  "type": "CREATED",
  "data": {
    "id": "uuid",
    "taskId": "uuid",
    "fileName": "screenshot.png",
    "fileUrl": "https://...",
    "uploadedBy": "uuid",
    "createdAt": "...",
    "url": "https://..."
  }
}
```

---

### `GET /api/documents?projectId=...`
List semua dokumen dalam project. Butuh role **viewer**.

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": {
    "list": [
      { "id": "uuid", "projectId": "uuid", "fileName": "report.pdf", "storageKey": "...", "createdAt": "..." }
    ]
  }
}
```

---

### `GET /api/documents/:id`
Detail satu dokumen. Butuh role **viewer**.

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": { "id": "uuid", "projectId": "uuid", "fileName": "report.pdf", "storageKey": "...", "createdAt": "..." }
}
```

---

### `GET /api/documents/:id/download`
Generate signed URL untuk download dokumen.

**Response `302`** — Redirect ke signed URL (tidak ada JSON body).

---

### `DELETE /api/documents/:id`
Hapus dokumen. Butuh role **admin**.

**Response `204`** — HTTP 204 No Content, body kosong.

---

### `GET /api/documents/task/:taskId/attachments`
List semua attachment milik sebuah task. Butuh role **viewer**.

**Response `200`**
```json
{
  "message": "OK",
  "code": 200,
  "type": "SUCCESS",
  "data": {
    "list": [
      { "id": "uuid", "taskId": "uuid", "fileName": "shot.png", "fileUrl": "https://...", "uploadedBy": "uuid", "createdAt": "..." }
    ]
  }
}
```

---

### `GET /api/documents/task-attachments/:id/download`
Generate signed URL untuk download attachment.

**Response `302`** — Redirect ke signed URL (tidak ada JSON body).

---

### `DELETE /api/documents/task-attachments/:id`
Hapus attachment. Butuh role **admin**.

**Response `204`** — HTTP 204 No Content, body kosong.

---

## Notes

> **Validation Errors**: Error dari validasi params Moleculer (field wajib tidak dikirim) terjadi sebelum handler berjalan sehingga tidak melewati custom `onError`. Response-nya masih mengandung field `name`. Ini adalah perilaku default Moleculer.

> **Auth Service Exceptions**: Endpoint `login` dan `refresh` mengembalikan token langsung tanpa wrapper `{ message, code, type, data }` karena sudah mengikuti standar OAuth2/JWT industry.
