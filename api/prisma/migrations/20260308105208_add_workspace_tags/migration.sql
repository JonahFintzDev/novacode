/*
  Warnings:

  - You are about to drop the column `role_template_id` on the `sessions` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_role_template_id_fkey";

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "role_template_id";

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "tags" JSONB;

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "agent_type" TEXT NOT NULL DEFAULT 'cursor-agent',
    "prompt" TEXT NOT NULL,
    "interval_minutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_run_at" TEXT,
    "last_run_at" TEXT,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "started_at" TEXT NOT NULL,
    "finished_at" TEXT,
    "status" TEXT NOT NULL,
    "agent_response" TEXT,
    "changed_files" TEXT,
    "error" TEXT,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
