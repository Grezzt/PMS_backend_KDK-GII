"use strict";

const { MoleculerError } = require("moleculer").Errors;
const AuthMixin = require("../mixins/auth.mixin");
const PrismaMixin = require("../mixins/prisma.mixin");

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 * @typedef {import('moleculer').Context} Context
 */

/**
 * Projects Service
 * ----------------
 * Prisma-backed CRUD for projects, separated from workspaces service.
 * Uses AuthMixin for contextual authorization via workspaces.getMemberRole.
 *
 * @type {ServiceSchema}
 */
module.exports = {
	name: "projects",

	// Prisma for DB, AuthMixin for role-based access
	mixins: [PrismaMixin, AuthMixin],

	settings: {
		fields: [
			"id",
			"workspaceId",
			"name",
			"description",
			"visibility",
			"statusConfig",
			"leaderId",
			"createdAt",
			"updatedAt"
		]
	},

	actions: {
		// -----------------------------------------------------------------------
		// LIST projects
		// -----------------------------------------------------------------------
		list: {
			rest: "GET /",
			auth: "required",
			params: {
				workspaceId: { type: "string", optional: true }
			},
			async handler(ctx) {
				const { workspaceId } = ctx.params;

				if (workspaceId) {
					await this.checkWorkspaceAccess(ctx, workspaceId, "viewer");
					return this.prisma.project.findMany({
						where: { workspaceId },
						orderBy: { createdAt: "desc" }
					});
				}

				return this.prisma.project.findMany({
					where: {
						OR: [
							{ leaderId: ctx.meta.user.id },
							{ members: { some: { userId: ctx.meta.user.id } } }
						]
					},
					orderBy: { createdAt: "desc" }
				});
			}
		},

		// -----------------------------------------------------------------------
		// GET a single project
		// -----------------------------------------------------------------------
		get: {
			rest: "GET /:id",
			auth: "required",
			params: { id: "string" },
			async handler(ctx) {
				const { id } = ctx.params;
				await this.checkProjectAccess(ctx, id, "viewer");
				const project = await this.prisma.project.findUnique({ where: { id } });
				if (!project) throw new MoleculerError("Project not found", 404, "ERR_NOT_FOUND");
				return project;
			}
		},

		// -----------------------------------------------------------------------
		// CREATE a new project
		// -----------------------------------------------------------------------
		create: {
			rest: "POST /",
			auth: "required",
			params: {
				workspaceId: "string",
				name: "string",
				description: { type: "string", optional: true },
				visibility: { type: "enum", values: ["public", "private"], optional: true },
				statusConfig: { type: "object", optional: true }
			},
			async handler(ctx) {
				const { workspaceId, name, description, visibility, statusConfig } = ctx.params;
				await this.checkWorkspaceAccess(ctx, workspaceId, "member");

				const project = await this.prisma.project.create({
					data: {
						workspaceId,
						name,
						description: description || null,
						leaderId: ctx.meta.user.id,
						visibility: this._normalizeVisibility(visibility),
						statusConfig: statusConfig || undefined
					}
				});

				this.logger.info(
					`[projects] Created project "${name}" by user=${ctx.meta.user.id}`
				);
				return project;
			}
		},

		// -----------------------------------------------------------------------
		// UPDATE a project
		// -----------------------------------------------------------------------
		update: {
			rest: "PATCH /:id",
			auth: "required",
			params: {
				id: "string",
				name: { type: "string", optional: true },
				description: { type: "string", optional: true },
				visibility: { type: "enum", values: ["public", "private"], optional: true },
				statusConfig: { type: "object", optional: true }
			},
			async handler(ctx) {
				const { id, name, description, visibility, statusConfig } = ctx.params;
				await this.checkProjectAccess(ctx, id, "member");

				const project = await this.prisma.project.update({
					where: { id },
					data: {
						name,
						description,
						visibility: visibility ? this._normalizeVisibility(visibility) : undefined,
						statusConfig
					}
				});

				this.logger.info(`[projects] User=${ctx.meta.user.id} updated project=${id}`);
				return project;
			}
		},

		// -----------------------------------------------------------------------
		// DELETE a project
		// -----------------------------------------------------------------------
		delete: {
			rest: "DELETE /:id",
			auth: "required",
			params: { id: "string" },
			async handler(ctx) {
				const { id } = ctx.params;
				await this.checkProjectAccess(ctx, id, "admin");
				const project = await this.prisma.project.delete({ where: { id } });
				this.logger.info(`[projects] Project=${id} deleted by user=${ctx.meta.user.id}`);
				return { deleted: true, project };
			}
		},

		// -----------------------------------------------------------------------
		// MEMBER MANAGEMENT — project membership override
		// -----------------------------------------------------------------------
		addMember: {
			rest: "POST /:projectId/members",
			auth: "required",
			params: {
				projectId: "string",
				userId: "string",
				role: { type: "enum", values: ["admin", "member", "viewer"], default: "member" }
			},
			async handler(ctx) {
				const { projectId, userId, role } = ctx.params;
				await this.checkProjectAccess(ctx, projectId, "admin");

				return this.prisma.projectMember.upsert({
					where: { projectId_userId: { projectId, userId } },
					create: {
						projectId,
						userId,
						role: this._normalizeRole(role, { toEnum: true })
					},
					update: { role: this._normalizeRole(role, { toEnum: true }) }
				});
			}
		}
	},

	methods: {
		_normalizeRole(role, options = {}) {
			if (!role) return null;
			const lower = String(role).toLowerCase();
			if (!options.toEnum) return lower;
			switch (lower) {
				case "admin":
					return "ADMIN";
				case "viewer":
					return "VIEWER";
				default:
					return "MEMBER";
			}
		},
		_normalizeVisibility(value) {
			if (!value) return undefined;
			return String(value).toLowerCase() === "public" ? "PUBLIC" : "PRIVATE";
		}
	}
};
