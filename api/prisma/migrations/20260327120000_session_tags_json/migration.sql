-- Store session tags as JSON array (aligned with workspace tags).

ALTER TABLE "sessions" ADD COLUMN "tags_new" JSONB;

UPDATE "sessions" SET "tags_new" = (
  CASE
    WHEN "tags" IS NULL OR trim("tags"::text) = '' THEN NULL
    ELSE (
      SELECT to_jsonb(array_agg(trim(elem)))
      FROM unnest(string_to_array("tags"::text, ',')) AS elem
      WHERE trim(elem) <> ''
    )
  END
);

ALTER TABLE "sessions" DROP COLUMN "tags";
ALTER TABLE "sessions" RENAME COLUMN "tags_new" TO "tags";
