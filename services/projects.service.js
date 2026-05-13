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
				workspaceId: { type: "string", optional: true },
				page: { type: "number", integer: true, min: 1, default: 1, optional: true },
				limit: { type: "number", integer: true, min: 1, max: 100, default: 20, optional: true }
			},
			async handler(ctx) {
				const { workspaceId, page = 1, limit = 20 } = ctx.params;
				const skip = (page - 1) * limit;

				let where;
				if (workspaceId) {
					await this.checkWorkspaceAccess(ctx, workspaceId, "viewer");
					where = { workspaceId };
				} else {
					where = {
						OR: [
							{ leaderId: ctx.meta.user.id },
							{ members: { some: { userId: ctx.meta.user.id } } }
						]
					};
				}

				const [projects, total] = await Promise.all([
					this.prisma.project.findMany({
						where,
						skip,
						take: limit,
						orderBy: { createdAt: "desc" }
					}),
					this.prisma.project.count({ where })
				]);

				return {
					message: "OK",
					code: 200,
					type: "SUCCESS",
					data: {
						list: projects,
						pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
					}
				};
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
				if (!project) throw new MoleculerError("Not Found", 404, "ERR_NOT_FOUND");

				return {
					message: "OK",
					code: 200,
					type: "SUCCESS",
					data: project
				};
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

				await this.prisma.projectMember.upsert({
					where: {
						projectId_userId: {
							projectId: project.id,
							userId: ctx.meta.user.id
						}
					},
					create: {
						projectId: project.id,
						userId: ctx.meta.user.id,
						role: "ADMIN"
					},
					update: { role: "ADMIN" }
				});

				this.logger.info(
					`[projects] Created project "${name}" by user=${ctx.meta.user.id}`
				);

				ctx.meta.$statusCode = 201;
				return {
					message: "Created",
					code: 201,
					type: "CREATED",
					data: project
				};
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
				return {
					message: "OK",
					code: 200,
					type: "SUCCESS",
					data: project
				};
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
				await this.prisma.project.delete({ where: { id } });
				this.logger.info(`[projects] Project=${id} deleted by user=${ctx.meta.user.id}`);

				ctx.meta.$statusCode = 204;
				return null;
			}
		},

		// -----------------------------------------------------------------------
		// LIST PROJECT MEMBERS
		// -----------------------------------------------------------------------
		listMembers: {
			rest: "GET /:projectId/members",
			auth: "required",
			params: {
				projectId: "string",
				page: { type: "number", integer: true, min: 1, default: 1, optional: true },
				limit: { type: "number", integer: true, min: 1, max: 100, default: 20, optional: true }
			},
			async handler(ctx) {
				const { projectId, page = 1, limit = 20 } = ctx.params;
				const skip = (page - 1) * limit;
				await this.checkProjectAccess(ctx, projectId, "viewer");

				const project = await this.prisma.project.findUnique({
					where: { id: projectId },
					select: {
						leaderId: true,
						leader: { select: { id: true, name: true, email: true } }
					}
				});
				if (!project) throw new MoleculerError("Not Found", 404, "ERR_NOT_FOUND");

				const [members, totalMembers] = await Promise.all([
					this.prisma.projectMember.findMany({
						where: { projectId },
						include: { user: { select: { id: true, name: true, email: true } } },
						orderBy: { joinedAt: "asc" },
						skip,
						take: limit
					}),
					this.prisma.projectMember.count({ where: { projectId } })
				]);

				const leaderEntry = {
					userId: project.leaderId,
					role: "admin",
					isLeader: true,
					user: project.leader
				};

				const memberList = members
					.filter(m => m.userId !== project.leaderId)
					.map(m => ({
						userId: m.userId,
						role: this._normalizeRole(m.role),
						isLeader: false,
						user: m.user
					}));

				const list = [leaderEntry, ...memberList];
				const total = totalMembers + 1; // total termasuk leader

				return {
					message: "OK",
					code: 200,
					type: "SUCCESS",
					data: {
						list,
						pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
					}
				};
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

				const project = await this.prisma.project.findUnique({
					where: { id: projectId },
					select: { workspaceId: true }
				});
				if (!project) {
					throw new MoleculerError("Not Found", 404, "ERR_NOT_FOUND");
				}

				const user = await this.prisma.user.findUnique({
					where: { id: userId },
					select: { id: true }
				});
				if (!user) {
					throw new MoleculerError("Not Found", 404, "ERR_NOT_FOUND");
				}

				const workspace = await this.prisma.workspace.findUnique({
					where: { id: project.workspaceId },
					select: { ownerId: true }
				});
				const isOwner = workspace?.ownerId === userId;
				const workspaceMember = await this.prisma.workspaceMember.findUnique({
					where: {
						workspaceId_userId: {
							workspaceId: project.workspaceId,
							userId
						}
					}
				});

				if (!isOwner && !workspaceMember) {
					throw new MoleculerError(
						"Unprocessable Entity",
						422,
						"ERR_UNPROCESSABLE_ENTITY",
						{ workspaceId: project.workspaceId, userId }
					);
				}

				const member = await this.prisma.projectMember.upsert({
					where: { projectId_userId: { projectId, userId } },
					create: {
						projectId,
						userId,
						role: this._normalizeRole(role, { toEnum: true })
					},
					update: { role: this._normalizeRole(role, { toEnum: true }) }
				});

				ctx.meta.$statusCode = 201;
				return {
					message: "Created",
					code: 201,
					type: "CREATED",
					data: member
				};
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
