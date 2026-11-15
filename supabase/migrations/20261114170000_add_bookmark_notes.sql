-- Migration: 20261114170000_add_bookmark_notes.sql
-- Description: Add multi-line note column to bookmarks table

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookmarks') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'bookmarks' AND column_name = 'note'
        ) THEN
            ALTER TABLE public.bookmarks ADD COLUMN note text;
            COMMENT ON COLUMN public.bookmarks.note IS 'Optional user notes or commentary for the bookmark timestamp';
        END IF;
    END IF;
END $$;
