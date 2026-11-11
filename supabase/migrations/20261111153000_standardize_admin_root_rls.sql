-- Migration: 20261111153000_standardize_admin_root_rls.sql
-- Description: Standardize all admin RLS policies to allow both 'admin' and 'root' roles consistently.

-- 1. collection_items
DROP POLICY IF EXISTS "Admins can delete collection_books" ON public."collection_items";
CREATE POLICY "Admins can delete collection_books" ON public."collection_items"
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

DROP POLICY IF EXISTS "Admins can insert collection_books" ON public."collection_items";
CREATE POLICY "Admins can insert collection_books" ON public."collection_items"
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

DROP POLICY IF EXISTS "Admins can update collection_books" ON public."collection_items";
CREATE POLICY "Admins can update collection_books" ON public."collection_items"
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

-- 2. collections
DROP POLICY IF EXISTS "Admins can delete collections" ON public."collections";
CREATE POLICY "Admins can delete collections" ON public."collections"
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

DROP POLICY IF EXISTS "Admins can insert collections" ON public."collections";
CREATE POLICY "Admins can insert collections" ON public."collections"
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

DROP POLICY IF EXISTS "Admins can update collections" ON public."collections";
CREATE POLICY "Admins can update collections" ON public."collections"
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

-- 3. custom_metadata_providers
DROP POLICY IF EXISTS "Admins can manage custom_metadata_providers" ON public."custom_metadata_providers";
CREATE POLICY "Admins can manage custom_metadata_providers" ON public."custom_metadata_providers"
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

-- 4. feed_episodes
DROP POLICY IF EXISTS "Admins can manage feed_episodes" ON public."feed_episodes";
CREATE POLICY "Admins can manage feed_episodes" ON public."feed_episodes"
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

-- 5. feeds
DROP POLICY IF EXISTS "Admins can manage feeds" ON public."feeds";
CREATE POLICY "Admins can manage feeds" ON public."feeds"
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

-- 6. library_folders
DROP POLICY IF EXISTS "Admins can delete library_folders" ON public."library_folders";
CREATE POLICY "Admins can delete library_folders" ON public."library_folders"
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

DROP POLICY IF EXISTS "Admins can insert library_folders" ON public."library_folders";
CREATE POLICY "Admins can insert library_folders" ON public."library_folders"
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

DROP POLICY IF EXISTS "Admins can update library_folders" ON public."library_folders";
CREATE POLICY "Admins can update library_folders" ON public."library_folders"
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

-- 7. media_item_shares
DROP POLICY IF EXISTS "Admins can manage media_item_shares" ON public."media_item_shares";
CREATE POLICY "Admins can manage media_item_shares" ON public."media_item_shares"
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

-- 8. podcast_episodes
DROP POLICY IF EXISTS "Admins can delete podcast_episodes" ON public."podcast_episodes";
CREATE POLICY "Admins can delete podcast_episodes" ON public."podcast_episodes"
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

DROP POLICY IF EXISTS "Admins can insert podcast_episodes" ON public."podcast_episodes";
CREATE POLICY "Admins can insert podcast_episodes" ON public."podcast_episodes"
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

DROP POLICY IF EXISTS "Admins can update podcast_episodes" ON public."podcast_episodes";
CREATE POLICY "Admins can update podcast_episodes" ON public."podcast_episodes"
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

-- 9. podcasts
DROP POLICY IF EXISTS "Admins can delete podcasts" ON public."podcasts";
CREATE POLICY "Admins can delete podcasts" ON public."podcasts"
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

DROP POLICY IF EXISTS "Admins can insert podcasts" ON public."podcasts";
CREATE POLICY "Admins can insert podcasts" ON public."podcasts"
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

DROP POLICY IF EXISTS "Admins can update podcasts" ON public."podcasts";
CREATE POLICY "Admins can update podcasts" ON public."podcasts"
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type IN ('admin', 'root'))))));

