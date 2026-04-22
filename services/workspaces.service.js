"use strict";

const path = require("path");
const { MoleculerError } = require("moleculer").Errors;
const AuthMixin = require("../mixins/auth.mixin");

// ---------------------------------------------------------------------------
// Load JSON seed files — used as the in-memory data store for dev/test.
// In production, replace these loads with real DB adapter queries.
// ---------------------------------------------------------------------------
const dbWorkspaces = [];
const dbProjects = [];
const dbWorkspaceMembers = [];
const dbProjectMembers = [];

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 * @typedef {import('moleculer').Context} Context
 */

/**
 * Workspaces Service
 * ------------------
 * Owns all workspace and project membership data.
 * Loaded from JSON seed files (`data/seed/*.json`) for local dev & tests.
 *
 * Key actions:
 *   - getMemberRole       → called by auth.mixin.js to resolve a user's effective role
 *   - addWorkspaceMember  → grant/update a user's workspace role
 *   - addProjectMember    → grant/update a user's project-level role override
 *
 * Role resolution for (userId, projectId):
 *   1. project_members   → project-specific role (HIGHEST PRIORITY)
 *   2. workspace_members → inherited workspace role (FALLBACK)
 *   3. null              → no membership → auth.mixin throws 403
 *
 * @type {ServiceSchema}
 */
module.exports = {
	name: "workspaces",

	// Merge AuthMixin for RBAC checks
	mixins: [AuthMixin],

	settings: {
		fields: ["id", "name", "description", "ownerId"]
	},

	actions: {
		// -----------------------------------------------------------------------
		// LIST WORKSPACES
		// -----------------------------------------------------------------------
		list: {
			rest: "GET /",
			auth: "required",
			handler(ctx) {
				return dbWorkspaces;
			}
		},

		// -----------------------------------------------------------------------
		// GET A SINGLE WORKSPACE
		// -----------------------------------------------------------------------
		get: {
			rest: "GET /:id",
			auth: "required",
			params: { id: "string" },
			handler(ctx) {
				const ws = dbWorkspaces.find(w => w.id === ctx.params.id);
				if (!ws) throw new MoleculerError("Workspace not found", 404, "ERR_NOT_FOUND");
				return ws;
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
			handler(ctx) {
				const { userId, projectId, workspaceId } = ctx.params;

				// ---- Resolve role for a PROJECT ----
				if (projectId) {
					// Step 1: check project_members for a direct override
					const projectOverride = dbProjectMembers.find(
						m => m.projectId === projectId && m.userId === userId
					);
					if (projectOverride) {
						this.logger.debug(
							`[workspaces] Project override — user=${userId} project=${projectId} role=${projectOverride.role}`
						);
						return { role: projectOverride.role };
					}

					// Step 2: fall back to workspace_members via the project's workspaceId
					const project = dbProjects.find(p => p.id === projectId);
					if (!project) {
						this.logger.warn(`[workspaces] Project not found: ${projectId}`);
						return { role: null };
					}

					const wsRole = dbWorkspaceMembers.find(
						m => m.workspaceId === project.workspaceId && m.userId === userId
					);

					if (wsRole) {
						this.logger.debug(
							`[workspaces] Workspace fallback — user=${userId} workspace=${project.workspaceId} role=${wsRole.role}`
						);
					}

					return { role: wsRole ? wsRole.role : null };
				}

				// ---- Resolve role for a WORKSPACE ----
				if (workspaceId) {
					const wsRole = dbWorkspaceMembers.find(
						m => m.workspaceId === workspaceId && m.userId === userId
					);
					return { role: wsRole ? wsRole.role : null };
				}

				throw new MoleculerError(
					"Either projectId or workspaceId must be provided",
					400,
					"ERR_INVALID_PARAMS"
				);
			}
		},

		// -----------------------------------------------------------------------
		// MEMBER MANAGEMENT — add or update a workspace membership
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

				const existing = dbWorkspaceMembers.find(
					m => m.workspaceId === workspaceId && m.userId === userId
				);
				if (existing) {
					existing.role = role;
					await this.broker.emit("cache.clean.workspaces", {});
					return existing;
				}

				const member = { workspaceId, userId, role, joinedAt: new Date().toISOString() };
				dbWorkspaceMembers.push(member);
				await this.broker.emit("cache.clean.workspaces", {});
				return member;
			}
		},
		// -----------------------------------------------------------------------
		// LIST PROJECTS
		// -----------------------------------------------------------------------
		listProjects: {
			rest: "GET /projects",
			auth: "required",
			params: {
				workspaceId: { type: "string", optional: true }
			},
			async handler(ctx) {
				const { workspaceId } = ctx.params;
				if (workspaceId) {
					await this.checkWorkspaceAccess(ctx, workspaceId, "viewer");
					return dbProjects.filter(p => p.workspaceId === workspaceId);
				}
				return dbProjects;
			}
		},

		// -----------------------------------------------------------------------
		// GET A SINGLE PROJECT
		// -----------------------------------------------------------------------
		getProject: {
			rest: "GET /projects/:id",
			auth: "required",
			params: { id: "string" },
			async handler(ctx) {
				const { id } = ctx.params;
				const project = dbProjects.find(p => p.id === id);
				if (!project) throw new MoleculerError("Project not found", 404, "ERR_NOT_FOUND");
				await this.checkProjectAccess(ctx, id, "viewer");
				return project;
			}
		},

		// -----------------------------------------------------------------------
		// CREATE A PROJECT
		// -----------------------------------------------------------------------
		createProject: {
			rest: "POST /projects",
			auth: "required",
			params: {
				workspaceId: "string",
				name: "string",
				description: { type: "string", optional: true }
			},
			async handler(ctx) {
				const { workspaceId, name, description } = ctx.params;
				await this.checkWorkspaceAccess(ctx, workspaceId, "member");
				const newProject = {
					id: "proj-" + Date.now(),
					workspaceId,
					name,
					description: description || "",
					status: "active",
					createdBy: ctx.meta.user.id,
					createdAt: new Date().toISOString()
				};
				dbProjects.push(newProject);
				this.logger.info(
					`[workspaces] Created project "${name}" by user=${ctx.meta.user.id}`
				);
				return newProject;
			}
		},

		// -----------------------------------------------------------------------
		// UPDATE A PROJECT
		// -----------------------------------------------------------------------
		updateProject: {
			rest: "PATCH /projects/:id",
			auth: "required",
			params: {
				id: "string",
				name: { type: "string", optional: true },
				description: { type: "string", optional: true },
				status: {
					type: "enum",
					values: ["active", "archived", "completed"],
					optional: true
				}
			},
			async handler(ctx) {
				const { id, name, description, status } = ctx.params;
				const project = dbProjects.find(p => p.id === id);
				if (!project) throw new MoleculerError("Project not found", 404, "ERR_NOT_FOUND");
				const effectiveRole = await this.checkProjectAccess(ctx, id, "member");
				this.logger.info(
					`[workspaces] User=${ctx.meta.user.id} (role="${effectiveRole}") updating project=${id}`
				);
				if (name !== undefined) project.name = name;
				if (description !== undefined) project.description = description;
				if (status !== undefined) project.status = status;
				project.updatedAt = new Date().toISOString();
				project.updatedBy = ctx.meta.user.id;
				return project;
			}
		},

		// -----------------------------------------------------------------------
		// DELETE A PROJECT
		// -----------------------------------------------------------------------
		removeProject: {
			rest: "DELETE /projects/:id",
			auth: "required",
			params: { id: "string" },
			async handler(ctx) {
				const { id } = ctx.params;
				const idx = dbProjects.findIndex(p => p.id === id);
				if (idx === -1) throw new MoleculerError("Project not found", 404, "ERR_NOT_FOUND");
				await this.checkProjectAccess(ctx, id, "admin");
				const [removed] = dbProjects.splice(idx, 1);
				this.logger.info(`[workspaces] Project=${id} deleted by user=${ctx.meta.user.id}`);
				return { deleted: true, project: removed };
			}
		}
	}
};
