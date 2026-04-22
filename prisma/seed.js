"use strict";

/**
 * Prisma Seed — Data awal PostgreSQL untuk development & testing
 * Jalankan: npm run prisma:seed
 *           atau: npx prisma db seed
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // =========================================================================
  // USERS
  // =========================================================================
  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@pms.dev" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@pms.dev",
      passwordHash
    }
  });

  const alice = await prisma.user.upsert({
    where: { email: "alice@pms.dev" },
    update: {},
    create: {
      name: "Alice",
      email: "alice@pms.dev",
      passwordHash
    }
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@pms.dev" },
    update: {},
    create: {
      name: "Bob",
      email: "bob@pms.dev",
      passwordHash
    }
  });

  console.log(`✅ Users: admin (${admin.id}), alice (${alice.id}), bob (${bob.id})`);

  // =========================================================================
  // WORKSPACES
  // =========================================================================
  const workspace = await prisma.workspace.upsert({
    where: { id: "ws-engineering" },
    update: {},
    create: {
      id: "ws-engineering",
      name: "Engineering",
      description: "Core engineering workspace",
      ownerId: admin.id
    }
  });

  console.log(`✅ Workspace: ${workspace.name} (${workspace.id})`);

  // =========================================================================
  // WORKSPACE MEMBERS
  // =========================================================================
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: admin.id, role: "ADMIN" }
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: alice.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: alice.id, role: "MEMBER" }
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: bob.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: bob.id, role: "VIEWER" }
  });

  console.log("✅ Workspace members seeded");

  // =========================================================================
  // PROJECTS
  // =========================================================================
  const project = await prisma.project.upsert({
    where: { id: "proj-platform-rewrite" },
    update: {},
    create: {
      id: "proj-platform-rewrite",
      name: "Platform Rewrite",
      description: "Rewrite the platform with microservices",
      workspaceId: workspace.id,
      leaderId: admin.id,
      visibility: "PRIVATE",
      statusConfig: {
        statuses: ["TODO", "IN_PROGRESS", "REVIEW", "DONE"]
      }
    }
  });

  console.log(`✅ Project: ${project.name} (${project.id})`);

  // =========================================================================
  // LABELS
  // =========================================================================
  const labelFrontend = await prisma.label.upsert({
    where: { id: "label-frontend" },
    update: {},
    create: { id: "label-frontend", name: "Frontend", color: "#3B82F6" }
  });

  const labelBug = await prisma.label.upsert({
    where: { id: "label-bug" },
    update: {},
    create: { id: "label-bug", name: "Bug", color: "#EF4444" }
  });

  const labelUrgent = await prisma.label.upsert({
    where: { id: "label-urgent" },
    update: {},
    create: { id: "label-urgent", name: "Urgent", color: "#F97316" }
  });

  console.log("✅ Labels seeded");

  // =========================================================================
  // TASKS
  // =========================================================================
  const task = await prisma.task.upsert({
    where: { id: "task-setup-auth" },
    update: {},
    create: {
      id: "task-setup-auth",
      projectId: project.id,
      title: "Setup Authentication Service",
      description: "Implement JWT login, register, refresh token",
      type: "TASK",
      status: "IN_PROGRESS",
      priority: "HIGH",
      progress: 60,
      createdById: admin.id
    }
  });

  // Task Assignee
  await prisma.taskAssignee.upsert({
    where: { taskId_userId: { taskId: task.id, userId: alice.id } },
    update: {},
    create: { taskId: task.id, userId: alice.id }
  });

  // Task Label
  await prisma.taskLabel.upsert({
    where: { taskId_labelId: { taskId: task.id, labelId: labelFrontend.id } },
    update: {},
    create: { taskId: task.id, labelId: labelFrontend.id }
  });

  // Subtasks
  await prisma.subtask.upsert({
    where: { id: "sub-login" },
    update: {},
    create: {
      id: "sub-login",
      taskId: task.id,
      title: "Implement POST /auth/login",
      status: "DONE",
      progress: 100
    }
  });

  await prisma.subtask.upsert({
    where: { id: "sub-refresh" },
    update: {},
    create: {
      id: "sub-refresh",
      taskId: task.id,
      title: "Implement POST /auth/refresh",
      status: "IN_PROGRESS",
      progress: 30
    }
  });

  await prisma.subtask.upsert({
    where: { id: "sub-logout" },
    update: {},
    create: {
      id: "sub-logout",
      taskId: task.id,
      title: "Implement POST /auth/logout",
      status: "TODO",
      progress: 0
    }
  });

  // Task Comment
  await prisma.taskComment.upsert({
    where: { id: "comment-1" },
    update: {},
    create: {
      id: "comment-1",
      taskId: task.id,
      userId: alice.id,
      content: "Login sudah berjalan, lanjut ke refresh token @bob"
    }
  });

  console.log(`✅ Task seeded: ${task.title}`);
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
  });
