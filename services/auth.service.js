"use strict";

require("dotenv").config();

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { MoleculerError } = require("moleculer").Errors;
const { PrismaClient } = require("@prisma/client");
const { getCollection } = require("../mongodb/connection");

// ─── Singleton Prisma ────────────────────────────────────────────────────────
const prisma = new PrismaClient();

// ─── Constants ───────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-minimum-32-chars-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";
const REFRESH_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || "7", 10);

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 */

/** @type {ServiceSchema} */
module.exports = {
	name: "auth",

	settings: {},
	dependencies: [],

	/**
	 * Actions
	 */
	actions: {
		// ─── POST /auth/login ────────────────────────────────────────────────
		login: {
			rest: "POST /login",
			params: {
				email: "email",
				password: "string|min:6"
			},
			async handler(ctx) {
				const { email, password } = ctx.params;

				this.logger.info(`Login attempt: ${email}`);

				// 1. Cari user di PostgreSQL via Prisma
				const user = await prisma.user.findUnique({ where: { email } });
				if (!user) {
					throw new MoleculerError("Invalid email or password", 401, "ERR_INVALID_CREDS");
				}

				// 2. Verifikasi password
				const isMatch = await bcrypt.compare(password, user.passwordHash);
				if (!isMatch) {
					throw new MoleculerError("Invalid email or password", 401, "ERR_INVALID_CREDS");
				}

				// 3. Generate Access Token
				const accessToken = this._signAccessToken(user);

				// 4. Generate Refresh Token & simpan ke MongoDB
				const refreshToken = crypto.randomBytes(64).toString("hex");
				await this._saveRefreshToken(user.id, refreshToken);

				this.logger.info(`Login berhasil: ${email} (ID: ${user.id})`);
				this.broker.emit("auth.user.login", { userId: user.id, email: user.email });

				return {
					accessToken,
					refreshToken,
					expiresIn: JWT_EXPIRES_IN
				};
			}
		},

		// ─── POST /auth/register ─────────────────────────────────────────────
		register: {
			rest: "POST /register",
			params: {
				name: "string|min:2|max:100",
				email: "email",
				password: "string|min:6"
			},
			async handler(ctx) {
				const { name, email, password } = ctx.params;

				this.logger.info(`Register: ${email}`);

				// 1. Cek email sudah ada
				const existing = await prisma.user.findUnique({ where: { email } });
				if (existing) {
					throw new MoleculerError("Email already registered", 409, "ERR_EMAIL_EXISTS");
				}

				// 2. Hash password
				const passwordHash = await bcrypt.hash(password, 12);

				// 3. Buat user di PostgreSQL
				const user = await prisma.user.create({
					data: { name, email, passwordHash }
				});

				this.logger.info(`User baru: ${email} (ID: ${user.id})`);
				ctx.broadcast("user.created", { userId: user.id, name, email });

				return {
					message: "Registrasi berhasil",
					user: this._sanitizeUser(user)
				};
			}
		},

		// ─── GET /auth/me ────────────────────────────────────────────────────
		me: {
			rest: "GET /me",
			auth: "required",
			async handler(ctx) {
				const { id } = ctx.meta.user;

				const user = await prisma.user.findUnique({ where: { id } });
				if (!user) {
					throw new MoleculerError("User not found", 404, "ERR_USER_NOT_FOUND");
				}

				return { user: this._sanitizeUser(user) };
			}
		},

		// ─── POST /auth/refresh ──────────────────────────────────────────────
		refresh: {
			rest: "POST /refresh",
			params: {
				refreshToken: "string"
			},
			async handler(ctx) {
				const { refreshToken } = ctx.params;

				// 1. Cari token di MongoDB
				const tokenDoc = await this._findRefreshToken(refreshToken);

				if (!tokenDoc) {
					throw new MoleculerError(
						"Invalid refresh token",
						401,
						"ERR_INVALID_REFRESH_TOKEN"
					);
				}

				if (tokenDoc.is_revoked) {
					throw new MoleculerError(
						"Refresh token has been revoked",
						401,
						"ERR_TOKEN_REVOKED"
					);
				}

				if (new Date() > tokenDoc.expires_at) {
					throw new MoleculerError("Refresh token expired", 401, "ERR_TOKEN_EXPIRED");
				}

				// 2. Ambil user dari PostgreSQL
				const user = await prisma.user.findUnique({ where: { id: tokenDoc.user_id } });
				if (!user) {
					throw new MoleculerError("User not found", 404, "ERR_USER_NOT_FOUND");
				}

				// 3. Generate Access Token baru
				const accessToken = this._signAccessToken(user);

				this.logger.info(`Access token di-refresh untuk user: ${user.email}`);

				return {
					accessToken,
					expiresIn: JWT_EXPIRES_IN
					// user: this._sanitizeUser(user)
				};
			}
		},

		// ─── POST /auth/logout ───────────────────────────────────────────────
		logout: {
			rest: "POST /logout",
			params: {
				refreshToken: "string"
			},
			async handler(ctx) {
				const { refreshToken } = ctx.params;

				// Set is_revoked = true di MongoDB
				const collection = await getCollection("user_tokens");
				const result = await collection.updateOne(
					{ refresh_token: refreshToken },
					{ $set: { is_revoked: true } }
				);

				if (result.matchedCount === 0) {
					throw new MoleculerError("Refresh token not found", 404, "ERR_TOKEN_NOT_FOUND");
				}

				this.logger.info("Logout berhasil — token di-revoke");
				return { message: "Logout berhasil" };
			}
		},

		// ─── verifyToken (internal, digunakan api.service) ──────────────────
		verifyToken: {
			cache: {
				ttl: 60,
				keys: ["token"]
			},
			params: {
				token: "string"
			},
			handler(ctx) {
				const { token } = ctx.params;

				try {
					const decoded = jwt.verify(token, JWT_SECRET);
					return decoded;
				} catch (err) {
					this.logger.warn("Token verification failed:", err.message);
					throw new MoleculerError("Invalid token", 401, "ERR_INVALID_TOKEN");
				}
			}
		}
	},

	/**
	 * Private Methods
	 */
	methods: {
		/** Generate JWT Access Token */
		_signAccessToken(user) {
			return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, {
				expiresIn: JWT_EXPIRES_IN
			});
		},

		/** Hapus field sensitif dari user object */
		_sanitizeUser(user) {
			const { passwordHash, ...safeUser } = user;
			return safeUser;
		},

		/** Simpan refresh token baru ke MongoDB user_tokens */
		async _saveRefreshToken(userId, refreshToken) {
			const collection = await getCollection("user_tokens");
			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_DAYS);

			await collection.insertOne({
				user_id: userId,
				refresh_token: refreshToken,
				expires_at: expiresAt,
				is_revoked: false,
				created_at: new Date()
			});
		},

		/** Cari refresh token di MongoDB */
		async _findRefreshToken(refreshToken) {
			const collection = await getCollection("user_tokens");
			return collection.findOne({ refresh_token: refreshToken });
		}
	},

	/**
	 * Service lifecycle
	 */
	async started() {
		this.logger.info("✅ auth.service started — PostgreSQL + MongoDB ready");
	},

	async stopped() {
		await prisma.$disconnect();
		this.logger.info("auth.service stopped — Prisma disconnected");
	}
};
