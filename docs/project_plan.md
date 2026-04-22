# 📋 Project Plan — PMS Backend Microservice

> **Project Management System (PMS) Backend**  
> Framework: **Moleculer JS** (Node.js Microservices)  
> Versi Dokumen: 2.0 — *Diperbarui berdasarkan Rancangan MicroService & ERD*  
> Tanggal: April 2026

> [!IMPORTANT]
> Dokumen ini telah disesuaikan dengan **Rancangan MicroService.docx** (12 services) dan **dokumentasi Rancangan ERD.docx** (13 entitas). Item yang belum diimplementasi **tidak** ditandai selesai.

---

## 🎯 Tujuan Proyek

1. Membangun backend **scalable** dan **fault-tolerant** menggunakan Moleculer JS.
2. Mengimplementasikan **Contextual RBAC** (ADMIN, MEMBER, VIEWER) pada level workspace dan proyek.
3. Menyediakan REST API lengkap untuk frontend PMS.
4. Mendukung deployment via Docker dan Kubernetes.
5. Memastikan semua kode memiliki unit & integration test.

---

## 🗺️ Service Registry (Requirement)

Berdasarkan `Rancangan MicroService.docx`, sistem PMS terdiri dari **12 service**:

| # | Service | Peran | Status |
|---|---|---|---|
| 1 | `api.service` | API Gateway, routing, CORS, rate limiting, auth middleware | ✅ Ada (partial) |
| 2 | `auth.service` | Login, register, logout, JWT, Refresh Token | ⚠️ Partial (mock DB) |
| 3 | `users.service` | Profil user, Global Role, RBAC | ❌ Belum ada |
| 4 | `workspaces.service` | Multi-workspace, organisasi tim, visibilitas proyek | ⚠️ Partial (mock DB) |
| 5 | `tasks.service` | CRUD Task & Subtask, status, prioritas, auto-progress | ❌ Belum ada |
| 6 | `collaboration.service` | Komentar, mention @user, label/tag | ❌ Belum ada |
| 7 | `docs.service` | Dokumen teknis, version control, collaborative editing | ❌ Belum ada |
| 8 | `analytics.service` | Dashboard, workload, Sprint progress, Burndown chart | ❌ Belum ada |
| 9 | `integrations.service` | GitHub commit → task, Slack notifikasi | ❌ Belum ada |
| 10 | `storage.service` | File sharing, attachment task/dokumen | ❌ Belum ada |
| 11 | `audits.service` | Activity log setiap perubahan penting | ❌ Belum ada |
| 12 | `notifications.service` | Notifikasi in-app saat penugasan/komentar | ❌ Belum ada |
| — | `db.mixin` | Abstraksi database, soft-delete, auto-timestamp | ✅ Ada (partial) |

---

## 🗃️ ERD — Entitas Database (Requirement)

Berdasarkan `dokumentasi Rancangan ERD.docx`, terdapat **13 entitas**:

| # | Entitas | Field Utama | Status Seed |
|---|---|---|---|
| 1 | `USER` | _id, name, email, password_hash, created_at, updated_at | ✅ Ada |
| 2 | `USER_TOKENS` | _id, user_id, refresh_token, expires_at, is_revoked | ❌ Belum ada |
| 3 | `WORKSPACE` | _id, name, owner_id, created_at, updated_at | ✅ Ada |
| 4 | `WORKSPACE_MEMBER` | _id, workspace_id, user_id, role (ADMIN/MEMBER/VIEWER) | ✅ Ada |
| 5 | `PROJECT` | _id, workspace_id, name, description, leader_id, **visibility**, **status_config** | ⚠️ Partial (kurang visibility & status_config) |
| 6 | `TASK` | _id, project_id, title, description, **type**, status, **priority**, progress, start_date, due_date, completed_at, created_by | ❌ Belum ada |
| 7 | `SUBTASK` | _id, task_id, title, status, progress | ❌ Belum ada |
| 8 | `TASK_ASSIGNEE` | task_id, user_id | ❌ Belum ada |
| 9 | `TASK_COMMENT` | _id, task_id, user_id, content (Rich Text), created_at | ❌ Belum ada |
| 10 | `TASK_ATTACHMENT` | _id, task_id, file_name, file_url, uploaded_by | ❌ Belum ada |
| 11 | `LABEL` | _id, name, color (HEX) | ❌ Belum ada |
| 12 | `TASK_LABEL` | task_id, label_id | ❌ Belum ada |
| 13 | `AUDIT_LOG` | _id, entity_type, entity_id, action, user_id, details (JSON), created_at | ❌ Belum ada |

---

## 🗂️ Fase Pengembangan

---

### PHASE 0 — Setup & Foundation ✅ Selesai

**Tujuan:** Menyiapkan boilerplate, konfigurasi awal, dan infrastruktur dasar.

**Deliverables:**
- [x] Inisialisasi proyek Moleculer dengan `moleculer-runner`
- [x] Konfigurasi `moleculer.config.js` (logger, cacher, transporter)
- [x] Setup Docker Compose (NATS, Redis, MongoDB, Traefik)
- [x] Setup ESLint + Prettier
- [x] Setup Jest untuk testing
- [x] Konfigurasi `.editorconfig`, `.gitignore`, `.npmrc`
- [x] Dockerfile dan docker-compose.yml
- [x] k8s.yaml untuk Kubernetes deployment
- [x] Middleware: `@moleculer/channels`, `@moleculer/workflows`

---

### PHASE 1 — Auth Service ⚠️ In Progress (Partial)

**Tujuan:** Layanan autentikasi lengkap dengan JWT Access Token + Refresh Token.

**Deliverables:**
- [x] `auth.service.js` — Struktur service dasar
- [x] `POST /auth/login` — Login, generate JWT Access Token
- [x] `POST /auth/register` — Registrasi user baru
- [x] `GET /auth/me` — Ambil data user (protected route)
- [x] `auth.verifyToken` — Internal action verifikasi JWT
- [x] Integrasi `jsonwebtoken` + `bcryptjs`
- [x] Token caching di Moleculer (TTL 60 detik)
- [x] Event `auth.user.login` & broadcast `user.created`
- [x] `api.service.js` — API Gateway dengan `authenticate()` + `authorize()`
- [x] Rate limiting (20 req/menit per IP)
- [ ] **[BELUM]** Koneksi ke database nyata — saat ini hardcoded mock user (`admin`/`password123`)
- [ ] **[BELUM]** `POST /auth/refresh` — Perbarui Access Token menggunakan Refresh Token
- [ ] **[BELUM]** `POST /auth/logout` — Revoke Refresh Token (`is_revoked = true`)
- [ ] **[BELUM]** Simpan Refresh Token ke entitas `USER_TOKENS` (dengan `expires_at`, `is_revoked`)
- [ ] **[BELUM]** Seed data `user_tokens.json`

**File Kunci:**
```
services/auth.service.js
services/api.service.js
```

---

### PHASE 2 — Users Service ❌ Belum Dimulai

**Tujuan:** Layanan manajemen identitas dan profil pengguna (`users.service` dari requirement).

**Deliverables:**
- [ ] `users.service.js` — Service baru
- [ ] `GET /users/me` — Profil user yang login
- [ ] `PATCH /users/me` — Update profil (name, email)
- [ ] `GET /users/:id` — Lihat profil user lain
- [ ] `GET /users` — List user (admin only)
- [ ] Koneksi ke MongoDB via `db.mixin`
- [ ] Seed data `users.json` (diperluas dari yang ada)

**File Kunci (target):**
```
services/users.service.js
data/seed/users.json
```

---

### PHASE 3 — Workspace & Project Service ⚠️ In Progress (Partial)

**Tujuan:** Layanan workspace dan proyek lengkap sesuai requirement.

**Yang Sudah Ada:**
- [x] `workspaces.service.js` — Struktur dasar
- [x] `GET /workspaces` — List workspace
- [x] `GET /workspaces/:id` — Detail workspace
- [x] `POST /workspaces/:workspaceId/members` — Tambah member workspace
- [x] `POST /workspaces/projects/:projectId/members` — Tambah member proyek
- [x] `workspaces.getMemberRole` — Resolve role (cached, TTL 30s)
- [x] `projects.service.js` — Struktur dasar
- [x] `GET /projects` — List proyek (filter by workspaceId)
- [x] `GET /projects/:id` — Detail proyek
- [x] `POST /projects` — Buat proyek baru
- [x] `PATCH /projects/:id` — Update proyek
- [x] `DELETE /projects/:id` — Hapus proyek
- [x] `auth.mixin.js` — RBAC contextual (checkProjectAccess, checkWorkspaceAccess)
- [x] Role hierarchy: `viewer < member < admin`
- [x] JSON seed data (workspaces, projects, workspace_members, project_members)

**Yang Belum Ada (Gap dari ERD & Requirement):**
- [ ] **[BELUM]** `POST /workspaces` — Buat workspace baru
- [ ] **[BELUM]** `PATCH /workspaces/:id` — Update workspace
- [ ] **[BELUM]** `DELETE /workspaces/:id` — Hapus workspace
- [ ] **[BELUM]** Field `leader_id` pada Project (FK ke USER)
- [ ] **[BELUM]** Field `visibility` pada Project (enum: `PUBLIC`, `PRIVATE`)
- [ ] **[BELUM]** Field `status_config` pada Project (custom workflow status per proyek)
- [ ] **[BELUM]** `project_members` belum punya entri data (`project_members.json` kosong)
- [ ] **[BELUM]** Koneksi ke MongoDB — saat ini semua masih JSON seed (in-memory)
- [ ] **[BELUM]** Cache invalidation otomatis saat workspace/project diupdate

---

### PHASE 4 — Tasks Service ❌ Belum Dimulai

**Tujuan:** Inti operasional PMS — CRUD Task, Subtask, Assignee, auto-progress.

**Deliverables:**
- [ ] `tasks.service.js` — Service baru
- [ ] **CRUD Task:**
  - [ ] `GET /tasks?projectId=&status=&priority=` — List task dengan filter
  - [ ] `GET /tasks/:id` — Detail task
  - [ ] `POST /tasks` — Buat task baru (field: title, description, type, priority, start_date, due_date)
  - [ ] `PATCH /tasks/:id` — Update task (partial)
  - [ ] `DELETE /tasks/:id` — Hapus task
- [ ] **Task Type:** enum `TASK`, `BUG`
- [ ] **Task Status:** `TODO`, `IN_PROGRESS`, `REVIEW`, `DONE` (atau custom dari `project.status_config`)
- [ ] **Task Priority:** `LOW`, `MEDIUM`, `HIGH`, `URGENT`
- [ ] **Subtask:**
  - [ ] `POST /tasks/:id/subtasks` — Buat subtask
  - [ ] `PATCH /tasks/:id/subtasks/:subId` — Update subtask
  - [ ] `DELETE /tasks/:id/subtasks/:subId` — Hapus subtask
- [ ] **Auto-progress:** Kalkulasi `progress` task dari rata-rata subtask (0%=TODO, 1-99%=IN_PROGRESS, 100%=DONE)
- [ ] **Automasi status** berdasarkan persentase progress
- [ ] **Task Assignee:**
  - [ ] `POST /tasks/:id/assignees` — Assign user ke task
  - [ ] `DELETE /tasks/:id/assignees/:userId` — Unassign user
- [ ] Field `completed_at` otomatis terisi saat status → `DONE`
- [ ] Koneksi ke MongoDB via `db.mixin`
- [ ] RBAC: gunakan `auth.mixin` untuk cek akses project
- [ ] Seed data: `tasks.json`, `subtasks.json`, `task_assignees.json`
- [ ] Event: `task.created`, `task.assigned`, `task.status.changed`

**File Kunci (target):**
```
services/tasks.service.js
data/seed/tasks.json
data/seed/subtasks.json
data/seed/task_assignees.json
```

---

### PHASE 5 — Collaboration Service ❌ Belum Dimulai

**Tujuan:** Komentar, mention @user, dan label/tag pada task.

**Deliverables:**
- [ ] `collaboration.service.js` — Service baru
- [ ] **Comments:**
  - [ ] `GET /tasks/:id/comments` — List komentar task
  - [ ] `POST /tasks/:id/comments` — Tambah komentar (Rich Text/Markdown)
  - [ ] `PATCH /tasks/:id/comments/:commentId` — Edit komentar
  - [ ] `DELETE /tasks/:id/comments/:commentId` — Hapus komentar
- [ ] **Mention:** parsing `@username` dalam komentar → trigger notifikasi
- [ ] **Labels:**
  - [ ] `GET /labels` — List semua label
  - [ ] `POST /labels` — Buat label baru (name, color HEX)
  - [ ] `POST /tasks/:id/labels` — Pasang label ke task
  - [ ] `DELETE /tasks/:id/labels/:labelId` — Lepas label dari task
- [ ] Entitas: `TASK_COMMENT`, `LABEL`, `TASK_LABEL`
- [ ] Seed data: `task_comments.json`, `labels.json`, `task_labels.json`

**File Kunci (target):**
```
services/collaboration.service.js
data/seed/labels.json
data/seed/task_labels.json
data/seed/task_comments.json
```

---

### PHASE 6 — Storage Service ❌ Belum Dimulai

**Tujuan:** Manajemen file lampiran (attachment) pada task dan dokumen.

**Deliverables:**
- [ ] `storage.service.js` — Service baru
- [ ] `POST /tasks/:id/attachments` — Upload file ke task
- [ ] `GET /tasks/:id/attachments` — List attachment task
- [ ] `DELETE /tasks/:id/attachments/:attachId` — Hapus attachment
- [ ] Integrasi cloud storage (S3 / local filesystem)
- [ ] Entitas: `TASK_ATTACHMENT` (file_name, file_url, uploaded_by)
- [ ] Seed data: `task_attachments.json`

**File Kunci (target):**
```
services/storage.service.js
data/seed/task_attachments.json
```

---

### PHASE 7 — Audits & Notifications Service ❌ Belum Dimulai

**Tujuan:** Rekam jejak aktivitas dan notifikasi in-app.

**Deliverables:**
- [ ] `audits.service.js` — Service baru
  - [ ] Listener event: `task.status.changed`, `task.assigned`, `project.created`, dll
  - [ ] Simpan ke entitas `AUDIT_LOG` (entity_type, entity_id, action, user_id, details JSON)
  - [ ] `GET /audit-logs?entityType=&entityId=` — List activity log
- [ ] `notifications.service.js` — Service baru
  - [ ] Notifikasi in-app saat ada penugasan baru (`task.assigned`)
  - [ ] Notifikasi saat ada komentar masuk (`task.comment.created`)
  - [ ] Notifikasi mention (`@user` dalam komentar)
  - [ ] `GET /notifications` — List notifikasi user
  - [ ] `PATCH /notifications/:id/read` — Tandai sudah dibaca
- [ ] Integrasi `@moleculer/channels` untuk async event processing
- [ ] Seed data: `audit_logs.json`

**File Kunci (target):**
```
services/audits.service.js
services/notifications.service.js
data/seed/audit_logs.json
```

---

### PHASE 8 — Analytics Service ❌ Belum Dimulai

**Tujuan:** Dashboard ringkasan, workload analysis, laporan sprint.

**Deliverables:**
- [ ] `analytics.service.js` — Service baru
- [ ] `GET /analytics/dashboard?projectId=` — Ringkasan proyek (task count per status)
- [ ] `GET /analytics/workload?workspaceId=` — Distribusi beban kerja per anggota
- [ ] `GET /analytics/sprint?projectId=` — Sprint progress & Velocity
- [ ] Burndown chart data endpoint
- [ ] Agregasi data dari tasks.service

**File Kunci (target):**
```
services/analytics.service.js
```

---

### PHASE 9 — Docs & Integrations Service ❌ Belum Dimulai

**Tujuan:** Manajemen dokumentasi proyek dan integrasi pihak ketiga.

**Deliverables:**
- [ ] `docs.service.js` — Service baru
  - [ ] Buat dan edit dokumen teknis (SRS, ERD, dll)
  - [ ] Version control dokumen (riwayat perubahan)
  - [ ] Real-time collaborative editing (via Moleculer events / Socket.IO)
- [ ] `integrations.service.js` — Service baru
  - [ ] Integrasi GitHub: hubungkan commit ke task terkait
  - [ ] Integrasi Slack: kirim notifikasi otomatis ke channel Slack

**File Kunci (target):**
```
services/docs.service.js
services/integrations.service.js
```

---

### PHASE 10 — Hardening & Production Ready ❌ Belum Dimulai

**Tujuan:** Menyiapkan sistem untuk production.

**Deliverables:**
- [ ] Migrasi semua JSON seed → MongoDB penuh
- [ ] Aktifkan CORS untuk domain frontend
- [ ] Aktifkan Circuit Breaker di `moleculer.config.js`
- [ ] Aktifkan Retry Policy
- [ ] Aktifkan Prometheus metrics (`/metrics`, port 3030)
- [ ] Aktifkan Distributed Tracing (Jaeger/Zipkin)
- [ ] Health check endpoint (`GET /health`)
- [ ] Pagination & filtering standar di semua list endpoint
- [ ] Full-text search (tasks, projects)
- [ ] Docker Compose: tambahkan semua services (saat ini hanya `api`)
- [ ] Security: NATS auth, Redis auth, HTTPS di Traefik

---

### PHASE 11 — Testing & Documentation ❌ Belum Dimulai

**Tujuan:** Test coverage lengkap dan dokumentasi API.

**Deliverables:**
- [ ] Unit tests untuk semua services (target: >80% coverage)
- [ ] Unit tests untuk semua mixins (`auth.mixin`, `db.mixin`)
- [ ] Integration tests untuk semua alur utama
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Postman Collection lengkap (semua endpoint)
- [ ] README per-service

---

## 📐 Arsitektur Sistem (Target Penuh)

```
Client (Browser / Mobile)
        ↓ HTTP
┌─────────────────────────────────────────────────────────┐
│                  api.service (Gateway)                   │
│         Auth Middleware · Rate Limit · CORS              │
└───┬──────┬──────┬──────┬──────┬──────┬──────┬───────────┘
    ↓      ↓      ↓      ↓      ↓      ↓      ↓
 auth   users  work-  proj-  tasks  collab  docs
service service spaces  ects  service service service
              service service
    ↓      ↓      ↓      ↓      ↓      ↓      ↓
┌─────────────────────────────────────────────────────────┐
│  storage · audits · notifications · analytics · integrations │
└─────────────────────────────────────────────────────────┘
        ↓ Moleculer Broker (NATS Transporter)
┌────────────────────────────────────────────┐
│  MongoDB (data)  ·  Redis (cache)  · NATS  │
└────────────────────────────────────────────┘
```

---

## ✅ Status & Progress (Diperbarui)

| Phase | Status | Progress | Catatan |
|---|---|---|---|
| Phase 0 — Setup & Foundation | ✅ Selesai | 100% | — |
| Phase 1 — Auth Service | ⚠️ Partial | 60% | Mock DB, belum Refresh Token & Logout |
| Phase 2 — Users Service | ❌ Belum Dimulai | 0% | — |
| Phase 3 — Workspace & Project | ⚠️ Partial | 55% | Belum: create WS, visibility, leader_id, real DB |
| Phase 4 — Tasks Service | ❌ Belum Dimulai | 0% | Core workflow |
| Phase 5 — Collaboration Service | ❌ Belum Dimulai | 0% | Comments, Mentions, Labels |
| Phase 6 — Storage Service | ❌ Belum Dimulai | 0% | File attachments |
| Phase 7 — Audits & Notifications | ❌ Belum Dimulai | 0% | — |
| Phase 8 — Analytics Service | ❌ Belum Dimulai | 0% | — |
| Phase 9 — Docs & Integrations | ❌ Belum Dimulai | 0% | GitHub, Slack |
| Phase 10 — Hardening & Production | ❌ Belum Dimulai | 0% | — |
| Phase 11 — Testing & Documentation | ❌ Belum Dimulai | 5% | 1 integration test ada |
