# 🧩 Moleculer Patterns — Panduan Pola Desain

Dokumentasi ini menjelaskan secara detail **pola Moleculer** yang digunakan dalam PMS Backend, beserta alasan pemilihan dan cara penggunaannya.

---

## 1. Service Schema — Anatomi Service Moleculer

Setiap file service di PMS mengikuti struktur standar Moleculer:

```javascript
module.exports = {
  name: "nama-service",      // ← Nama unik service (digunakan sbg namespace action)
  mixins: [],                // ← Mixin yang digunakan
  settings: {},              // ← Konfigurasi service
  dependencies: [],          // ← Service lain yang harus ada sebelum service ini start
  actions: {},               // ← Definisi endpoint/aksi yang bisa dipanggil
  events: {},                // ← Event listener
  methods: {},               // ← Helper methods (tidak bisa dipanggil dari luar)
  created() {},              // ← Lifecycle hook
  async started() {},        // ← Dipanggil saat service start
  async stopped() {}         // ← Dipanggil saat service stop
};
```

---

## 2. Mixins — Komposisi Perilaku

### 📌 Konsep Mixin di Moleculer

Mixin di Moleculer mirip dengan **multiple inheritance** atau **trait** di bahasa lain. Satu mixin bisa berisi `actions`, `methods`, `events`, `hooks`, dan `settings` yang akan di-**merge** ke dalam service yang menggunakannya.

**Cara kerja merge:**
- `methods` → digabungkan, tidak ada override kecuali nama sama
- `actions` → digabungkan
- `settings` → di-merge dalam (deep merge)
- `hooks` → dijalankan semua (tidak ada override)

### 🛡️ auth.mixin.js — Contextual RBAC

**Lokasi:** `mixins/auth.mixin.js`

Mixin ini menyediakan helper method untuk **authorization berbasis konteks** (workspace atau proyek). Setiap service yang butuh otorisasi cukup menambahkan mixin ini ke `mixins` array-nya.

```javascript
// Contoh penggunaan di projects.service.js
const AuthMixin = require("../mixins/auth.mixin");

module.exports = {
  name: "projects",
  mixins: [AuthMixin],  // ← Inject mixin
  
  actions: {
    update: {
      async handler(ctx) {
        // Method dari mixin langsung tersedia!
        await this.checkProjectAccess(ctx, id, "member");
        // ...
      }
    }
  }
};
```

**Methods yang disediakan:**

| Method | Deskripsi | Parameter |
|---|---|---|
| `requireAuth(ctx)` | Validasi user sudah login (ada di `ctx.meta.user`) | `ctx` |
| `checkProjectAccess(ctx, projectId, requiredRole)` | Cek akses user ke proyek | `ctx`, `projectId`, role minimum |
| `checkWorkspaceAccess(ctx, workspaceId, requiredRole)` | Cek akses user ke workspace | `ctx`, `workspaceId`, role minimum |

**Role Hierarchy:**
```
viewer  <  member  <  admin
  0          1          2
```

Jika user memiliki role `admin`, maka `checkProjectAccess(ctx, id, "viewer")` akan lolos karena `admin >= viewer`.

**Alur Resolusi Role:**
```
checkProjectAccess(ctx, projectId, "member")
    ↓
workspaces.getMemberRole({ userId, projectId })
    ↓
  project_members tabel? → ambil role project-specific
    ↓ (tidak ada)
  projects tabel → ambil workspaceId
    ↓
  workspace_members tabel → ambil inherited role
    ↓ (tidak ada)
  return { role: null } → throw 403 ERR_FORBIDDEN
```

---

### 💾 db.mixin.js — Database Adapter Factory

**Lokasi:** `mixins/db.mixin.js`

Mixin ini adalah **factory function** (bukan object biasa) yang membuat konfigurasi database adapter secara otomatis berdasarkan environment.

```javascript
// Penggunaan di service
const DbMixin = require("../mixins/db.mixin");

module.exports = {
  name: "users",
  mixins: [DbMixin({ collection: "users" })],
  // ↑ Panggil sebagai fungsi, bukan langsung dipakai sebagai object
};
```

**Logika pemilihan adapter:**

```
DB_URI dimulai "mongodb://"?
    YES → MongoDB adapter (production)
    NO  →
        NODE_ENV === "test"?
            YES → NeDB in-memory (testing)
            NO  → NeDB file storage (development)
                  File: ./data/<collection>.db
```

**Events yang di-handle:**

```javascript
// Setiap service yang pakai db.mixin bisa menerima event ini
// untuk membersihkan cache ketika data berubah
async ["cache.clean.<collection>"]() {
  await this.broker.cacher?.clean(`${this.fullName}.*`);
}
```

---

## 3. API Gateway Pattern

**Lokasi:** `services/api.service.js`

API Gateway adalah **satu-satunya pintu masuk** dari luar. Semua HTTP request masuk melalui sini.

### Route Configuration

```javascript
routes: [{
  path: "/api",
  whitelist: ["auth.**", "projects.**", "workspaces.**"],
  authentication: true,   // ← Aktifkan authenticate()
  authorization: true,    // ← Aktifkan authorize()
  autoAliases: true,      // ← Auto-generate routes dari `rest:` di actions
}]
```

### Auto-Aliases

Dengan `autoAliases: true`, setiap action yang memiliki properti `rest` akan **otomatis** dijadikan HTTP endpoint:

```javascript
// Di auth.service.js
login: {
  rest: "POST /login",
  // ...
}
// → Otomatis menjadi: POST /api/auth/login
```

### Authentication Flow

```javascript
async authenticate(ctx, route, req) {
  const auth = req.headers["authorization"];
  
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    // Panggil auth.verifyToken → set ctx.meta.user
    const user = await ctx.call("auth.verifyToken", { token });
    return user;  // → ctx.meta.user = user
  }
  
  return null;  // Guest user (bisa akses route tanpa auth)
}
```

### Authorization Flow

```javascript
async authorize(ctx, route, req) {
  const user = ctx.meta.user;
  
  // Jika action punya `auth: "required"`, user HARUS login
  if (req.$action.auth === "required" && !user) {
    throw new UnAuthorizedError("NO_RIGHTS");
  }
  
  // Jika action punya `roles: [...]`, cek role user
  if (req.$action.roles && !req.$action.roles.includes(user.role)) {
    throw new UnAuthorizedError("INSUFFICIENT_PERMISSIONS");
  }
}
```

---

## 4. Action Parameter Validation

Moleculer memiliki built-in parameter validator menggunakan `fastest-validator`.

```javascript
actions: {
  create: {
    params: {
      workspaceId:  "string",           // Wajib, tipe string
      name:         "string",           // Wajib
      description:  { 
        type: "string", 
        optional: true                  // Opsional
      },
      status: {
        type: "enum",
        values: ["active", "archived"], // Enum validation
        optional: true
      }
    },
    async handler(ctx) {
      // Jika params tidak valid, Moleculer otomatis throw 422
      // Handler hanya jalan jika params valid
    }
  }
}
```

---

## 5. Caching Pattern

### Action-Level Caching

```javascript
// Hasil action di-cache di memory/Redis
verifyToken: {
  cache: {
    ttl: 60,           // Cached 60 detik
    keys: ["token"]    // Cache key berdasarkan param 'token'
  },
  handler(ctx) {
    // Hanya dieksekusi jika tidak ada cache
    return jwt.verify(ctx.params.token, JWT_SECRET);
  }
}
```

### Cache Invalidation

```javascript
// Di workspaces.service.js — setelah update membership
await this.broker.emit("cache.clean.workspaces", {});
// ↑ Event ini ditangkap db.mixin → bersihkan cache service 'workspaces'
```

---

## 6. Event System

Moleculer memiliki 2 jenis event:

### `emit` — Fire & Forget (Balanced)
Dikirim ke **satu** instance service (load-balanced jika ada replika).

```javascript
// Di auth.service.js setelah login sukses
this.broker.emit("auth.user.login", { 
  userId: user.id, 
  username: user.username 
});
```

### `broadcast` — Ke Semua Instance
Dikirim ke **semua** instance service (termasuk node lain).

```javascript
// Di auth.service.js setelah register
ctx.broadcast("user.created", { username, email });
// ↑ Semua service yang listen event ini akan menerimanya
```

### Event Listener

```javascript
module.exports = {
  name: "email",
  events: {
    "user.created"(ctx) {
      // Kirim email sambutan
      this.sendWelcomeEmail(ctx.params.email);
    }
  }
};
```

---

## 7. Service-to-Service Communication

Dalam satu cluster Moleculer, service berkomunikasi lewat `ctx.call()`:

```javascript
// Di auth.mixin.js — panggil action dari service lain
const result = await ctx.call("workspaces.getMemberRole", {
  userId: user.id,
  projectId: projectId
});
```

**Keunggulan:**
- Otomatis load-balanced (Round Robin default)
- Timeout handling (10 detik default)
- Retry policy
- Circuit breaker
- Tracing otomatis

---

## 8. Visibility Action

```javascript
getMemberRole: {
  visibility: "public",  // Bisa dipanggil dari service lain
  // Nilai: "published" (via API), "public" (internal), "protected" (local), "private" (tidak bisa dipanggil sama sekali dari luar)
}
```

| Visibility | HTTP via Gateway | ctx.call() |
|---|---|---|
| `published` | ✅ | ✅ |
| `public` | ❌ | ✅ |
| `protected` | ❌ | ✅ (node sama) |
| `private` | ❌ | ❌ |

---

## 9. Lifecyle Hooks (Service Hooks)

```javascript
module.exports = {
  name: "myservice",
  
  // Dipanggil saat broker dibuat, sebelum service start
  created() {
    this.logger.info("Service created");
  },
  
  // Dipanggil saat service start (async, bisa await)
  async started() {
    // Contoh: cek koneksi DB, seed data awal
    const adapter = await this.getAdapter();
    const count = await adapter.count();
    if (count === 0) await this.seedDB();
  },
  
  // Dipanggil saat service stop
  async stopped() {
    // Cleanup: tutup koneksi, flush buffer, dll
  }
};
```

---

## 10. Middlewares

**Lokasi konfigurasi:** `moleculer.config.js`

```javascript
middlewares: [
  // Channels Middleware — untuk message queue (Kafka, NATS JetStream)
  ChannelMiddleware({
    adapter: process.env.CHANNEL_URL || "Fake"  // "Fake" = in-memory untuk dev
  }),

  // Workflows Middleware — untuk long-running business workflows
  WorkflowsMiddleware({
    adapter: process.env.WORKFLOWS_URL || "Redis",
    tracing: false
  })
]
```

---

## 11. Rate Limiting

Dikonfigurasi di API Gateway:

```javascript
rateLimit: {
  window: 60 * 1000,  // Window 1 menit
  limit: 20,          // Max 20 request per IP per menit
  headers: true,      // Kirim header X-RateLimit-*
  key: req => req.headers["x-forwarded-for"] || req.socket.remoteAddress
}
```

Response saat rate limit terlampaui:
```json
{
  "name": "RateLimitExceeded",
  "message": "Rate limit exceeded",
  "code": 429
}
```

---

## 12. Fault Tolerance (Konfigurasi)

Semua dikonfigurasi di `moleculer.config.js`. Saat ini dinonaktifkan untuk development:

| Fitur | Status | Kapan Aktifkan |
|---|---|---|
| **Retry Policy** | ❌ Disabled | Production, unstable network |
| **Circuit Breaker** | ❌ Disabled | Production, protect from cascades |
| **Bulkhead** | ❌ Disabled | High-load production |
| **Request Timeout** | ✅ Active | 10 detik default |

Contoh mengaktifkan Circuit Breaker:
```javascript
circuitBreaker: {
  enabled: true,
  threshold: 0.5,      // 50% requests gagal → trip
  minRequestCount: 20, // Minimum 20 req sebelum dinilai
  windowTime: 60,      // Window evaluasi 60 detik
  halfOpenTime: 10000  // Coba buka lagi setelah 10 detik
}
```
