"use strict";

const { MoleculerError } = require("moleculer").Errors;
const bcrypt = require("bcryptjs");
const PrismaMixin = require("../mixins/prisma.mixin");

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 * @typedef {import('moleculer').Context} Context
 */

/**
 * Users Service — Phase 2
 * -----------------------
 * Manajemen identitas dan profil pengguna.
 *
 * Endpoints:
 *   GET  /users/me         — Ambil profil user yang sedang login
 *   PATCH /users/me        — Update profil sendiri (name, email, password)
 *   GET  /users/:id        — Lihat profil user lain (authenticated)
 *   GET  /users            — List semua user (admin global only)
 *
 * Database: PostgreSQL via Prisma (model User)
 *
 * @type {ServiceSchema}
 */
module.exports = {
	name: "users",
	mixins: [PrismaMixin],

	settings: {
		/** Field yang dikembalikan ke client (field sensitif dikecualikan) */
		safeFields: ["id", "name", "email", "createdAt", "updatedAt"]
	},

	actions: {
		// ─── GET /users/me ───────────────────────────────────────────────────
		/**
		 * Ambil profil lengkap user yang sedang terautentikasi.
		 * Membutuhkan JWT Bearer Token yang valid.
		 */
		me: {
			rest: "GET /me",
			auth: "required",
			async handler(ctx) {
				const { id } = ctx.meta.user;

				const user = await this.prisma.user.findUnique({ where: { id } });
				if (!user) {
					// Security: jangan reveal apakah user ada atau tidak
					throw new MoleculerError("Unauthorized", 401, "ERR_UNAUTHORIZED");
				}

				this.logger.info(`[users] Profile fetched: ${user.email} (ID: ${user.id})`);
				return {
					message: "OK",
					code: 200,
					type: "SUCCESS",
					data: this._sanitizeUser(user)
				};
			}
		},

		// ─── PATCH /users/me ─────────────────────────────────────────────────
		/**
		 * Update profil user yang sedang login.
		 * Field yang bisa diupdate: name, email, password.
		 * Semua field bersifat opsional — partial update.
		 */
		updateMe: {
			rest: "PATCH /me",
			auth: "required",
			params: {
				name: { type: "string", min: 2, max: 100, optional: true },
				email: { type: "email", optional: true },
				password: { type: "string", min: 6, optional: true },
				currentPassword: { type: "string", optional: true }
			},
			async handler(ctx) {
				const { id } = ctx.meta.user;
				const { name, email, password, currentPassword } = ctx.params;

				// Cari user yang sedang login
				const user = await this.prisma.user.findUnique({ where: { id } });
				if (!user) {
					throw new MoleculerError("Unauthorized", 401, "ERR_UNAUTHORIZED");
				}

				const updateData = {};

				// ── Update name ─────────────────────────────────────────────
				if (name !== undefined) {
					updateData.name = name;
				}

				// ── Update email ────────────────────────────────────────────
				if (email !== undefined && email !== user.email) {
					const emailTaken = await this.prisma.user.findUnique({ where: { email } });
					if (emailTaken) {
						throw new MoleculerError("Email already used", 409, "ERR_CONFLICT");
					}
					updateData.email = email;
				}

				// ── Update password ─────────────────────────────────────────
				if (password !== undefined) {
					// Wajib sertakan currentPassword untuk verifikasi
					if (!currentPassword) {
						throw new MoleculerError("Bad Request", 400, "ERR_BAD_REQUEST");
					}
					const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
					if (!isMatch) {
						throw new MoleculerError(
							"Current password is incorrect",
							401,
							"ERR_WRONG_PASSWORD"
						);
					}
					updateData.passwordHash = await bcrypt.hash(password, 12);
				}

				// Jika tidak ada field yang diubah, return profil saat ini
				if (Object.keys(updateData).length === 0) {
					this.logger.debug(`[users] No changes submitted by user=${id}`);
					return {
						message: "OK",
						code: 200,
						type: "SUCCESS",
						data: this._sanitizeUser(user)
					};
				}

				const updated = await this.prisma.user.update({
					where: { id },
					data: updateData
				});

				this.logger.info(`[users] Profile updated: ${updated.email} (ID: ${updated.id})`);

				// Broadcast event agar service lain bisa bereaksi (misal: invalidate cache token)
				ctx.broadcast("user.updated", {
					userId: updated.id,
					changes: Object.keys(updateData).filter(k => k !== "passwordHash")
				});

				return {
					message: "OK",
					code: 200,
					type: "SUCCESS",
					data: this._sanitizeUser(updated)
				};
			}
		},

		// ─── GET /users/:id ──────────────────────────────────────────────────
		/**
		 * Lihat profil publik milik user lain.
		 * Membutuhkan autentikasi (login). Tidak menampilkan passwordHash.
		 */
		getById: {
			rest: "GET /:id",
			auth: "required",
			params: {
				id: "string"
			},
			async handler(ctx) {
				const { id } = ctx.params;

				const user = await this.prisma.user.findUnique({ where: { id } });
				if (!user) {
					throw new MoleculerError("Not Found", 404, "ERR_NOT_FOUND");
				}

				this.logger.debug(`[users] User ${ctx.meta.user.id} viewed profile of user=${id}`);
				return {
					message: "OK",
					code: 200,
					type: "SUCCESS",
					data: this._sanitizeUser(user)
				};
			}
		},

		// ─── GET /users ──────────────────────────────────────────────────────
		/**
		 * List semua user yang terdaftar.
		 * Hanya bisa diakses oleh user dengan role "admin" di level global.
		 * Mendukung filter ?search= dan pagination ?page=&limit=
		 */
		list: {
			rest: "GET /",
			auth: "required",
			params: {
				search: { type: "string", optional: true },
				page: { type: "number", integer: true, min: 1, default: 1, optional: true },
				limit: {
					type: "number",
					integer: true,
					min: 1,
					max: 100,
					default: 20,
					optional: true
				}
			},
			async handler(ctx) {
				// Hanya user dengan role 'admin' di JWT payload yang bisa mengakses list
				// Security: gunakan pesan generic "Forbidden" tanpa detail role
				const requestingUser = ctx.meta.user;
				if (requestingUser.role !== "admin") {
					throw new MoleculerError("Forbidden", 403, "ERR_FORBIDDEN");
				}

				const { search, page = 1, limit = 20 } = ctx.params;
				const skip = (page - 1) * limit;

				// Bangun filter search
				const where = search
					? {
							OR: [
								{ name: { contains: search, mode: "insensitive" } },
								{ email: { contains: search, mode: "insensitive" } }
							]
						}
					: {};

				const [users, total] = await Promise.all([
					this.prisma.user.findMany({
						where,
						skip,
						take: limit,
						orderBy: { createdAt: "desc" },
						select: {
							id: true,
							name: true,
							email: true,
							createdAt: true,
							updatedAt: true
						}
					}),
					this.prisma.user.count({ where })
				]);

				this.logger.info(
					`[users] Admin ${requestingUser.id} listed users — total=${total}`
				);

				return {
					message: "OK",
					code: 200,
					type: "SUCCESS",
					data: {
						list: users,
						pagination: {
							page,
							limit,
							total,
							totalPages: Math.ceil(total / limit)
						}
					}
				};
			}
		},

		// ─── Internal: resolve user by ID (dipanggil service lain) ──────────
		/**
		 * Action internal untuk mengambil data user berdasarkan ID.
		 * Digunakan oleh service lain (misal: tasks.service saat menampilkan assignee).
		 * Visibility: public agar bisa di-call antar service.
		 */
		resolve: {
			visibility: "public",
			cache: {
				ttl: 60,
				keys: ["id"]
			},
			params: {
				id: "string"
			},
			async handler(ctx) {
				const { id } = ctx.params;
				const user = await this.prisma.user.findUnique({
					where: { id },
					select: { id: true, name: true, email: true }
				});
				return user || null;
			}
		}
	},

	/**
	 * Private Methods
	 */
	methods: {
		/**
		 * Hapus field sensitif sebelum dikembalikan ke client.
		 * @param {Object} user - raw Prisma user object
		 * @returns {Object} safe user object tanpa passwordHash
		 */
		_sanitizeUser(user) {
			const { passwordHash, ...safeUser } = user;
			return safeUser;
		}
	},

	/**
	 * Service Lifecycle
	 */
	async started() {
		// Prisma dikoneksikan otomatis oleh prisma.mixin
		this.logger.info("✅ users.service started — PostgreSQL (Prisma) ready");
	}
};
