-- Make role_templates global: remove workspace association, unique name globally
ALTER TABLE "role_templates" DROP CONSTRAINT IF EXISTS "role_templates_workspace_id_fkey";
DROP INDEX IF EXISTS "role_templates_workspace_id_name_key";
ALTER TABLE "role_templates" DROP COLUMN "workspace_id";
CREATE UNIQUE INDEX "role_templates_name_key" ON "role_templates"("name");
