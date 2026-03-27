-- Add tags column to sessions
ALTER TABLE "sessions" ADD COLUMN "tags" TEXT;

-- Migrate existing category names to tags
UPDATE "sessions" SET "tags" = (SELECT "name" FROM "categories" WHERE "id" = "sessions"."category_id") WHERE "category_id" IS NOT NULL;

-- Drop category_id FK from sessions
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_category_id_fkey";
ALTER TABLE "sessions" DROP COLUMN "category_id";

-- Add tags column to orchestrators
ALTER TABLE "orchestrators" ADD COLUMN "tags" TEXT;

-- Migrate existing category names to tags
UPDATE "orchestrators" SET "tags" = (SELECT "name" FROM "categories" WHERE "id" = "orchestrators"."category_id") WHERE "category_id" IS NOT NULL;

-- Drop category_id FK from orchestrators
ALTER TABLE "orchestrators" DROP CONSTRAINT "orchestrators_category_id_fkey";
ALTER TABLE "orchestrators" DROP COLUMN "category_id";

-- Drop categories table
DROP TABLE "categories";
