-- CreateTable
CREATE TABLE "session_prompt_queue" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'auto',
    "image_paths_json" TEXT,
    "position" INTEGER NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "session_prompt_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_session_prompt_queue_session_position"
ON "session_prompt_queue"("session_id", "position", "created_at");

-- AddForeignKey
ALTER TABLE "session_prompt_queue"
ADD CONSTRAINT "session_prompt_queue_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
