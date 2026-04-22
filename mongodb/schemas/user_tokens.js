"use strict";

/**
 * MongoDB Schema — UserToken
 * Collection: user_tokens (database: pms_nosql)
 *
 * Menyimpan Refresh Token untuk sistem autentikasi.
 * Digunakan oleh auth.service untuk:
 *   - POST /auth/login     → simpan refresh token
 *   - POST /auth/refresh   → verifikasi dan buat access token baru
 *   - POST /auth/logout    → set is_revoked = true
 */

const { ObjectId } = require("mongodb");

/**
 * @typedef {Object} UserToken
 * @property {ObjectId} _id
 * @property {string}   user_id       - UUID referensi ke users.id di PostgreSQL
 * @property {string}   refresh_token - Token acak (uuid atau random bytes)
 * @property {Date}     expires_at    - Waktu kedaluwarsa (7 hari dari created)
 * @property {boolean}  is_revoked    - True jika sudah di-logout
 * @property {Date}     created_at
 */

const USER_TOKEN_SCHEMA = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["user_id", "refresh_token", "expires_at", "is_revoked"],
      properties: {
        user_id:       { bsonType: "string" },
        refresh_token: { bsonType: "string" },
        expires_at:    { bsonType: "date" },
        is_revoked:    { bsonType: "bool" },
        created_at:    { bsonType: "date" }
      }
    }
  }
};

const USER_TOKEN_INDEXES = [
  { key: { user_id: 1 } },
  { key: { refresh_token: 1 }, unique: true },
  { key: { expires_at: 1 }, expireAfterSeconds: 0 },  // TTL index — auto-delete
  { key: { user_id: 1, is_revoked: 1 } }
];

/**
 * Buat dokumen UserToken baru
 * @param {string} userId
 * @param {string} refreshToken
 * @param {number} expiresInDays - Default 7 hari
 */
function createUserToken(userId, refreshToken, expiresInDays = 7) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

  return {
    user_id:       userId,
    refresh_token: refreshToken,
    expires_at:    expiresAt,
    is_revoked:    false,
    created_at:    now
  };
}

module.exports = {
  COLLECTION_NAME: "user_tokens",
  USER_TOKEN_SCHEMA,
  USER_TOKEN_INDEXES,
  createUserToken
};
