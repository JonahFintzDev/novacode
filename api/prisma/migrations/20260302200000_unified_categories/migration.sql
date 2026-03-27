-- CreateTable: unified categories per workspace
CREATE TABLE "categories" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "sort_order" INTEGER,

  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categories_workspace_id_name_key" ON "categories"("workspace_id", "name");

-- Add category_id to sessions and orchestrators (nullable, no FK yet for backfill)
ALTER TABLE "sessions" ADD COLUMN "category_id" TEXT;
ALTER TABLE "orchestrators" ADD COLUMN "category_id" TEXT;

-- Backfill: create Category rows from distinct (workspace_id, category) in sessions and orchestrators
-- Default color palette (same order as dashboard categoryColorClass hash); sort_order by name per workspace
INSERT INTO "categories" ("id", "workspace_id", "name", "color", "sort_order")
SELECT
  gen_random_uuid()::text,
  "workspace_id",
  "name",
  (ARRAY[
    'bg-blue-500/15 text-blue-400 border-blue-500/20',
    'bg-purple-500/15 text-purple-400 border-purple-500/20',
    'bg-green-500/15 text-green-400 border-green-500/20',
    'bg-orange-500/15 text-orange-400 border-orange-500/20',
    'bg-pink-500/15 text-pink-400 border-pink-500/20',
    'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
    'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    'bg-red-500/15 text-red-400 border-red-500/20'
  ])[1 + (abs(hashtext("name"))::bigint % 8)],
  "sort_order"
FROM (
  SELECT "workspace_id", "name",
    (row_number() OVER (PARTITION BY "workspace_id" ORDER BY "name") - 1)::integer AS "sort_order"
  FROM (
    SELECT DISTINCT s."workspaceId" AS "workspace_id", s."category" AS "name"
    FROM "sessions" s
    WHERE s."category" IS NOT NULL AND trim(s."category") != ''
    UNION
    SELECT DISTINCT o."workspaceId" AS "workspace_id", o."category" AS "name"
    FROM "orchestrators" o
    WHERE o."category" IS NOT NULL AND trim(o."category") != ''
  ) AS "distinct_cats"
) AS "numbered";

-- Set session.category_id from matching category
UPDATE "sessions" s
SET "category_id" = c."id"
FROM "categories" c
WHERE c."workspace_id" = s."workspaceId"
  AND c."name" = s."category"
  AND s."category" IS NOT NULL AND trim(s."category") != '';

-- Set orchestrator.category_id from matching category
UPDATE "orchestrators" o
SET "category_id" = c."id"
FROM "categories" c
WHERE c."workspace_id" = o."workspaceId"
  AND c."name" = o."category"
  AND o."category" IS NOT NULL AND trim(o."category") != '';

-- Add foreign keys
ALTER TABLE "categories" ADD CONSTRAINT "categories_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orchestrators" ADD CONSTRAINT "orchestrators_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old category columns
ALTER TABLE "sessions" DROP COLUMN "category";
ALTER TABLE "orchestrators" DROP COLUMN "category";
