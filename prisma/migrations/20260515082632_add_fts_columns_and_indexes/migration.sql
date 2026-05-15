-- Add generated tsvector columns and GIN indexes for full-text search performance
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
