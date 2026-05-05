"use strict";

/**
 * Prisma Seed — Data awal PostgreSQL untuk development & testing
 * Jalankan: npm run prisma:seed
 *           atau: npx prisma db seed
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
	adapter,
	log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"]
});

async function main() {
	console.log("🌱 Starting database seed...");

	// =========================================================================
	// USERS
	// =========================================================================
	const passwordHash = await bcrypt.hash("password123", 10);
	const userSeeds = [
		{ id: "user-admin", name: "Admin", email: "admin@pms.dev", role: "ADMIN" },
		{ id: "user-alice", name: "Alice", email: "alice@pms.dev", role: "MEMBER" },
		{ id: "user-bob", name: "Bob", email: "bob@pms.dev", role: "MEMBER" },
		{ id: "user-4", name: "Cathy", email: "cathy@pms.dev", role: "MEMBER" },
		{ id: "user-5", name: "Dion", email: "dion@pms.dev", role: "MEMBER" },
		{ id: "user-6", name: "Evan", email: "evan@pms.dev", role: "MEMBER" },
		{ id: "user-7", name: "Fiona", email: "fiona@pms.dev", role: "MEMBER" },
		{ id: "user-8", name: "Gio", email: "gio@pms.dev", role: "MEMBER" },
		{ id: "user-9", name: "Hana", email: "hana@pms.dev", role: "MEMBER" },
		{ id: "user-10", name: "Irfan", email: "irfan@pms.dev", role: "MEMBER" }
	];

	for (const user of userSeeds) {
		await prisma.user.upsert({
			where: { id: user.id },
			update: {
				name: user.name,
				email: user.email,
				passwordHash,
				role: user.role
			},
			create: {
				id: user.id,
				name: user.name,
				email: user.email,
				passwordHash,
				role: user.role
			}
		});
	}

	console.log(`✅ Users seeded: ${userSeeds.length}`);

	// =========================================================================
	// WORKSPACES
	// =========================================================================
	const workspaceSeeds = Array.from({ length: 10 }, (_, index) => {
		const num = index + 1;
		return {
			id: `ws-${num}`,
			name: `Workspace ${num}`,
			description: `Workspace ${num} for testing`,
			ownerId: userSeeds[index % userSeeds.length].id
		};
	});

	for (const workspace of workspaceSeeds) {
		await prisma.workspace.upsert({
			where: { id: workspace.id },
			update: {
				name: workspace.name,
				description: workspace.description,
				ownerId: workspace.ownerId
			},
			create: workspace
		});
	}

	console.log(`✅ Workspaces seeded: ${workspaceSeeds.length}`);

	// =========================================================================
	// WORKSPACE MEMBERS
	// =========================================================================
	for (const [index, workspace] of workspaceSeeds.entries()) {
		const owner = userSeeds[index % userSeeds.length].id;
		const member = userSeeds[(index + 1) % userSeeds.length].id;
		const viewer = userSeeds[(index + 2) % userSeeds.length].id;

		await prisma.workspaceMember.upsert({
			where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner } },
			update: { role: "ADMIN" },
			create: { workspaceId: workspace.id, userId: owner, role: "ADMIN" }
		});

		await prisma.workspaceMember.upsert({
			where: { workspaceId_userId: { workspaceId: workspace.id, userId: member } },
			update: { role: "MEMBER" },
			create: { workspaceId: workspace.id, userId: member, role: "MEMBER" }
		});

		await prisma.workspaceMember.upsert({
			where: { workspaceId_userId: { workspaceId: workspace.id, userId: viewer } },
			update: { role: "VIEWER" },
			create: { workspaceId: workspace.id, userId: viewer, role: "VIEWER" }
		});
	}

	console.log("✅ Workspace members seeded");

	// =========================================================================
	// PROJECTS
	// =========================================================================
	const projectSeeds = Array.from({ length: 10 }, (_, index) => {
		const num = index + 1;
		return {
			id: `proj-${num}`,
			name: `Project ${num}`,
			description: `Project ${num} for testing`,
			workspaceId: workspaceSeeds[index % workspaceSeeds.length].id,
			leaderId: userSeeds[index % userSeeds.length].id,
			visibility: num % 2 === 0 ? "PUBLIC" : "PRIVATE",
			statusConfig: {
				statuses: ["TODO", "IN_PROGRESS", "REVIEW", "DONE"]
			}
		};
	});

	for (const project of projectSeeds) {
		await prisma.project.upsert({
			where: { id: project.id },
			update: {
				name: project.name,
				description: project.description,
				workspaceId: project.workspaceId,
				leaderId: project.leaderId,
				visibility: project.visibility,
				statusConfig: project.statusConfig
			},
			create: project
		});
	}

	console.log(`✅ Projects seeded: ${projectSeeds.length}`);

	// =========================================================================
	// PROJECT MEMBERS
	// =========================================================================
	for (const [index, project] of projectSeeds.entries()) {
		const adminId = userSeeds[index % userSeeds.length].id;
		const memberId = userSeeds[(index + 1) % userSeeds.length].id;
		const viewerId = userSeeds[(index + 2) % userSeeds.length].id;

		await prisma.projectMember.upsert({
			where: { projectId_userId: { projectId: project.id, userId: adminId } },
			update: { role: "ADMIN" },
			create: { projectId: project.id, userId: adminId, role: "ADMIN" }
		});

		await prisma.projectMember.upsert({
			where: { projectId_userId: { projectId: project.id, userId: memberId } },
			update: { role: "MEMBER" },
			create: { projectId: project.id, userId: memberId, role: "MEMBER" }
		});

		await prisma.projectMember.upsert({
			where: { projectId_userId: { projectId: project.id, userId: viewerId } },
			update: { role: "VIEWER" },
			create: { projectId: project.id, userId: viewerId, role: "VIEWER" }
		});
	}

	console.log("✅ Project members seeded");

	// =========================================================================
	// LABELS
	// =========================================================================
	const labelSeeds = [
		{ id: "label-1", name: "Frontend", color: "#3B82F6" },
		{ id: "label-2", name: "Backend", color: "#10B981" },
		{ id: "label-3", name: "Bug", color: "#EF4444" },
		{ id: "label-4", name: "Urgent", color: "#F97316" },
		{ id: "label-5", name: "Docs", color: "#6366F1" },
		{ id: "label-6", name: "Security", color: "#14B8A6" },
		{ id: "label-7", name: "Testing", color: "#F59E0B" },
		{ id: "label-8", name: "Refactor", color: "#EC4899" },
		{ id: "label-9", name: "Chore", color: "#6B7280" },
		{ id: "label-10", name: "Infra", color: "#0EA5E9" }
	];

	for (const label of labelSeeds) {
		await prisma.label.upsert({
			where: { id: label.id },
			update: { name: label.name, color: label.color },
			create: label
		});
	}

	console.log(`✅ Labels seeded: ${labelSeeds.length}`);

	// =========================================================================
	// TASKS
	// =========================================================================
	const statusOrder = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
	const subtaskStatusOrder = ["TODO", "IN_PROGRESS", "DONE"];
	const priorityOrder = ["LOW", "MEDIUM", "HIGH", "URGENT"];
	const taskSeeds = Array.from({ length: 10 }, (_, index) => {
		const num = index + 1;
		return {
			id: `task-${num}`,
			projectId: projectSeeds[index % projectSeeds.length].id,
			title: `Task ${num}`,
			description: `Task ${num} description for testing`,
			type: num % 3 === 0 ? "BUG" : "TASK",
			status: statusOrder[index % statusOrder.length],
			priority: priorityOrder[index % priorityOrder.length],
			progress: (index * 10) % 100,
			createdById: userSeeds[index % userSeeds.length].id
		};
	});

	for (const task of taskSeeds) {
		await prisma.task.upsert({
			where: { id: task.id },
			update: {
				title: task.title,
				description: task.description,
				type: task.type,
				status: task.status,
				priority: task.priority,
				progress: task.progress,
				createdById: task.createdById,
				projectId: task.projectId
			},
			create: task
		});
	}

	console.log(`✅ Tasks seeded: ${taskSeeds.length}`);

	// =========================================================================
	// TASK ASSIGNEES
	// =========================================================================
	for (const [index, task] of taskSeeds.entries()) {
		const assigneeId = userSeeds[(index + 1) % userSeeds.length].id;
		await prisma.taskAssignee.upsert({
			where: { taskId_userId: { taskId: task.id, userId: assigneeId } },
			update: {},
			create: { taskId: task.id, userId: assigneeId }
		});
	}

	console.log("✅ Task assignees seeded");

	// =========================================================================
	// TASK LABELS
	// =========================================================================
	for (const [index, task] of taskSeeds.entries()) {
		const labelId = labelSeeds[index % labelSeeds.length].id;
		await prisma.taskLabel.upsert({
			where: { taskId_labelId: { taskId: task.id, labelId } },
			update: {},
			create: { taskId: task.id, labelId }
		});
	}

	console.log("✅ Task labels seeded");

	// =========================================================================
	// SUBTASKS
	// =========================================================================
	const subtaskSeeds = Array.from({ length: 10 }, (_, index) => {
		const num = index + 1;
		return {
			id: `subtask-${num}`,
			taskId: taskSeeds[index % taskSeeds.length].id,
			title: `Subtask ${num}`,
			status: subtaskStatusOrder[index % subtaskStatusOrder.length],
			progress: (index * 15) % 100
		};
	});

	for (const subtask of subtaskSeeds) {
		await prisma.subtask.upsert({
			where: { id: subtask.id },
			update: {
				title: subtask.title,
				status: subtask.status,
				progress: subtask.progress,
				taskId: subtask.taskId
			},
			create: subtask
		});
	}

	console.log(`✅ Subtasks seeded: ${subtaskSeeds.length}`);

	// =========================================================================
	// TASK COMMENTS
	// =========================================================================
	const commentSeeds = Array.from({ length: 10 }, (_, index) => {
		const num = index + 1;
		return {
			id: `comment-${num}`,
			taskId: taskSeeds[index % taskSeeds.length].id,
			userId: userSeeds[(index + 2) % userSeeds.length].id,
			content: `Komentar ${num} untuk testing`
		};
	});

	for (const comment of commentSeeds) {
		await prisma.taskComment.upsert({
			where: { id: comment.id },
			update: {
				content: comment.content,
				taskId: comment.taskId,
				userId: comment.userId
			},
			create: comment
		});
	}

	console.log(`✅ Task comments seeded: ${commentSeeds.length}`);

	// =========================================================================
	// DOCUMENTS
	// =========================================================================
	const documentSeeds = Array.from({ length: 10 }, (_, index) => {
		const num = index + 1;
		return {
			id: `doc-${num}`,
			projectId: projectSeeds[index % projectSeeds.length].id,
			fileName: `document-${num}.md`,
			storageKey: `documents/document-${num}.md`
		};
	});

	for (const document of documentSeeds) {
		await prisma.document.upsert({
			where: { id: document.id },
			update: {
				fileName: document.fileName,
				storageKey: document.storageKey,
				projectId: document.projectId
			},
			create: document
		});
	}

	console.log(`✅ Documents seeded: ${documentSeeds.length}`);

	// =========================================================================
	// TASK ATTACHMENTS
	// =========================================================================
	const attachmentSeeds = Array.from({ length: 10 }, (_, index) => {
		const num = index + 1;
		return {
			id: `attach-${num}`,
			taskId: taskSeeds[index % taskSeeds.length].id,
			fileName: `attachment-${num}.txt`,
			fileUrl: `https://example.com/files/attachment-${num}.txt`,
			uploadedBy: userSeeds[index % userSeeds.length].id
		};
	});

	for (const attachment of attachmentSeeds) {
		await prisma.taskAttachment.upsert({
			where: { id: attachment.id },
			update: {
				fileName: attachment.fileName,
				fileUrl: attachment.fileUrl,
				taskId: attachment.taskId,
				uploadedBy: attachment.uploadedBy
			},
			create: attachment
		});
	}

	console.log(`✅ Task attachments seeded: ${attachmentSeeds.length}`);
	console.log("\n🎉 Database seeded successfully!");
	console.log("\n📋 Credentials untuk testing:");
	console.log("   Email   : admin@pms.dev | alice@pms.dev | bob@pms.dev");
	console.log("   Password: password123");
}

main()
	.catch(e => {
		console.error("❌ Seed failed:", e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
		await pool.end();
	});
