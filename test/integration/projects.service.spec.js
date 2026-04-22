"use strict";

/**
 * Integration Tests — projects.service.js
 * Uses a real ServiceBroker with in-memory NeDB so services can talk to each other.
 * Verifies end-to-end contextual role enforcement for the `projects.update` action.
 */

const { ServiceBroker } = require("moleculer");
const ProjectsSchema   = require("../../services/projects.service");
const WorkspacesSchema = require("../../services/workspaces.service");

// -----------------------------------------------------------------------
// Shared broker — started once for the whole test suite
// -----------------------------------------------------------------------
describe("projects.service.js — contextual RBAC integration", () => {
	let broker;

	beforeAll(async () => {
		broker = new ServiceBroker({ logger: false });
		broker.createService(WorkspacesSchema);
		broker.createService(ProjectsSchema);
		await broker.start();
	});

	afterAll(() => broker.stop());

	// Helper: build a ctx.meta with a specific user
	const meta = (userId) => ({ user: { id: userId, username: userId } });

	// -----------------------------------------------------------------------
	// projects.get — viewer access
	// -----------------------------------------------------------------------
	describe("projects.get", () => {
		it("should allow viewer (user-bob) to GET a project", async () => {
			const res = await broker.call("projects.get", { id: "proj-1" }, { meta: meta("user-bob") });
			expect(res).toMatchObject({ id: "proj-1", name: "Platform Rewrite" });
		});

		it("should block outsider (user-charlie) from accessing ws-1 project", async () => {
			await expect(
				broker.call("projects.get", { id: "proj-1" }, { meta: meta("user-charlie") })
			).rejects.toMatchObject({ code: 403 });
		});

		it("should return 404 for non-existent project", async () => {
			await expect(
				broker.call("projects.get", { id: "proj-999" }, { meta: meta("user-admin") })
			).rejects.toMatchObject({ code: 404 });
		});
	});

	// -----------------------------------------------------------------------
	// projects.update — PRIMARY DEMO
	// -----------------------------------------------------------------------
	describe("projects.update", () => {
		it("should allow admin (user-admin) to update a project", async () => {
			const res = await broker.call(
				"projects.update",
				{ id: "proj-1", name: "Platform Rewrite v2" },
				{ meta: meta("user-admin") }
			);
			expect(res.name).toBe("Platform Rewrite v2");
		});

		it("should allow member (user-alice) to update a project", async () => {
			const res = await broker.call(
				"projects.update",
				{ id: "proj-1", description: "Updated by Alice" },
				{ meta: meta("user-alice") }
			);
			expect(res.description).toBe("Updated by Alice");
		});

		it("should allow user-bob (viewer in ws, but member override in proj-1) to update proj-1", async () => {
			// user-bob is viewer in ws-1 but has a project_members override of "member" for proj-1
			const res = await broker.call(
				"projects.update",
				{ id: "proj-1", description: "Bob has project override" },
				{ meta: meta("user-bob") }
			);
			expect(res.description).toBe("Bob has project override");
		});

		it("should BLOCK viewer (user-bob) from updating proj-2 (no project override)", async () => {
			// user-bob only has workspace-level "viewer" in ws-1 for proj-2
			await expect(
				broker.call(
					"projects.update",
					{ id: "proj-2", name: "Hacked" },
					{ meta: meta("user-bob") }
				)
			).rejects.toMatchObject({ code: 403, type: "ERR_FORBIDDEN" });
		});

		it("should BLOCK user with no membership (user-charlie) from updating ws-1 project", async () => {
			await expect(
				broker.call(
					"projects.update",
					{ id: "proj-1", name: "Hacked" },
					{ meta: meta("user-charlie") }
				)
			).rejects.toMatchObject({ code: 403, type: "ERR_FORBIDDEN" });
		});

		it("should BLOCK unauthenticated call (no ctx.meta.user)", async () => {
			await expect(
				broker.call("projects.update", { id: "proj-1", name: "Hacked" })
			).rejects.toMatchObject({ code: 401, type: "ERR_UNAUTHENTICATED" });
		});

		it("should return 404 for non-existent project", async () => {
			await expect(
				broker.call(
					"projects.update",
					{ id: "proj-999", name: "Ghost" },
					{ meta: meta("user-admin") }
				)
			).rejects.toMatchObject({ code: 404 });
		});
	});

	// -----------------------------------------------------------------------
	// projects.delete — admin only
	// -----------------------------------------------------------------------
	describe("projects.delete", () => {
		it("should BLOCK member (user-alice) from deleting a project", async () => {
			await expect(
				broker.call("projects.delete", { id: "proj-2" }, { meta: meta("user-alice") })
			).rejects.toMatchObject({ code: 403, type: "ERR_FORBIDDEN" });
		});

		it("should allow admin (user-admin) to delete a project", async () => {
			const res = await broker.call(
				"projects.delete",
				{ id: "proj-2" },
				{ meta: meta("user-admin") }
			);
			expect(res.deleted).toBe(true);
			expect(res.project.id).toBe("proj-2");
		});
	});

	// -----------------------------------------------------------------------
	// workspaces.getMemberRole — direct role resolution
	// -----------------------------------------------------------------------
	describe("workspaces.getMemberRole", () => {
		it("returns admin role for user-admin in proj-1", async () => {
			const res = await broker.call("workspaces.getMemberRole", {
				userId: "user-admin", projectId: "proj-1"
			});
			expect(res.role).toBe("admin");
		});

		it("returns member override role for user-bob in proj-1", async () => {
			const res = await broker.call("workspaces.getMemberRole", {
				userId: "user-bob", projectId: "proj-1"
			});
			expect(res.role).toBe("member"); // project override, not workspace viewer
		});

		it("returns viewer (workspace fallback) for user-bob in proj-2", async () => {
			const res = await broker.call("workspaces.getMemberRole", {
				userId: "user-bob", projectId: "proj-2"
			});
			expect(res.role).toBe("viewer"); // no project override → workspace fallback
		});

		it("returns null for user-charlie in ws-1 project", async () => {
			const res = await broker.call("workspaces.getMemberRole", {
				userId: "user-charlie", projectId: "proj-1"
			});
			expect(res.role).toBeNull();
		});
	});
});
