"use strict";

/**
 * Unit Tests — auth.mixin.js
 * Tests are focused on the mixin's methods in isolation.
 * ctx.call("workspaces.getMemberRole") is mocked so we don't need a broker.
 */

const AuthMixin = require("../../mixins/auth.mixin");
const { hasRequiredRole, ROLE_HIERARCHY } = require("../../mixins/auth.mixin");
const { MoleculerError } = require("moleculer").Errors;

// -----------------------------------------------------------------------
// Helper: build a fake service instance wired to the mixin methods
// -----------------------------------------------------------------------
function buildFakeService(getMemberRoleResult) {
	// ctx.call mock — returns a given role lookup result
	const mockCtx = {
		meta:  { user: null },
		call:  jest.fn().mockResolvedValue(getMemberRoleResult)
	};

	// Attach mixin methods directly to a fake "this"
	const fakeService = {
		logger: {
			debug: jest.fn(),
			warn:  jest.fn(),
			info:  jest.fn()
		},
		// Bind mixin methods
		requireAuth:           AuthMixin.methods.requireAuth,
		checkProjectAccess:    AuthMixin.methods.checkProjectAccess,
		checkWorkspaceAccess:  AuthMixin.methods.checkWorkspaceAccess
	};

	return { fakeService, mockCtx };
}

// -----------------------------------------------------------------------
// hasRequiredRole — pure helper function tests
// -----------------------------------------------------------------------
describe("hasRequiredRole()", () => {
	it("admin satisfies admin", ()   => expect(hasRequiredRole("admin",  "admin")).toBe(true));
	it("admin satisfies member", ()  => expect(hasRequiredRole("admin",  "member")).toBe(true));
	it("admin satisfies viewer", ()  => expect(hasRequiredRole("admin",  "viewer")).toBe(true));
	it("member satisfies member", () => expect(hasRequiredRole("member", "member")).toBe(true));
	it("member satisfies viewer", () => expect(hasRequiredRole("member", "viewer")).toBe(true));
	it("member does NOT satisfy admin",  () => expect(hasRequiredRole("member", "admin")).toBe(false));
	it("viewer satisfies viewer", ()     => expect(hasRequiredRole("viewer", "viewer")).toBe(true));
	it("viewer does NOT satisfy member", () => expect(hasRequiredRole("viewer", "member")).toBe(false));
	it("viewer does NOT satisfy admin",  () => expect(hasRequiredRole("viewer", "admin")).toBe(false));
	it("unknown role returns false",     () => expect(hasRequiredRole("superuser", "admin")).toBe(false));
});

// -----------------------------------------------------------------------
// requireAuth()
// -----------------------------------------------------------------------
describe("requireAuth()", () => {
	it("returns user when ctx.meta.user is set", () => {
		const { fakeService, mockCtx } = buildFakeService({ role: "admin" });
		mockCtx.meta.user = { id: "user-1", username: "alice" };
		const user = fakeService.requireAuth(mockCtx);
		expect(user).toEqual({ id: "user-1", username: "alice" });
	});

	it("throws 401 when ctx.meta.user is null", () => {
		const { fakeService, mockCtx } = buildFakeService({ role: null });
		mockCtx.meta.user = null;
		expect(() => fakeService.requireAuth(mockCtx)).toThrow(
			expect.objectContaining({ code: 401, type: "ERR_UNAUTHENTICATED" })
		);
	});

	it("throws 401 when ctx.meta.user has no id", () => {
		const { fakeService, mockCtx } = buildFakeService({ role: null });
		mockCtx.meta.user = { username: "ghost" };
		expect(() => fakeService.requireAuth(mockCtx)).toThrow(
			expect.objectContaining({ code: 401, type: "ERR_UNAUTHENTICATED" })
		);
	});
});

// -----------------------------------------------------------------------
// checkProjectAccess()
// -----------------------------------------------------------------------
describe("checkProjectAccess()", () => {
	const PROJECT_ID = "proj-1";

	it("allows user with 'admin' role when 'member' is required", async () => {
		const { fakeService, mockCtx } = buildFakeService({ role: "admin" });
		mockCtx.meta.user = { id: "user-admin" };

		const role = await fakeService.checkProjectAccess.call(fakeService, mockCtx, PROJECT_ID, "member");
		expect(role).toBe("admin");
		expect(mockCtx.call).toHaveBeenCalledWith("workspaces.getMemberRole", {
			userId:    "user-admin",
			projectId: PROJECT_ID
		});
	});

	it("allows user with 'member' role when 'member' is required", async () => {
		const { fakeService, mockCtx } = buildFakeService({ role: "member" });
		mockCtx.meta.user = { id: "user-alice" };

		const role = await fakeService.checkProjectAccess.call(fakeService, mockCtx, PROJECT_ID, "member");
		expect(role).toBe("member");
	});

	it("allows user with 'viewer' role when 'viewer' is required", async () => {
		const { fakeService, mockCtx } = buildFakeService({ role: "viewer" });
		mockCtx.meta.user = { id: "user-bob" };

		const role = await fakeService.checkProjectAccess.call(fakeService, mockCtx, PROJECT_ID, "viewer");
		expect(role).toBe("viewer");
	});

	it("throws 403 when user has 'viewer' role but 'member' is required", async () => {
		const { fakeService, mockCtx } = buildFakeService({ role: "viewer" });
		mockCtx.meta.user = { id: "user-bob" };

		await expect(
			fakeService.checkProjectAccess.call(fakeService, mockCtx, PROJECT_ID, "member")
		).rejects.toMatchObject({ code: 403, type: "ERR_FORBIDDEN" });
	});

	it("throws 403 when user has 'member' role but 'admin' is required", async () => {
		const { fakeService, mockCtx } = buildFakeService({ role: "member" });
		mockCtx.meta.user = { id: "user-alice" };

		await expect(
			fakeService.checkProjectAccess.call(fakeService, mockCtx, PROJECT_ID, "admin")
		).rejects.toMatchObject({ code: 403, type: "ERR_FORBIDDEN" });
	});

	it("throws 403 when user has no membership (role: null)", async () => {
		const { fakeService, mockCtx } = buildFakeService({ role: null });
		mockCtx.meta.user = { id: "user-outsider" };

		await expect(
			fakeService.checkProjectAccess.call(fakeService, mockCtx, PROJECT_ID, "viewer")
		).rejects.toMatchObject({ code: 403, type: "ERR_FORBIDDEN" });
	});

	it("throws 401 when user is not authenticated", async () => {
		const { fakeService, mockCtx } = buildFakeService({ role: "admin" });
		mockCtx.meta.user = null;

		await expect(
			fakeService.checkProjectAccess.call(fakeService, mockCtx, PROJECT_ID, "member")
		).rejects.toMatchObject({ code: 401, type: "ERR_UNAUTHENTICATED" });
	});
});

// -----------------------------------------------------------------------
// checkWorkspaceAccess()
// -----------------------------------------------------------------------
describe("checkWorkspaceAccess()", () => {
	const WORKSPACE_ID = "ws-1";

	it("allows admin in workspace", async () => {
		const { fakeService, mockCtx } = buildFakeService({ role: "admin" });
		mockCtx.meta.user = { id: "user-admin" };

		const role = await fakeService.checkWorkspaceAccess.call(fakeService, mockCtx, WORKSPACE_ID, "admin");
		expect(role).toBe("admin");
		expect(mockCtx.call).toHaveBeenCalledWith("workspaces.getMemberRole", {
			userId:      "user-admin",
			workspaceId: WORKSPACE_ID
		});
	});

	it("blocks user from another workspace (role: null)", async () => {
		const { fakeService, mockCtx } = buildFakeService({ role: null });
		mockCtx.meta.user = { id: "user-charlie" };

		await expect(
			fakeService.checkWorkspaceAccess.call(fakeService, mockCtx, WORKSPACE_ID, "viewer")
		).rejects.toMatchObject({ code: 403, type: "ERR_FORBIDDEN" });
	});
});
