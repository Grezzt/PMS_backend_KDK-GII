"use strict";

const { MoleculerError } = require("moleculer").Errors;

// ---------------------------------------------------------------------------
// ROLE HIERARCHY
// The higher the index, the more powerful the role.
// A role at index N can do everything that roles at index < N can do.
// ---------------------------------------------------------------------------
const ROLE_HIERARCHY = ["viewer", "member", "admin"];

/**
 * Checks whether `userRole` satisfies `requiredRole` in the hierarchy.
 * e.g. hasRequiredRole("admin", "member") → true
 *      hasRequiredRole("viewer", "member") → false
 *
 * @param {string} userRole
 * @param {string} requiredRole
 * @returns {boolean}
 */
function hasRequiredRole(userRole, requiredRole) {
	const userIdx = ROLE_HIERARCHY.indexOf(userRole);
	const requiredIdx = ROLE_HIERARCHY.indexOf(requiredRole);
	if (userIdx === -1 || requiredIdx === -1) return false;
	return userIdx >= requiredIdx;
}

/**
 * @typedef {import('moleculer').Context} Context
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 */

/**
 * Auth Mixin — Contextual Authorization Middleware
 * --------------------------------------------------
 * Usage: add `AuthMixin` to your service's `mixins` array.
 *
 * The mixin exposes two helper methods:
 *
 *  • checkProjectAccess(ctx, projectId, requiredRole)
 *      Verifies that ctx.meta.user has at least `requiredRole`
 *      for the given project (checking project_members first, then
 *      workspace_members as a fallback).
 *
 *  • checkWorkspaceAccess(ctx, workspaceId, requiredRole)
 *      Verifies that ctx.meta.user has at least `requiredRole`
 *      for the given workspace.
 *
 * Both methods call the `workspaces.getMemberRole` action, keeping this
 * mixin completely decoupled from database internals.
 *
 * @type {ServiceSchema}
 */
const AuthMixin = {
	name: "auth-mixin",

	methods: {
		/**
		 * Verify that the calling user is authenticated.
		 * Throws 401 if ctx.meta.user is missing.
		 *
		 * @param {Context} ctx
		 * @returns {{ id: string, username: string }} the user object
		 */
		requireAuth(ctx) {
			if (!ctx.meta.user || !ctx.meta.user.id) {
				throw new MoleculerError(
					"Authentication required",
					401,
					"ERR_UNAUTHENTICATED"
				);
			}
			return ctx.meta.user;
		},

		/**
		 * Check that the calling user has at least `requiredRole` in a PROJECT.
		 *
		 * Resolution order (implemented in workspaces.service):
		 *   1. project_members   → project-specific override (highest priority)
		 *   2. workspace_members → inherited base role (fallback)
		 *   3. null              → no membership → 403
		 *
		 * @param {Context}  ctx          - Moleculer context (ctx.meta.user must be set)
		 * @param {string}   projectId    - The target project's ID
		 * @param {string}   requiredRole - Minimum role needed: "viewer" | "member" | "admin"
		 * @throws {MoleculerError} 401 if not authenticated
		 * @throws {MoleculerError} 403 if the user doesn't hold the required role
		 */
		async checkProjectAccess(ctx, projectId, requiredRole) {
			const user = this.requireAuth(ctx);

			this.logger.debug(
				`[auth.mixin] checkProjectAccess — user=${user.id} project=${projectId} required=${requiredRole}`
			);

			// Delegate role resolution to the workspaces service.
			// This keeps the mixin DB-agnostic and easy to unit-test by mocking ctx.call.
			const result = await ctx.call("workspaces.getMemberRole", {
				userId: user.id,
				projectId
			});

			const effectiveRole = result?.role ?? null;

			if (!effectiveRole) {
				this.logger.warn(
					`[auth.mixin] User ${user.id} has NO membership in project ${projectId}`
				);
				throw new MoleculerError(
					"You do not have access to this project",
					403,
					"ERR_FORBIDDEN",
					{ userId: user.id, projectId }
				);
			}

			if (!hasRequiredRole(effectiveRole, requiredRole)) {
				this.logger.warn(
					`[auth.mixin] User ${user.id} role="${effectiveRole}" insufficient for project ${projectId} (needs "${requiredRole}")`
				);
				throw new MoleculerError(
					`Insufficient permissions. Required: "${requiredRole}", your role: "${effectiveRole}"`,
					403,
					"ERR_FORBIDDEN",
					{ userId: user.id, projectId, effectiveRole, requiredRole }
				);
			}

			this.logger.debug(
				`[auth.mixin] Access GRANTED — user=${user.id} role=${effectiveRole} project=${projectId}`
			);

			// Return the resolved role so the caller can use it if needed.
			return effectiveRole;
		},

		/**
		 * Check that the calling user has at least `requiredRole` in a WORKSPACE.
		 *
		 * @param {Context}  ctx           - Moleculer context (ctx.meta.user must be set)
		 * @param {string}   workspaceId   - The target workspace's ID
		 * @param {string}   requiredRole  - Minimum role needed: "viewer" | "member" | "admin"
		 * @throws {MoleculerError} 401 if not authenticated
		 * @throws {MoleculerError} 403 if the user doesn't hold the required role
		 */
		async checkWorkspaceAccess(ctx, workspaceId, requiredRole) {
			const user = this.requireAuth(ctx);

			this.logger.debug(
				`[auth.mixin] checkWorkspaceAccess — user=${user.id} workspace=${workspaceId} required=${requiredRole}`
			);

			const result = await ctx.call("workspaces.getMemberRole", {
				userId: user.id,
				workspaceId
			});

			const effectiveRole = result?.role ?? null;

			if (!effectiveRole) {
				this.logger.warn(
					`[auth.mixin] User ${user.id} has NO membership in workspace ${workspaceId}`
				);
				throw new MoleculerError(
					"You do not have access to this workspace",
					403,
					"ERR_FORBIDDEN",
					{ userId: user.id, workspaceId }
				);
			}

			if (!hasRequiredRole(effectiveRole, requiredRole)) {
				this.logger.warn(
					`[auth.mixin] User ${user.id} role="${effectiveRole}" insufficient for workspace ${workspaceId} (needs "${requiredRole}")`
				);
				throw new MoleculerError(
					`Insufficient permissions. Required: "${requiredRole}", your role: "${effectiveRole}"`,
					403,
					"ERR_FORBIDDEN",
					{ userId: user.id, workspaceId, effectiveRole, requiredRole }
				);
			}

			this.logger.debug(
				`[auth.mixin] Workspace access GRANTED — user=${user.id} role=${effectiveRole} workspace=${workspaceId}`
			);

			return effectiveRole;
		}
	}
};

// Export both the mixin and the helper so tests can import them directly.
module.exports = AuthMixin;
module.exports.hasRequiredRole = hasRequiredRole;
module.exports.ROLE_HIERARCHY = ROLE_HIERARCHY;
