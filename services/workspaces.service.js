"use strict";

const path = require("path");
const { MoleculerError } = require("moleculer").Errors;

// ---------------------------------------------------------------------------
// Load JSON seed files — used as the in-memory data store for dev/test.
// In production, replace these loads with real DB adapter queries.
// ---------------------------------------------------------------------------
const SEED_DIR = path.join(__dirname, "../data/seed");

const dbWorkspaces       = require(path.join(SEED_DIR, "workspaces.json"));
const dbProjects         = require(path.join(SEED_DIR, "projects.json"));
const dbWorkspaceMembers = require(path.join(SEED_DIR, "workspace_members.json"));
const dbProjectMembers   = require(path.join(SEED_DIR, "project_members.json"));

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
				if (!ws)
					throw new MoleculerError("Workspace not found", 404, "ERR_NOT_FOUND");
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
				userId:      "string",
				projectId:   { type: "string", optional: true },
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
				userId:      "string",
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
		// MEMBER MANAGEMENT — add or update a project-level role override
		// -----------------------------------------------------------------------
		addProjectMember: {
			rest: "POST /projects/:projectId/members",
			auth: "required",
			params: {
				projectId: "string",
				userId:    "string",
				role: { type: "enum", values: ["admin", "member", "viewer"], default: "member" }
			},
			async handler(ctx) {
				const { projectId, userId, role } = ctx.params;

				const existing = dbProjectMembers.find(
					m => m.projectId === projectId && m.userId === userId
				);
				if (existing) {
					existing.role = role;
					await this.broker.emit("cache.clean.workspaces", {});
					return existing;
				}

				const member = { projectId, userId, role, joinedAt: new Date().toISOString() };
				dbProjectMembers.push(member);
				await this.broker.emit("cache.clean.workspaces", {});
				return member;
			}
		}
	}
};
