-- Add optional role_template_id on sessions pointing to role_templates
ALTER TABLE "sessions"
  ADD COLUMN "role_template_id" TEXT;

-- Foreign key: when a role template is deleted, clear the reference on sessions
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_role_template_id_fkey"
  FOREIGN KEY ("role_template_id") REFERENCES "role_templates"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

