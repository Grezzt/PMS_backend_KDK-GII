"use strict";

const jwt = require("jsonwebtoken");
const { MoleculerError } = require("moleculer").Errors;

// Note: Please run `npm install jsonwebtoken bcryptjs` for real implementation
// const bcrypt = require("bcryptjs");

const JWT_SECRET = process.env.JWT_SECRET || "my-super-secret-key-12345";

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 */

/** @type {ServiceSchema} */
module.exports = {
	name: "auth",

	// Moleculer features:
	// - Enable actions to be restricted or publicly accessible
	// - Caching: We will cache the verifyToken action so we don't spam verification for same tokens
	settings: {
		// Empty settings for now
	},

	/**
	 * Service dependencies
	 */
	dependencies: [],

	/**
	 * Actions
	 */
	actions: {
		/**
		 * Login action
		 * Returns a JWT token and user info if credentials are valid.
		 */
		login: {
			rest: "POST /login",
			// Built-in validation provided by Moleculer parameter validator
			params: {
				username: "string",
				password: "string|min:6"
			},
			async handler(ctx) {
				const { username, password } = ctx.params;

				this.logger.info(`Login attempt for username: ${username}`);

				// Mock Database Check (Replace with your DB logic)
				// e.g., const user = await ctx.call("users.findByUsername", { username });
				const mockUser = {
					id: 1,
					username: "admin",
					role: "admin",
					// bcrypt.hashSync("password123", 10)
					passwordHash: "$2a$10$X05w/RkHw/j2o2vRToH6UOkvY2G5D.sQYtQZ/kI/E6c6O9f2wG6u2"
				};

				if (username !== mockUser.username) {
					this.logger.warn(`Login failed: Username not found - ${username}`);
					throw new MoleculerError(
						"Invalid username or password",
						401,
						"ERR_INVALID_CREDS"
					);
				}

				// Mock Password Check
				// const isMatch = await bcrypt.compare(password, mockUser.passwordHash);
				const isMatch = password === "password123";

				if (!isMatch) {
					this.logger.warn(`Login failed: Incorrect password for ${username}`);
					throw new MoleculerError(
						"Invalid username or password",
						401,
						"ERR_INVALID_CREDS"
					);
				}

				// Generate JWT Token
				const tokenPayload = {
					id: mockUser.id,
					username: mockUser.username,
					role: mockUser.role
				};

				const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "1h" });

				// Log successful login
				this.logger.info(`Successful login for user: ${username} (ID: ${mockUser.id})`);

				// Emit Moleculer Event (can be caught by analytics or notification service)
				this.broker.emit("auth.user.login", {
					userId: mockUser.id,
					username: mockUser.username
				});

				return {
					token
				};
			}
		},

		/**
		 * Register new user
		 */
		register: {
			rest: "POST /register",
			params: {
				username: "string|min:3",
				password: "string|min:6",
				email: "email"
			},
			async handler(ctx) {
				const { username, email } = ctx.params;

				// Simulate user creation logic...
				this.logger.info(`Registering new user: ${username}, ${email}`);

				// Broadcast event that a new user is created
				// Useful to send welcome emails in another service
				ctx.broadcast("user.created", { username, email });

				return {
					message: "User registered successfully",
					username,
					email
				};
			}
		},

		/**
		 * Verify JWT Token
		 * Used mainly by API Gateway (api.service.js) in the \`authenticate\` method.
		 */
		verifyToken: {
			cache: {
				// Cache verification results for 60 seconds to improve performance on burst requests
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
					// Returning the payload which will be attached to ctx.meta.user
					return decoded;
				} catch (err) {
					// Invalid token
					this.logger.warn("Token verification failed:", err.message);
					throw new MoleculerError("Invalid Token", 401, "ERR_INVALID_TOKEN");
				}
			}
		},

		/**
		 * Example of a protected route using Moleculer's meta data
		 */
		me: {
			rest: "GET /me",
			// Declare that this action requires authentication
			auth: "required",
			handler(ctx) {
				// ctx.meta.user is populated by API Gateway's authenticate()
				return {
					message: "This is a protected route",
					user: ctx.meta.user
				};
			}
		}
	}
};
