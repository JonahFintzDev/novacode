-- CreateTable: role_templates per workspace
CREATE TABLE "role_templates" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "content" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "role_templates_pkey" PRIMARY KEY ("id")
);

-- Ensure unique template names per workspace
CREATE UNIQUE INDEX "role_templates_workspace_id_name_key"
  ON "role_templates"("workspace_id", "name");

-- Foreign key to workspaces
ALTER TABLE "role_templates" ADD CONSTRAINT "role_templates_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

