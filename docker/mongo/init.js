// =============================================================================
// MongoDB Initialization Script
// Dieksekusi otomatis saat container MongoDB pertama kali dibuat
// Collections: user_tokens, audit_logs
// =============================================================================

// Switch ke database pms_nosql
db = db.getSiblingDB("pms_nosql");

// -----------------------------------------------------------------------------
// Collection: user_tokens
// Menyimpan Refresh Token untuk setiap user
// -----------------------------------------------------------------------------
db.createCollection("user_tokens", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["user_id", "refresh_token", "expires_at", "is_revoked"],
      properties: {
        user_id: {
          bsonType: "string",
          description: "UUID referensi ke users.id di PostgreSQL — wajib"
        },
        refresh_token: {
          bsonType: "string",
          description: "Token acak untuk memperbarui Access Token — wajib"
        },
        expires_at: {
          bsonType: "date",
          description: "Waktu kedaluwarsa Refresh Token (default 7 hari) — wajib"
        },
        is_revoked: {
          bsonType: "bool",
          description: "Status pencabutan token — default false"
        },
        created_at: {
          bsonType: "date",
          description: "Waktu token dibuat"
        }
      }
    }
  }
});

// Index untuk lookup cepat berdasarkan user_id
db.user_tokens.createIndex({ "user_id": 1 });

// Index unik pada refresh_token untuk mencegah duplikasi
db.user_tokens.createIndex({ "refresh_token": 1 }, { unique: true });

// Index TTL — dokumen otomatis dihapus setelah expires_at terlewati
db.user_tokens.createIndex({ "expires_at": 1 }, { expireAfterSeconds: 0 });

// Index untuk filter token yang aktif
db.user_tokens.createIndex({ "user_id": 1, "is_revoked": 1 });

print("✅ Collection 'user_tokens' created with indexes.");

// -----------------------------------------------------------------------------
// Collection: audit_logs
// Mencatat setiap perubahan penting dalam sistem
// -----------------------------------------------------------------------------
db.createCollection("audit_logs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["entity_type", "entity_id", "action", "user_id", "created_at"],
      properties: {
        entity_type: {
          bsonType: "string",
          description: "Entitas yang diubah: TASK, PROJECT, WORKSPACE, USER — wajib"
        },
        entity_id: {
          bsonType: "string",
          description: "ID dari entitas yang diubah — wajib"
        },
        action: {
          bsonType: "string",
          description: "Jenis event: TASK_CREATED, TASK_STATUS_UPDATED, dll — wajib"
        },
        user_id: {
          bsonType: "string",
          description: "UUID referensi ke users.id di PostgreSQL — wajib"
        },
        details: {
          bsonType: "object",
          description: "Data snapshot perubahan (before & after state)"
        },
        created_at: {
          bsonType: "date",
          description: "Waktu perubahan terjadi — wajib"
        }
      }
    }
  },
  // Capped collection opsional: batasi log ke 10.000 dokumen terakhir
  // capped: true,
  // size: 104857600, // 100 MB
  // max: 10000
});

// Index untuk query log berdasarkan entity
db.audit_logs.createIndex({ "entity_type": 1, "entity_id": 1 });

// Index untuk history per user
db.audit_logs.createIndex({ "user_id": 1 });

// Index untuk sorting by time (most recent first)
db.audit_logs.createIndex({ "created_at": -1 });

// Compound index untuk query umum: filter entity + waktu
db.audit_logs.createIndex({ "entity_type": 1, "created_at": -1 });

print("✅ Collection 'audit_logs' created with indexes.");

// -----------------------------------------------------------------------------
// Seed Data Awal (Development Only)
// -----------------------------------------------------------------------------
const now = new Date();

// Contoh audit log awal
db.audit_logs.insertOne({
  entity_type: "SYSTEM",
  entity_id: "system",
  action: "SYSTEM_INITIALIZED",
  user_id: "system",
  details: {
    message: "MongoDB PMS NoSQL database initialized",
    collections: ["user_tokens", "audit_logs"]
  },
  created_at: now
});

print("✅ MongoDB PMS NoSQL database initialized successfully.");
print("   Collections created: user_tokens, audit_logs");
