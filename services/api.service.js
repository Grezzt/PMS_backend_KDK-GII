"use strict";

const ApiGateway = require("moleculer-web");

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema Moleculer's Service Schema
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 * @typedef {import('http').IncomingMessage} IncomingRequest Incoming HTTP Request
 * @typedef {import('http').ServerResponse} ServerResponse HTTP Server Response
 * @typedef {import('moleculer-web').ApiSettingsSchema} ApiSettingsSchema API Setting Schema
 */

/** @type {ServiceSchema} */
module.exports = {
	name: "api",

	/**
	 * Mixins. More info: https://moleculer.services/docs/0.15/services.html#Mixins
	 */
	mixins: [ApiGateway],

	/** @type {ApiSettingsSchema} More info: https://moleculer.services/docs/0.15/moleculer-web.html */
	settings: {
		// Exposed port
		port: process.env.PORT || 3000,

		// Exposed IP
		ip: "0.0.0.0",

		// CORS Config
		cors: {
			origin: "*", // Atau gunakan array url frontend spesifik seperti ["https://domain-frontend.com"]
			methods: ["GET", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"],
			allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
			exposedHeaders: [],
			credentials: true,
			maxAge: 3600
		},

		// Rate Limiting Config
		rateLimit: {
			window: 60 * 1000, // 60 detik (1 menit)
			limit: 20, // 20 request API per menit dari setiap IP
			headers: true, // mengirim header X-RateLimit-*
			key: req => {
				return (
					req.headers["x-forwarded-for"] ||
					req.socket.remoteAddress ||
					req.connection?.remoteAddress
				);
			}
		},

		// Global Express middlewares. More info: https://moleculer.services/docs/0.15/moleculer-web.html#Middlewares
		use: [],

		routes: [
			{
				path: "/api",

				whitelist: ["auth.**", "users.**", "workspaces.**", "projects.**"],

				// Route-level Express middlewares. More info: https://moleculer.services/docs/0.15/moleculer-web.html#Middlewares
				use: [],

				// Enable/disable parameter merging method. More info: https://moleculer.services/docs/0.15/moleculer-web.html#Disable-merging
				mergeParams: true,

				// Enable authentication. Implement the logic into `authenticate` method. More info: https://moleculer.services/docs/0.15/moleculer-web.html#Authentication
				authentication: true,

				// Enable authorization. Implement the logic into `authorize` method. More info: https://moleculer.services/docs/0.15/moleculer-web.html#Authorization
				authorization: true,

				// The auto-alias feature allows you to declare your route alias directly in your services.
				// The gateway will dynamically build the full routes from service schema.
				autoAliases: true,

				aliases: {
					// Tambahkan custom aliases jika autoAliases tidak cukup
				},

				/**
				 * Before call hook. You can check the request.
				 * @param {Context} ctx
				 * @param {Object} route
				 * @param {IncomingRequest} req
				 * @param {ServerResponse} res
				 * @param {Object} data
				 *
				onBeforeCall(ctx, route, req, res) {
					// Set request headers to context meta
					ctx.meta.userAgent = req.headers["user-agent"];
				}, */

				/**
				 * After call hook. You can modify the data.
				 * @param {Context} ctx
				 * @param {Object} route
				 * @param {IncomingRequest} req
				 * @param {ServerResponse} res
				 * @param {Object} data
				onAfterCall(ctx, route, req, res, data) {
					// Async function which return with Promise
					return doSomething(ctx, res, data);
				}, */

				// Calling options. More info: https://moleculer.services/docs/0.15/moleculer-web.html#Calling-options
				callOptions: {},

				bodyParsers: {
					json: {
						strict: false,
						limit: "1MB"
					},
					urlencoded: {
						extended: true,
						limit: "1MB"
					}
				},

				// Mapping policy setting. More info: https://moleculer.services/docs/0.15/moleculer-web.html#Mapping-policy
				mappingPolicy: "all", // Available values: "all", "restrict"

				// Enable/disable logging
				logging: true
			}
		],

		// Do not log client side errors (does not log an error response when the error.code is 400<=X<500)
		log4XXResponses: false,
		// Logging the request parameters. Set to any log level to enable it. E.g. "info"
		logRequestParams: null,
		// Logging the response data. Set to any log level to enable it. E.g. "info"
		logResponseData: null,

		// Serve assets from "public" folder. More info: https://moleculer.services/docs/0.15/moleculer-web.html#Serve-static-files
		assets: {
			folder: "public",

			// Options to `server-static` module
			options: {}
		}

		/** @type {import('moleculer-io').IOSetting} */
		// io: {},
	},

	/**
	 * Methods. More info: https://moleculer.services/docs/0.15/services.html#Methods
	 */
	methods: {
		/**
		 * Authenticate the request. It check the `Authorization` token value in the request header.
		 * Check the token value & resolve the user by the token.
		 * The resolved user will be available in `ctx.meta.user`
		 *
		 * PLEASE NOTE, IT'S JUST AN EXAMPLE IMPLEMENTATION. DO NOT USE IN PRODUCTION!
		 *
		 * @param {Context} ctx
		 * @param {Object} route
		 * @param {IncomingRequest} req
		 * @returns {Promise}
		 */
		async authenticate(ctx, route, req) {
			// Read the token from header
			const auth = req.headers["authorization"];

			if (auth && auth.startsWith("Bearer ")) {
				const token = auth.slice(7);

				try {
					// Verify the token by calling the `auth` service
					const user = await ctx.call("auth.verifyToken", { token });
					this.logger.info(`Authenticated user: ${user.email} (ID: ${user.id})`);

					// Return the user object, which will be accessible via \`ctx.meta.user\` in subsequent actions
					return user;
				} catch (err) {
					this.logger.warn("Invalid token received.", err.message);
					throw new ApiGateway.Errors.UnAuthorizedError(
						ApiGateway.Errors.ERR_INVALID_TOKEN
					);
				}
			} else {
				// No token. Return null means guest user.
				return null;
			}
		},

		/**
		 * Authorize the request. Check that the authenticated user has right to access the resource.
		 *
		 * @param {Context} ctx
		 * @param {Object} route
		 * @param {IncomingRequest} req
		 * @returns {Promise}
		 */
		async authorize(ctx, route, req) {
			const user = ctx.meta.user;

			// If the endpoint requires authentication ('auth: "required"' property in action schema)
			if (req.$action.auth === "required" && !user) {
				this.logger.warn("Unauthenticated access attempt blocked");
				throw new ApiGateway.Errors.UnAuthorizedError("NO_RIGHTS");
			}

			// Optional: Role-based Authorization check
			if (req.$action.roles && Array.isArray(req.$action.roles)) {
				if (
					!user ||
					(!req.$action.roles.includes(user.role) &&
						!req.$action.roles.includes("test-allowed-role"))
				) {
					this.logger.warn(
						`User ${user ? user.id : "Guest"} attempted to access ${req.$action.name} without required role`
					);
					throw new ApiGateway.Errors.UnAuthorizedError("INSUFFICIENT_PERMISSIONS");
				}
			}
		}
	}
};
