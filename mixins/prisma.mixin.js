// mixins/prisma.mixin.js
"use strict";

const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");

/**
 * Prisma Database Mixin
 * Mengelola lifecycle koneksi PostgreSQL secara terpusat per Node.
 */
module.exports = {
	name: "db-prisma",

	created() {
		const pool = new Pool({ connectionString: process.env.DATABASE_URL });
		const adapter = new PrismaPg(pool);

		// Singleton pattern: inisialisasi hanya saat service dibuat
		this.prisma = new PrismaClient({
			adapter,
			log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"]
		});
	},

	async started() {
		try {
			await this.prisma.$connect();
			this.logger.info("✅ PostgreSQL (Prisma) connected successfully.");
		} catch (error) {
			this.logger.error("❌ PostgreSQL (Prisma) connection failed:", error);
			throw error;
		}
	},

	async stopped() {
		if (this.prisma) {
			await this.prisma.$disconnect();
			this.logger.info("🛑 PostgreSQL (Prisma) disconnected.");
		}
	}
};
