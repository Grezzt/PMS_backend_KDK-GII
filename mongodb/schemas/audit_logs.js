"use strict";

/**
 * MongoDB Schema — AuditLog
 * Collection: audit_logs (database: pms_nosql)
 *
 * Mencatat setiap perubahan penting dalam sistem PMS.
 * Digunakan oleh audits.service untuk:
 *   - Merekam TASK_CREATED, TASK_STATUS_UPDATED, TASK_ASSIGNED, dll
 *   - GET /audit-logs?entityType=TASK&entityId=xxx
 */

/**
 * @typedef {Object} AuditLog
 * @property {ObjectId} _id
 * @property {string}   entity_type  - "TASK" | "PROJECT" | "WORKSPACE" | "USER"
 * @property {string}   entity_id    - UUID dari entitas yang diubah
 * @property {string}   action       - Event: "TASK_CREATED", "TASK_STATUS_UPDATED", dll
 * @property {string}   user_id      - UUID referensi ke users.id di PostgreSQL
 * @property {Object}   details      - Snapshot: { before: {...}, after: {...} }
 * @property {Date}     created_at
 */

// Tipe entitas yang valid
const ENTITY_TYPES = {
  TASK:      "TASK",
  PROJECT:   "PROJECT",
  WORKSPACE: "WORKSPACE",
  USER:      "USER",
  SYSTEM:    "SYSTEM"
};

// Tipe aksi yang valid
const AUDIT_ACTIONS = {
  // Task events
  TASK_CREATED:          "TASK_CREATED",
  TASK_UPDATED:          "TASK_UPDATED",
  TASK_DELETED:          "TASK_DELETED",
  TASK_STATUS_UPDATED:   "TASK_STATUS_UPDATED",
  TASK_ASSIGNED:         "TASK_ASSIGNED",
  TASK_UNASSIGNED:       "TASK_UNASSIGNED",

  // Project events
  PROJECT_CREATED:       "PROJECT_CREATED",
  PROJECT_UPDATED:       "PROJECT_UPDATED",
  PROJECT_DELETED:       "PROJECT_DELETED",

  // Workspace events
  WORKSPACE_CREATED:     "WORKSPACE_CREATED",
  WORKSPACE_UPDATED:     "WORKSPACE_UPDATED",
  MEMBER_ADDED:          "MEMBER_ADDED",
  MEMBER_REMOVED:        "MEMBER_REMOVED",
  MEMBER_ROLE_CHANGED:   "MEMBER_ROLE_CHANGED",

  // User events
  USER_REGISTERED:       "USER_REGISTERED",
  USER_LOGIN:            "USER_LOGIN",
  USER_LOGOUT:           "USER_LOGOUT",
  USER_PROFILE_UPDATED:  "USER_PROFILE_UPDATED"
};

const AUDIT_LOG_SCHEMA = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["entity_type", "entity_id", "action", "user_id", "created_at"],
      properties: {
        entity_type: { bsonType: "string" },
        entity_id:   { bsonType: "string" },
        action:      { bsonType: "string" },
        user_id:     { bsonType: "string" },
        details:     { bsonType: "object" },
        created_at:  { bsonType: "date" }
      }
    }
  }
};

const AUDIT_LOG_INDEXES = [
  { key: { entity_type: 1, entity_id: 1 } },
  { key: { user_id: 1 } },
  { key: { created_at: -1 } },
  { key: { entity_type: 1, created_at: -1 } }
];

/**
 * Buat dokumen AuditLog baru
 * @param {string} entityType
 * @param {string} entityId
 * @param {string} action
 * @param {string} userId
 * @param {Object} details - { before, after } atau metadata lain
 */
function createAuditLog(entityType, entityId, action, userId, details = {}) {
  return {
    entity_type: entityType,
    entity_id:   entityId,
    action:      action,
    user_id:     userId,
    details:     details,
    created_at:  new Date()
  };
}

module.exports = {
  COLLECTION_NAME: "audit_logs",
  ENTITY_TYPES,
  AUDIT_ACTIONS,
  AUDIT_LOG_SCHEMA,
  AUDIT_LOG_INDEXES,
  createAuditLog
};
