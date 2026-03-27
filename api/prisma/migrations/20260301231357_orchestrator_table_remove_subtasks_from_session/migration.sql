/*
  Warnings:

  - You are about to drop the column `subtasks_json` on the `sessions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "subtasks_json";

-- CreateTable
CREATE TABLE "orchestrators" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message_json" TEXT NOT NULL,
    "subtasks_json" TEXT,
    "workspaceId" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orchestrators_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "orchestrators" ADD CONSTRAINT "orchestrators_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
