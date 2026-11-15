-- Migration: 20261114180000_add_feeds_user_policies.sql
-- Description: Allow authenticated users to view and manage their own feeds

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'feeds' AND policyname = 'Users can manage own feeds'
  ) THEN
    CREATE POLICY "Users can manage own feeds" ON public.feeds
      AS PERMISSIVE
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
      WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));
  END IF;
END $$;
