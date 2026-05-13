"use strict";

const { MoleculerError } = require("moleculer").Errors;
const AuthMixin = require("../mixins/auth.mixin");
const PrismaMixin = require("../mixins/prisma.mixin");

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 * @typedef {import('moleculer').Context} Context
 */

/**
 * Workspaces Service
 * ------------------
 * Prisma-backed workspace/project access control, aligned with ERD.
 * Uses AuthMixin for contextual authorization and JWT (via api.service).
 *
 * @type {ServiceSchema}
 */
module.exports = {
	name: "workspaces",

	// Prisma for DB, AuthMixin for role-based access
	mixins: [PrismaMixin, AuthMixin],

	settings: {
		fields: ["id", "name", "description", "ownerId", "createdAt", "updatedAt"]
	},

	actions: {
		// -----------------------------------------------------------------------
		// LIST WORKSPACES (user-owned or member)
		// -----------------------------------------------------------------------
		list: {
			rest: "GET /",
			auth: "required",
			params: {
				page: { type: "number", integer: true, min: 1, default: 1, optional: true },
				limit: { type: "number", integer: true, min: 1, max: 100, default: 20, optional: true }
			},
			async handler(ctx) {
				const userId = ctx.meta.user.id;
				const { page = 1, limit = 20 } = ctx.params;
				const skip = (page - 1) * limit;

				const where = {
					OR: [{ ownerId: userId }, { members: { some: { userId } } }]
				};

				const [workspaces, total] = await Promise.all([
					this.prisma.workspace.findMany({
						where,
						skip,
						take: limit,
						orderBy: { createdAt: "desc" }
					}),
					this.prisma.workspace.count({ where })
				]);

				return {
					message: "OK",
					code: 200,
					type: "SUCCESS",
					data: {
						list: workspaces,
						pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
					}
				};
			}
		},

		// -----------------------------------------------------------------------
		// GET A SINGLE WORKSPACE
		// -----------------------------------------------------------------------
		get: {
			rest: "GET /:id",
			auth: "required",
			params: { id: "string" },
			async handler(ctx) {
				const { id } = ctx.params;
				await this.checkWorkspaceAccess(ctx, id, "viewer");
				const ws = await this.prisma.workspace.findUnique({ where: { id } });
				if (!ws) throw new MoleculerError("Not Found", 404, "ERR_NOT_FOUND");

				return {
					message: "OK",
					code: 200,
					type: "SUCCESS",
					data: ws
				};
			}
		},

		// -----------------------------------------------------------------------
		// CREATE A WORKSPACE
		// -----------------------------------------------------------------------
		create: {
			rest: "POST /",
			auth: "required",
			params: {
				name: "string",
				description: { type: "string", optional: true },
				members: {
					type: "array",
					optional: true,
					items: {
						type: "object",
						props: {
							userId: "string",
							role: {
								type: "enum",
								values: ["admin", "member", "viewer"],
								optional: true
							}
						}
					}
				}
			},
			async handler(ctx) {
				const { name, description, members } = ctx.params;
				const userId = ctx.meta.user.id;
				const memberRows = this._normalizeMembers(members);

				if (memberRows.length > 0) {
					const memberIds = memberRows.map(row => row.userId);
					const existingUsers = await this.prisma.user.findMany({
						where: { id: { in: memberIds } },
						select: { id: true }
					});
					const existingIds = new Set(existingUsers.map(user => user.id));
					const missingUserIds = memberIds.filter(id => !existingIds.has(id));

					if (missingUserIds.length > 0) {
						throw new MoleculerError(
							"Unprocessable Entity",
							422,
							"ERR_UNPROCESSABLE_ENTITY",
							{ missingUserIds }
						);
					}
				}

				const workspace = await this.prisma.workspace.create({
					data: {
						name,
						description: description || null,
						ownerId: userId
					}
				});

				if (memberRows.length > 0) {
					await this.prisma.workspaceMember.createMany({
						data: memberRows.map(row => ({
							workspaceId: workspace.id,
							userId: row.userId,
							role: row.role
						})),
						skipDuplicates: true
					});
				}

				await this.prisma.workspaceMember.upsert({
					where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
					create: {
						workspaceId: workspace.id,
						userId,
						role: "ADMIN"
					},
					update: { role: "ADMIN" }
				});

				this.logger.info(`[workspaces] Created workspace "${name}" by user=${userId}`);

				ctx.meta.$statusCode = 201;
				return {
					message: "Created",
					code: 201,
					type: "CREATED",
					data: workspace
				};
			}
		},

		// -----------------------------------------------------------------------
		// UPDATE A WORKSPACE
		// -----------------------------------------------------------------------
		update: {
			rest: "PATCH /:id",
			auth: "required",
			params: {
				id: "string",
				name: { type: "string", optional: true },
				description: { type: "string", optional: true }
			},
			async handler(ctx) {
				const { id, name, description } = ctx.params;
				if (name === undefined && description === undefined) {
					throw new MoleculerError(
						"Unprocessable Entity",
						422,
						"ERR_UNPROCESSABLE_ENTITY"
					);
				}
				await this.checkWorkspaceAccess(ctx, id, "admin");

				const existing = await this.prisma.workspace.findUnique({ where: { id } });
				if (!existing) {
					throw new MoleculerError("Not Found", 404, "ERR_NOT_FOUND");
				}

				const workspace = await this.prisma.workspace.update({
					where: { id },
					data: {
						name,
						description
					}
				});

				this.logger.info(`[workspaces] User=${ctx.meta.user.id} updated workspace=${id}`);
				return {
					message: "OK",
					code: 200,
					type: "SUCCESS",
					data: workspace
				};
			}
		},

		// -----------------------------------------------------------------------
		// DELETE A WORKSPACE
		// -----------------------------------------------------------------------
		remove: {
			rest: "DELETE /:id",
			auth: "required",
			params: { id: "string" },
			async handler(ctx) {
				const { id } = ctx.params;
				await this.checkWorkspaceAccess(ctx, id, "admin");
				const existing = await this.prisma.workspace.findUnique({ where: { id } });
				if (!existing) {
					throw new MoleculerError("Not Found", 404, "ERR_NOT_FOUND");
				}
				await this.prisma.workspace.delete({ where: { id } });
				this.logger.info(
					`[workspaces] Workspace=${id} deleted by user=${ctx.meta.user.id}`
				);

				ctx.meta.$statusCode = 204;
				return null;
			}
		},

		// -----------------------------------------------------------------------
		// CORE AUTHORIZATION ACTION — called by auth.mixin.js
		// -----------------------------------------------------------------------
		/**
		 * Resolve the effective role of a user for a project OR workspace.
		 *
		 * Params (at least one of projectId / workspaceId required):
		 *   userId      {string} — required
		 *   projectId   {string} — resolve effective role for this project
		 *   workspaceId {string} — resolve role for this workspace directly
		 *
		 * Returns: { role: "admin"|"member"|"viewer" } or { role: null }
		 */
		getMemberRole: {
			visibility: "public",
			cache: {
				ttl: 30,
				keys: ["userId", "projectId", "workspaceId"]
			},
			params: {
				userId: "string",
				projectId: { type: "string", optional: true },
				workspaceId: { type: "string", optional: true }
			},
			async handler(ctx) {
				const { userId, projectId, workspaceId } = ctx.params;

				if (projectId) {
					// Step 1: project_members override
					const projectMember = await this.prisma.projectMember.findUnique({
						where: { projectId_userId: { projectId, userId } }
					});
					if (projectMember) {
						return { role: this._normalizeRole(projectMember.role) };
					}

					// Step 2: project leader gets admin role
					const project = await this.prisma.project.findUnique({
						where: { id: projectId },
						select: { leaderId: true, workspaceId: true }
					});
					if (!project) return { role: null };
					if (project.leaderId === userId) return { role: "admin" };

					// Step 3: workspace owner gets admin role
					const workspace = await this.prisma.workspace.findUnique({
						where: { id: project.workspaceId },
						select: { ownerId: true }
					});
					if (workspace?.ownerId === userId) return { role: "admin" };

					// Step 4: fallback to workspace_members
					const wsMember = await this.prisma.workspaceMember.findUnique({
						where: { workspaceId_userId: { workspaceId: project.workspaceId, userId } }
					});

					return { role: wsMember ? this._normalizeRole(wsMember.role) : null };
				}

				if (workspaceId) {
					const workspace = await this.prisma.workspace.findUnique({
						where: { id: workspaceId },
						select: { ownerId: true }
					});
					if (workspace?.ownerId === userId) return { role: "admin" };

					const wsMember = await this.prisma.workspaceMember.findUnique({
						where: { workspaceId_userId: { workspaceId, userId } }
					});

					return { role: wsMember ? this._normalizeRole(wsMember.role) : null };
				}

				throw new MoleculerError(
					"Bad Request",
					400,
					"ERR_BAD_REQUEST"
				);
			}
		},

		// -----------------------------------------------------------------------
		// LIST WORKSPACE MEMBERS
		// -----------------------------------------------------------------------
		listMembers: {
			rest: "GET /:workspaceId/members",
			auth: "required",
			params: {
				workspaceId: "string",
				page: { type: "number", integer: true, min: 1, default: 1, optional: true },
				limit: { type: "number", integer: true, min: 1, max: 100, default: 20, optional: true }
			},
			async handler(ctx) {
				const { workspaceId, page = 1, limit = 20 } = ctx.params;
				const skip = (page - 1) * limit;
				await this.checkWorkspaceAccess(ctx, workspaceId, "viewer");

				const workspace = await this.prisma.workspace.findUnique({
					where: { id: workspaceId },
					select: {
						ownerId: true,
						owner: { select: { id: true, name: true, email: true } }
					}
				});
				if (!workspace)
					throw new MoleculerError("Not Found", 404, "ERR_NOT_FOUND");

				const [members, totalMembers] = await Promise.all([
					this.prisma.workspaceMember.findMany({
						where: { workspaceId },
						include: { user: { select: { id: true, name: true, email: true } } },
						orderBy: { joinedAt: "asc" },
						skip,
						take: limit
					}),
					this.prisma.workspaceMember.count({ where: { workspaceId } })
				]);

				const ownerEntry = {
					userId: workspace.ownerId,
					role: "admin",
					isOwner: true,
					user: workspace.owner
				};

				const memberList = members
					.filter(m => m.userId !== workspace.ownerId)
					.map(m => ({
						userId: m.userId,
						role: this._normalizeRole(m.role),
						isOwner: false,
						user: m.user
					}));

				const list = [ownerEntry, ...memberList];
				// total termasuk owner (selalu ada)
				const total = totalMembers + 1;

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
		// MEMBER MANAGEMENT — workspace membership
		// -----------------------------------------------------------------------
		addWorkspaceMember: {
			rest: "POST /:workspaceId/members",
			auth: "required",
			params: {
				workspaceId: "string",
				userId: "string",
				role: { type: "enum", values: ["admin", "member", "viewer"], default: "member" }
			},
			async handler(ctx) {
				const { workspaceId, userId, role } = ctx.params;
				await this.checkWorkspaceAccess(ctx, workspaceId, "admin");

				const user = await this.prisma.user.findUnique({
					where: { id: userId },
					select: { id: true }
				});
				if (!user) {
					throw new MoleculerError("Not Found", 404, "ERR_NOT_FOUND");
				}

				const member = await this.prisma.workspaceMember.upsert({
					where: { workspaceId_userId: { workspaceId, userId } },
					create: {
						workspaceId,
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
		_normalizeMembers(members) {
			if (!Array.isArray(members)) return [];
			const unique = new Map();
			for (const item of members) {
				if (!item || !item.userId) continue;
				unique.set(item.userId, {
					userId: item.userId,
					role: this._normalizeRole(item.role || "member", { toEnum: true })
				});
			}
			return Array.from(unique.values());
		},
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
		}
	}
};
