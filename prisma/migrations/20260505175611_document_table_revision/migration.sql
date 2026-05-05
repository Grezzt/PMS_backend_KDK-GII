/*
  Warnings:

  - You are about to drop the column `task_id` on the `documents` table. All the data in the column will be lost.
  - Made the column `project_id` on table `documents` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_task_id_fkey";

-- AlterTable
ALTER TABLE "documents" DROP COLUMN "task_id",
ALTER COLUMN "project_id" SET NOT NULL;
