-- Normalize: rename summary → aiSummary if needed (schema drift from early migration)
-- Then add generated fts_vector columns + GIN indexes for full-text search
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sections' AND column_name = 'summary'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sections' AND column_name = 'aiSummary'
    ) THEN
        ALTER TABLE "sections" RENAME COLUMN "summary" TO "aiSummary";
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sections' AND column_name = 'aiSummary'
    ) THEN
        ALTER TABLE "sections" ADD COLUMN "aiSummary" TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sections' AND column_name = 'fts_vector'
    ) THEN
        ALTER TABLE "sections" ADD COLUMN fts_vector tsvector
            GENERATED ALWAYS AS (
                to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce("aiSummary",''))
            ) STORED;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'fts_vector'
    ) THEN
        ALTER TABLE "messages" ADD COLUMN fts_vector tsvector
            GENERATED ALWAYS AS (
                to_tsvector('english', coalesce(content,''))
            ) STORED;
    END IF;
END $$;

-- GIN indexes for fast full-text search on generated columns
CREATE INDEX IF NOT EXISTS idx_sections_fts ON "sections" USING GIN (fts_vector);
CREATE INDEX IF NOT EXISTS idx_messages_fts ON "messages" USING GIN (fts_vector);
