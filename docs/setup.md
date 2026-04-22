# 🚀 Setup & Instalasi — PMS Backend

Panduan lengkap untuk menjalankan **PMS Backend** dari nol di lingkungan lokal maupun Docker.

---

## 📋 Prerequisites

Pastikan software berikut sudah terinstall:

| Software | Versi Minimum | Cara Cek |
|---|---|---|
| **Node.js** | >= 22.x | `node -v` |
| **npm** | >= 10.x | `npm -v` |
| **Docker Desktop** | terbaru | `docker -v` |
| **Git** | terbaru | `git -v` |

> [!TIP]
> Gunakan [nvm](https://github.com/nvm-sh/nvm) untuk mengelola versi Node.js dengan mudah.

---

## 🛠️ Instalasi Lokal (Development)

### 1. Clone / Buka Proyek

```bash
# Jika menggunakan git
git clone <repository-url>
cd PMS_backend

# Atau langsung navigasi ke folder
cd "c:\kuliah\kdk\boiler plate\PMS_backend"
```

### 2. Install Dependencies

```bash
npm install
```

Perintah ini akan menginstall semua package yang ada di `package.json`, termasuk:
- `moleculer`, `moleculer-web` (framework & API gateway)
- `jsonwebtoken`, `bcryptjs` (autentikasi)
- `@moleculer/database`, `@seald-io/nedb` (database layer)
- `@moleculer/channels`, `@moleculer/workflows` (messaging)
- `ioredis`, `nats` (infrastructure clients)

### 3. Konfigurasi Environment (Opsional untuk Dev)

Untuk development lokal, semua default sudah berjalan tanpa konfigurasi tambahan. Namun jika ingin menyesuaikan:

```bash
# Buat file .env di root proyek (tidak ada di git)
cp docker-compose.env .env
```

Variabel environment yang tersedia:

```dotenv
# Port API Gateway
PORT=3000

# Secret untuk JWT (wajib diganti di production!)
JWT_SECRET=my-super-secret-key-12345

# Transporter (kosong = in-process, cocok untuk dev satu node)
TRANSPORTER=

# Database URI (kosong = NeDB lokal)
DB_URI=

# Redis untuk caching
REDIS_URI=redis://localhost:6379

# Channel adapter
CHANNEL_URL=Fake

# Workflows adapter
WORKFLOWS_URL=Redis
```

### 4. Jalankan Server Development

```bash
npm run dev
```

Perintah ini menjalankan `moleculer-runner` dengan:
- `--repl` : mengaktifkan Moleculer REPL (Command Line Interactive)
- `--hot` : Hot-reload saat file berubah

**Output yang diharapkan:**
```
[2026-04-22T02:49:00.000Z] INFO  node-1/REGISTRY: Service 'api' registered.
[2026-04-22T02:49:00.000Z] INFO  node-1/REGISTRY: Service 'auth' registered.
[2026-04-22T02:49:00.000Z] INFO  node-1/REGISTRY: Service 'workspaces' registered.
[2026-04-22T02:49:00.000Z] INFO  node-1/REGISTRY: Service 'projects' registered.
[2026-04-22T02:49:00.000Z] INFO  node-1/API: API Gateway listening on http://0.0.0.0:3000
```

Server siap di: **`http://localhost:3000`**

---

## 🐳 Menjalankan dengan Docker Compose

### 1. Build dan Jalankan

```bash
npm run dc:up
# atau
docker compose up --build -d
```

Perintah ini akan menjalankan semua container:
- **api** — PMS Backend (port 3000)
- **mongo** — MongoDB database
- **nats** — Message broker (NATS)
- **redis** — Cache server
- **traefik** — Reverse proxy (port 3000 → service)

### 2. Cek Status Container

```bash
docker compose ps
```

### 3. Lihat Logs

```bash
npm run dc:logs
# atau untuk service tertentu:
docker compose logs -f api
```

### 4. Hentikan Semua Container

```bash
npm run dc:down
# atau
docker compose down
```

---

## 🧪 Menjalankan Tests

### Unit Tests

```bash
npm test
# atau watch mode
npm run ci
```

### Dengan Coverage Report

```bash
npm test -- --coverage
```

Coverage report tersedia di `./coverage/`

---

## 🔌 Verifikasi Instalasi

Setelah server berjalan, verifikasi dengan request berikut:

### Health Check

```bash
curl http://localhost:3000/api/health
```

### Coba Login (Credential default dev)

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password123"}'
```

**Response yang diharapkan:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Coba Akses Protected Route

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token-dari-login>"
```

---

## 📁 Seed Data Development

Proyek ini sudah menyertakan data awal di `data/seed/`:

| File | Isi |
|---|---|
| `users.json` | 4 user: admin, alice, bob, charlie |
| `workspaces.json` | 2 workspace: Engineering, Marketing |
| `projects.json` | 3 proyek di kedua workspace |
| `workspace_members.json` | Role membership per workspace |
| `project_members.json` | Role override per proyek |

Credential default untuk testing:
- **Username:** `admin`
- **Password:** `password123`

---

## 🔧 Troubleshooting

### Port 3000 sudah dipakai

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# macOS/Linux
lsof -i :3000
kill -9 <pid>
```

### Error: Cannot find module

```bash
# Hapus node_modules dan install ulang
rm -rf node_modules
npm install
```

### Redis connection error (saat pakai Docker)

Pastikan Redis container sudah running:
```bash
docker compose up redis -d
```

### NATS connection error

Untuk development lokal tanpa Docker, pastikan `TRANSPORTER` di `.env` dikosongkan (in-process mode).
