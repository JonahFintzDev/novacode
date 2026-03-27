-- AlterTable
ALTER TABLE "orchestrators" ADD COLUMN     "run_current_step" INTEGER,
ADD COLUMN     "run_started_at" TEXT,
ADD COLUMN     "run_status" TEXT,
ADD COLUMN     "run_total_steps" INTEGER;
