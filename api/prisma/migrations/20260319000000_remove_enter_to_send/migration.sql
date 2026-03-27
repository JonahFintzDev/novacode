-- Drop legacy user preference no longer used by app clients.
ALTER TABLE "users"
DROP COLUMN IF EXISTS "enter_to_send";
