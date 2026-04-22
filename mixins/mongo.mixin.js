"use strict";

const { Service: DbService } = require("@moleculer/database");
const _ = require("lodash");

/**
 * MongoDB Mixin Builder
 * Digunakan untuk service yang membutuhkan penyimpanan NoSQL (seperti Audit Logs).
 * * @param {Object} opts - Opsi konfigurasi database (misal: { collection: "audit_logs" })
 * @returns {import('moleculer').ServiceSchema}
 */
module.exports = function (opts) {
	const collection = opts?.collection;

	// Default configuration: Menggunakan MongoDB jika MONGO_URI ada, jika tidak fallback ke NeDB (file lokal)
	opts = _.defaultsDeep(opts, {
		adapter: process.env.MONGO_URI?.startsWith("mongodb://")
			? {
					type: "MongoDB",
					options: {
						uri: process.env.MONGO_URI // Pastikan ini sesuai dengan .env kamu
					}
				}
			: {
					type: "NeDB",
					options:
						process.env.NODE_ENV === "test"
							? { neDB: { inMemoryOnly: true } } // In-memory untuk unit test
							: `./data/${collection}.db` // File-based untuk lokal tanpa Docker
				},
		strict: false // False agar skema fleksibel (khas NoSQL)
	});

	const cacheCleanEventName = `cache.clean.${collection}`;

	return {
		mixins: [DbService(opts)],

		events: {
			/**
			 * Membersihkan cache secara otomatis jika ada perubahan data pada collection ini.
			 * Sangat berguna jika kamu mengaktifkan Redis/Memory Cacher di masa depan.
			 */
			async [cacheCleanEventName]() {
				if (this.broker.cacher) {
					await this.broker.cacher.clean(`${this.fullName}.*`);
					this.logger.debug(`🧹 Cache cleared for ${this.fullName}`);
				}
			}
		},

		async started() {
			// Fitur auto-seed (opsional): Jika database kosong dan ada method seedDB di service, jalankan.
			if (this.seedDB) {
				const adapter = await this.getAdapter();
				const count = await adapter.count();
				if (count === 0) {
					this.logger.info(
						`🌱 Collection '${collection}' kosong. Memulai seeding data...`
					);
					await this.seedDB();
					this.logger.info(`✅ Seeding selesai. Total data: ${await adapter.count()}`);
				}
			}
		}
	};
};
