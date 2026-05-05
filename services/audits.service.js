"use strict";

const MongoMixin = require("../mixins/mongo.mixin");
const { createAuditLog } = require("../mongodb/schemas/audit_logs");

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 */

/** @type {ServiceSchema} */
module.exports = {
	name: "audits",
	mixins: [MongoMixin({ collection: "audit_logs" })],

	actions: {
		log: {
			visibility: "public",
			params: {
				entityType: "string",
				entityId: "string",
				action: "string",
				userId: "string",
				details: { type: "object", optional: true }
			},
			async handler(ctx) {
				const { entityType, entityId, action, userId, details } = ctx.params;
				const logDoc = createAuditLog(entityType, entityId, action, userId, details || {});
				const adapter = await this.getAdapter();
				return adapter.insert(logDoc);
			}
		}
	}
};
