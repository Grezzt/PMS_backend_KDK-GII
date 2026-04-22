"use strict";

const path = require("path");
const { MoleculerError } = require("moleculer").Errors;
const AuthMixin = require("../mixins/auth.mixin");

// ---------------------------------------------------------------------------
// Load JSON seed files for local dev & test.
// In production, replace these with real DB adapter calls.
// ---------------------------------------------------------------------------
const dbProjects = [];

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 * @typedef {import('moleculer').Context} Context
 */

/**
 * Projects Service
 * ----------------
 * Demonstrates how to use AuthMixin for contextual role-based access control.
 *
 * Key actions:
 *   - projects.list   → any authenticated user with workspace membership can list
 *   - projects.get    → any authenticated user with at least "viewer" role can view
 *   - projects.create → requires "admin" or "member" workspace role
 *   - projects.update → requires "admin" or "member" project/workspace role  ← main demo
 *   - projects.delete → requires "admin" project/workspace role
 *
 * Data-flow for projects.update:
 *   HTTP PATCH /api/projects/:id
 *     → api.service authenticate()  → ctx.meta.user = { id, username }
 *     → projects.update handler
 *         → this.checkProjectAccess(ctx, id, "member")
 *             → ctx.call("workspaces.getMemberRole", { userId, projectId })
 *             → throws 403 if user is "viewer" or has no membership
 *         → DB update (JSON mutation for now)
 *     → returns updated project
 *
 * @type {ServiceSchema}
 */
module.exports = {
	name: "projects",

	// Merge in AuthMixin to get checkProjectAccess / checkWorkspaceAccess methods
	mixins: [AuthMixin],

	settings: {
		fields: ["id", "workspaceId", "name", "description", "status", "createdBy"]
	},

	actions: {
		// -----------------------------------------------------------------------
		// LIST all projects
		// Requires: any authenticated user (membership checked inside)
		// -----------------------------------------------------------------------
		list: {
			rest: "GET /",
			auth: "required",
			params: {
				workspaceId: { type: "string", optional: true }
			},
			async handler(ctx) {
				const { workspaceId } = ctx.params;

				// If workspaceId provided, verify caller has at least viewer access
				if (workspaceId) {
					await this.checkWorkspaceAccess(ctx, workspaceId, "viewer");
					return dbProjects.filter(p => p.workspaceId === workspaceId);
				}

				return dbProjects;
			}
		},

		// -----------------------------------------------------------------------
		// GET a single project
		// Requires: viewer (or higher) in the project
		// -----------------------------------------------------------------------
		get: {
			rest: "GET /:id",
			auth: "required",
			params: { id: "string" },
			async handler(ctx) {
				const { id } = ctx.params;

				// Throws 404 before we even check access if the project doesn't exist
				const project = dbProjects.find(p => p.id === id);
				if (!project) throw new MoleculerError("Project not found", 404, "ERR_NOT_FOUND");

				// Even viewers can read — this also confirms membership
				await this.checkProjectAccess(ctx, id, "viewer");

				return project;
			}
		},

		// -----------------------------------------------------------------------
		// CREATE a new project
		// Requires: member (or admin) in the target workspace
		// -----------------------------------------------------------------------
		create: {
			rest: "POST /",
			auth: "required",
			params: {
				workspaceId: "string",
				name: "string",
				description: { type: "string", optional: true }
			},
			async handler(ctx) {
				const { workspaceId, name, description } = ctx.params;

				// Must be at least a member in the workspace to create a project
				await this.checkWorkspaceAccess(ctx, workspaceId, "member");

				const newProject = {
					id: `proj-${Date.now()}`,
					workspaceId,
					name,
					description: description || "",
					status: "active",
					createdBy: ctx.meta.user.id,
					createdAt: new Date().toISOString()
				};

				// In production: await adapter.insert(newProject)
				dbProjects.push(newProject);

				this.logger.info(
					`[projects] Created project "${name}" by user=${ctx.meta.user.id}`
				);
				return newProject;
			}
		},

		// -----------------------------------------------------------------------
		// UPDATE an existing project  ← PRIMARY DEMO ACTION
		// Requires: member or admin role in the project (viewers cannot edit)
		// -----------------------------------------------------------------------
		update: {
			rest: "PATCH /:id",
			auth: "required", // api.service enforces token first
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

				// 1. Find the project (fail fast with 404 before auth check)
				const project = dbProjects.find(p => p.id === id);
				if (!project) throw new MoleculerError("Project not found", 404, "ERR_NOT_FOUND");

				// 2. CONTEXTUAL AUTHORIZATION
				//    Requires at least "member" role (admin also passes due to hierarchy).
				//    Viewers will receive: 403 ERR_FORBIDDEN
				//    Non-members will receive: 403 ERR_FORBIDDEN
				const effectiveRole = await this.checkProjectAccess(ctx, id, "member");

				this.logger.info(
					`[projects] User=${ctx.meta.user.id} (role="${effectiveRole}") updating project=${id}`
				);

				// 3. Apply updates (JSON mutation; replace with adapter.updateById in prod)
				if (name !== undefined) project.name = name;
				if (description !== undefined) project.description = description;
				if (status !== undefined) project.status = status;
				project.updatedAt = new Date().toISOString();
				project.updatedBy = ctx.meta.user.id;

				return project;
			}
		},

		// -----------------------------------------------------------------------
		// DELETE a project
		// Requires: admin role only (members cannot delete)
		// -----------------------------------------------------------------------
		delete: {
			rest: "DELETE /:id",
			auth: "required",
			params: { id: "string" },
			async handler(ctx) {
				const { id } = ctx.params;

				const idx = dbProjects.findIndex(p => p.id === id);
				if (idx === -1) throw new MoleculerError("Project not found", 404, "ERR_NOT_FOUND");

				// Only admins can delete a project
				await this.checkProjectAccess(ctx, id, "admin");

				const [removed] = dbProjects.splice(idx, 1);
				this.logger.info(`[projects] Project=${id} deleted by user=${ctx.meta.user.id}`);

				return { deleted: true, project: removed };
			}
		}
	}
};
