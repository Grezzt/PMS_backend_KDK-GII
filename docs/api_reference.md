# 📡 API Reference — PMS Backend

Base URL: `http://localhost:3000/api`

> [!NOTE]
> Semua endpoint yang bertanda 🔒 memerlukan header `Authorization: Bearer <token>`.

---

## 🔐 Auth Service

Semua route auth diawali dengan `/api/auth`

---

### POST /auth/register

Mendaftarkan user baru ke sistem.

**Auth:** Tidak diperlukan  
**Rate Limit:** 20 req/menit

**Request Body:**
```json
{
  "username": "budi_keren",
  "password": "password123",
  "email": "budi@example.com"
}
```

**Validasi:**
| Field | Tipe | Aturan |
|---|---|---|
| `username` | string | min 3 karakter |
| `password` | string | min 6 karakter |
| `email` | string | format email valid |

**Response 200:**
```json
{
  "message": "User registered successfully",
  "username": "budi_keren",
  "email": "budi@example.com"
}
```

**Response 422 (Validasi Gagal):**
```json
{
  "name": "ValidationError",
  "message": "Parameters validation error!",
  "code": 422,
  "data": [
    {
      "type": "stringMin",
      "message": "The 'username' field length must be greater than or equal to 3 characters long!",
      "field": "username"
    }
  ]
}
```

**Event yang Dipancarkan:** `user.created` → `{ username, email }`

---

### POST /auth/login

Login dan mendapatkan JWT token.

**Auth:** Tidak diperlukan

**Request Body:**
```json
{
  "username": "admin",
  "password": "password123"
}
```

**Validasi:**
| Field | Tipe | Aturan |
|---|---|---|
| `username` | string | wajib |
| `password` | string | min 6 karakter |

**Response 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcxMzc1MDAwMCwiZXhwIjoxNzEzNzUzNjAwfQ.xxxxx"
}
```

**Token Payload (decoded):**
```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "iat": 1713750000,
  "exp": 1713753600
}
```

**Response 401:**
```json
{
  "name": "MoleculerError",
  "message": "Invalid username or password",
  "code": 401,
  "type": "ERR_INVALID_CREDS"
}
```

**Event yang Dipancarkan:** `auth.user.login` → `{ userId, username }`

---

### GET /auth/me 🔒

Mendapatkan data user yang sedang login (dari token).

**Auth:** Wajib (`auth: "required"`)

**Request Headers:**
```
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "message": "This is a protected route",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "iat": 1713750000,
    "exp": 1713753600
  }
}
```

**Response 401 (Tidak ada token):**
```json
{
  "name": "UnAuthorizedError",
  "message": "Unauthorized",
  "code": 401,
  "type": "NO_RIGHTS"
}
```

---

## 🏢 Workspaces Service

Semua route workspaces diawali dengan `/api/workspaces`

---

### GET /workspaces 🔒

Mendapatkan daftar semua workspace.

**Auth:** Wajib

**Response 200:**
```json
[
  {
    "id": "ws-1",
    "name": "Engineering",
    "description": "Core engineering workspace",
    "ownerId": "user-admin"
  },
  {
    "id": "ws-2",
    "name": "Marketing",
    "description": "Marketing & campaigns",
    "ownerId": "user-charlie"
  }
]
```

---

### GET /workspaces/:id 🔒

Mendapatkan detail satu workspace.

**Auth:** Wajib

**Path Parameters:**
| Parameter | Tipe | Deskripsi |
|---|---|---|
| `id` | string | ID workspace |

**Response 200:**
```json
{
  "id": "ws-1",
  "name": "Engineering",
  "description": "Core engineering workspace",
  "ownerId": "user-admin"
}
```

**Response 404:**
```json
{
  "name": "MoleculerError",
  "message": "Workspace not found",
  "code": 404,
  "type": "ERR_NOT_FOUND"
}
```

---

### POST /workspaces/:workspaceId/members 🔒

Menambahkan atau mengupdate member workspace.

**Auth:** Wajib

**Path Parameters:**
| Parameter | Tipe | Deskripsi |
|---|---|---|
| `workspaceId` | string | ID workspace |

**Request Body:**
```json
{
  "userId": "user-alice",
  "role": "member"
}
```

**Validasi:**
| Field | Tipe | Nilai Valid |
|---|---|---|
| `userId` | string | wajib |
| `role` | enum | `"admin"`, `"member"`, `"viewer"` (default: `"member"`) |

**Response 200 (Update existing):**
```json
{
  "workspaceId": "ws-1",
  "userId": "user-alice",
  "role": "admin",
  "joinedAt": "2026-04-22T02:49:00.000Z"
}
```

---

### POST /workspaces/projects/:projectId/members 🔒

Menambahkan atau mengupdate role override member di level proyek.

**Auth:** Wajib

**Path Parameters:**
| Parameter | Tipe | Deskripsi |
|---|---|---|
| `projectId` | string | ID proyek |

**Request Body:**
```json
{
  "userId": "user-bob",
  "role": "member"
}
```

**Response 200:**
```json
{
  "projectId": "proj-1",
  "userId": "user-bob",
  "role": "member",
  "joinedAt": "2026-04-22T02:49:00.000Z"
}
```

---

## 📁 Projects Service

Semua route projects diawali dengan `/api/projects`

---

### GET /projects 🔒

Mendapatkan daftar proyek. Bisa difilter per workspace.

**Auth:** Wajib

**Query Parameters:**
| Parameter | Tipe | Required | Deskripsi |
|---|---|---|---|
| `workspaceId` | string | Opsional | Filter proyek berdasarkan workspace |

**Otorisasi:** Jika `workspaceId` disertakan, user harus punya role minimal `viewer` di workspace tersebut.

**Response 200:**
```json
[
  {
    "id": "proj-1",
    "workspaceId": "ws-1",
    "name": "Platform Rewrite",
    "status": "active",
    "createdBy": "user-admin"
  },
  {
    "id": "proj-2",
    "workspaceId": "ws-1",
    "name": "Mobile App",
    "status": "active",
    "createdBy": "user-admin"
  }
]
```

---

### GET /projects/:id 🔒

Mendapatkan detail satu proyek.

**Auth:** Wajib  
**Otorisasi:** Minimal `viewer` di proyek/workspace terkait

**Path Parameters:**
| Parameter | Tipe | Deskripsi |
|---|---|---|
| `id` | string | ID proyek |

**Response 200:**
```json
{
  "id": "proj-1",
  "workspaceId": "ws-1",
  "name": "Platform Rewrite",
  "description": "",
  "status": "active",
  "createdBy": "user-admin"
}
```

**Response 404:**
```json
{
  "name": "MoleculerError",
  "message": "Project not found",
  "code": 404,
  "type": "ERR_NOT_FOUND"
}
```

**Response 403:**
```json
{
  "name": "MoleculerError",
  "message": "You do not have access to this project",
  "code": 403,
  "type": "ERR_FORBIDDEN",
  "data": {
    "userId": "user-X",
    "projectId": "proj-1"
  }
}
```

---

### POST /projects 🔒

Membuat proyek baru di dalam workspace.

**Auth:** Wajib  
**Otorisasi:** Minimal `member` di workspace tujuan

**Request Body:**
```json
{
  "workspaceId": "ws-1",
  "name": "Proyek Baru",
  "description": "Deskripsi proyek baru"
}
```

**Validasi:**
| Field | Tipe | Required |
|---|---|---|
| `workspaceId` | string | ✅ |
| `name` | string | ✅ |
| `description` | string | Opsional |

**Response 200:**
```json
{
  "id": "proj-1713750000000",
  "workspaceId": "ws-1",
  "name": "Proyek Baru",
  "description": "Deskripsi proyek baru",
  "status": "active",
  "createdBy": "user-admin",
  "createdAt": "2026-04-22T02:49:00.000Z"
}
```

---

### PATCH /projects/:id 🔒

Mengupdate data proyek (partial update).

**Auth:** Wajib  
**Otorisasi:** Minimal `member` di proyek/workspace terkait

**Path Parameters:**
| Parameter | Tipe | Deskripsi |
|---|---|---|
| `id` | string | ID proyek |

**Request Body (semua opsional):**
```json
{
  "name": "Nama Baru",
  "description": "Deskripsi baru",
  "status": "archived"
}
```

**Validasi:**
| Field | Tipe | Nilai Valid |
|---|---|---|
| `name` | string | opsional |
| `description` | string | opsional |
| `status` | enum | `"active"`, `"archived"`, `"completed"` |

**Response 200:**
```json
{
  "id": "proj-1",
  "workspaceId": "ws-1",
  "name": "Nama Baru",
  "description": "Deskripsi baru",
  "status": "archived",
  "createdBy": "user-admin",
  "updatedAt": "2026-04-22T03:00:00.000Z",
  "updatedBy": "user-admin"
}
```

---

### DELETE /projects/:id 🔒

Menghapus proyek.

**Auth:** Wajib  
**Otorisasi:** Hanya `admin` proyek/workspace

**Path Parameters:**
| Parameter | Tipe | Deskripsi |
|---|---|---|
| `id` | string | ID proyek |

**Response 200:**
```json
{
  "deleted": true,
  "project": {
    "id": "proj-1",
    "workspaceId": "ws-1",
    "name": "Platform Rewrite"
  }
}
```

---

## 🚨 Error Reference Global

| HTTP Status | Tipe | Deskripsi |
|---|---|---|
| 400 | `ERR_INVALID_PARAMS` | Parameter tidak valid atau tidak lengkap |
| 401 | `ERR_UNAUTHENTICATED` | Tidak ada token atau token tidak valid |
| 401 | `ERR_INVALID_TOKEN` | Token JWT rusak atau expired |
| 401 | `ERR_INVALID_CREDS` | Username/password salah |
| 403 | `ERR_FORBIDDEN` | Tidak punya akses ke resource |
| 404 | `ERR_NOT_FOUND` | Resource tidak ditemukan |
| 422 | `ValidationError` | Data request tidak memenuhi aturan validasi |
| 429 | `RateLimitExceeded` | Terlalu banyak request (>20/menit) |
| 500 | `MoleculerError` | Error internal server |

---

## 🧪 Contoh Testing dengan cURL

### Skenario Lengkap: Login → Buat Proyek → Update Proyek

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}' | jq -r .token)

echo "Token: $TOKEN"

# 2. List workspaces
curl -s http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. Buat proyek baru
PROJECT=$(curl -s -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId":"ws-1","name":"Test Project","description":"Proyek testing"}')

PROJECT_ID=$(echo $PROJECT | jq -r .id)
echo "Created project: $PROJECT_ID"

# 4. Update proyek
curl -s -X PATCH http://localhost:3000/api/projects/$PROJECT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}' | jq

# 5. Hapus proyek
curl -s -X DELETE http://localhost:3000/api/projects/$PROJECT_ID \
  -H "Authorization: Bearer $TOKEN" | jq
```
