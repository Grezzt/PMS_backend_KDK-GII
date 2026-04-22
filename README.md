# 🏗️ PMS Backend — Project Management System

Backend **microservices** untuk Project Management System, dibangun dengan **[Moleculer JS](https://moleculer.services/)** (Node.js).

[![Node.js](https://img.shields.io/badge/Node.js-≥22.x-green)](https://nodejs.org)
[![Moleculer](https://img.shields.io/badge/Moleculer-0.15-blue)](https://moleculer.services)
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

---

## 📖 Dokumentasi Lengkap

| Dokumen | Deskripsi |
|---|---|
| [📋 Project Plan](./docs/project_plan.md) | Master plan semua fase pengembangan |
| [🚀 Setup & Instalasi](./docs/setup.md) | Panduan memulai dari nol |
| [📡 API Reference](./docs/api_reference.md) | Semua endpoint REST API |
| [🧩 Moleculer Patterns](./docs/moleculer_patterns.md) | Pola desain Moleculer yang digunakan |
| [🔐 RBAC System](./docs/rbac.md) | Sistem otorisasi berbasis peran |
| [🐳 Deployment Guide](./docs/deployment.md) | Docker, Kubernetes, CI/CD |

---

## ⚡ Quick Start

```bash
# Install dependencies
npm install

# Jalankan server development (hot-reload)
npm run dev

# Server berjalan di http://localhost:3000
```

---

## 🏗️ Arsitektur

```
Client (Browser/Mobile)
    ↓ HTTP Request
┌─────────────────────────────────────────────┐
│         API Gateway (api.service.js)         │
│  • Authentication via JWT                    │
│  • Authorization via Role check              │
│  • Rate Limiting (20 req/min/IP)             │
│  • Auto-route mapping (autoAliases)          │
└──────────────┬──────────────────────────────┘
               │ ctx.call() via Moleculer Broker
    ┌──────────┼──────────────────────────────┐
    ↓          ↓          ↓                   ↓
┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────────┐
│  Auth  │ │  Work  │ │ Projects │ │ Tasks (TODO) │
│Service │ │ spaces │ │ Service  │ │   Service    │
└────────┘ └────────┘ └──────────┘ └──────────────┘
    ↑           ↑           ↑
    └───────────┴───────────┘
         Mixins (Shared Logic)
    ┌────────────────────────┐
    │  auth.mixin.js (RBAC)  │
    │  db.mixin.js (DB Adapter) │
    └────────────────────────┘
```

---

## 📁 Struktur Proyek

```
PMS_backend/
├── services/               # Moleculer services
│   ├── api.service.js      # API Gateway (HTTP)
│   ├── auth.service.js     # Autentikasi & JWT
│   ├── workspaces.service.js # Workspace & membership
│   └── projects.service.js # Manajemen proyek
│
├── mixins/                 # Reusable mixins
│   ├── auth.mixin.js       # Contextual RBAC
│   └── db.mixin.js         # DB adapter factory
│
├── data/seed/              # Data awal (dev/test)
│   ├── users.json
│   ├── workspaces.json
│   ├── projects.json
│   ├── workspace_members.json
│   └── project_members.json
│
├── test/                   # Test files
│   ├── unit/
│   └── integration/
│
├── docs/                   # Dokumentasi lengkap ← di sini
│   ├── project_plan.md
│   ├── setup.md
│   ├── api_reference.md
│   ├── moleculer_patterns.md
│   ├── rbac.md
│   └── deployment.md
│
├── moleculer.config.js     # Konfigurasi Moleculer Broker
├── docker-compose.yml
├── Dockerfile
└── k8s.yaml
```

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|---|---|
| Framework | Moleculer JS 0.15 |
| API Gateway | moleculer-web |
| Database (dev) | NeDB (in-memory/file) |
| Database (prod) | MongoDB |
| Message Broker | NATS |
| Cache | Redis |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Testing | Jest + Supertest |

---

## 🎭 Role System

PMS menggunakan **Contextual RBAC** — user bisa punya role berbeda di tiap workspace/project:

```
viewer  →  Hanya bisa baca
member  →  Bisa buat & edit
admin   →  Bisa semua (termasuk hapus & kelola member)
```

Setiap service yang butuh otorisasi tinggal pakai `AuthMixin`:

```javascript
mixins: [AuthMixin],

async handler(ctx) {
  await this.checkProjectAccess(ctx, projectId, "member");
  // Lolos → lanjut logika bisnis
}
```

---

## 🧪 Testing

```bash
# Semua test
npm test

# Watch mode
npm run ci

# Dengan coverage
npm test -- --coverage
```

---

## 📜 Scripts

| Script | Perintah | Deskripsi |
|---|---|---|
| `dev` | `npm run dev` | Jalankan development server (hot-reload + REPL) |
| `start` | `npm start` | Jalankan production server |
| `test` | `npm test` | Jalankan semua test |
| `lint` | `npm run lint` | Cek kode style |
| `lint:fix` | `npm run lint:fix` | Auto-fix kode style |
| `dc:up` | `npm run dc:up` | Jalankan Docker Compose |
| `dc:logs` | `npm run dc:logs` | Lihat Docker logs |
| `dc:down` | `npm run dc:down` | Hentikan Docker Compose |

---

## 🗺️ Development Phases

> Berdasarkan `Rancangan MicroService.docx` — **12 services** yang direncanakan.

| Phase | Status | Deskripsi |
|---|---|---|
| 0 — Setup & Foundation | ✅ Selesai | Boilerplate, Docker, CI config |
| 1 — Auth Service | ⚠️ Partial (60%) | JWT login/register; belum Refresh Token, Logout, real DB |
| 2 — Users Service | ❌ Belum Dimulai | Identity & profil pengguna |
| 3 — Workspace & Project | ⚠️ Partial (55%) | Belum: buat WS, visibility, leader_id, real DB |
| 4 — Tasks Service | ❌ Belum Dimulai | CRUD task, subtask, assignee, auto-progress |
| 5 — Collaboration | ❌ Belum Dimulai | Komentar, mention @user, label/tag |
| 6 — Storage | ❌ Belum Dimulai | File attachment task/dokumen |
| 7 — Audits & Notifications | ❌ Belum Dimulai | Activity log & notifikasi in-app |
| 8 — Analytics | ❌ Belum Dimulai | Dashboard, workload, Sprint/Burndown |
| 9 — Docs & Integrations | ❌ Belum Dimulai | GitHub, Slack, version control dokumen |
| 10 — Hardening & Production | ❌ Belum Dimulai | Circuit Breaker, metrics, real MongoDB |
| 11 — Testing & Documentation | ❌ Belum Dimulai | >80% coverage, Swagger, Postman |

---

> 📚 Lihat [**docs/project_plan.md**](./docs/project_plan.md) untuk detail lengkap semua fase.
