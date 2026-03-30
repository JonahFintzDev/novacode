-- AlterTable
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_preview_text" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_preview_role" TEXT;
