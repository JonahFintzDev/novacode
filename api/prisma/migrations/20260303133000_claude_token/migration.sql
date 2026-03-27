-- Add Claude Code token storage to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "claude_token" TEXT;

