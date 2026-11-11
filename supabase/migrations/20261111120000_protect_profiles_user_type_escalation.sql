-- Migration: 20261111120000_protect_profiles_user_type_escalation.sql
-- Description: Prevent privilege escalation on public.profiles via user_type self-updates.

-- 1. Create defense-in-depth trigger function
CREATE OR REPLACE FUNCTION public.prevent_user_type_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If user_type is modified
  IF NEW.user_type IS DISTINCT FROM OLD.user_type THEN
    -- Only service_role, postgres/admin, or an authenticated user who is ALREADY admin/root may alter user_type
    IF (
      auth.role() = 'service_role'
      OR current_user IN ('postgres', 'supabase_admin')
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND user_type IN ('admin', 'root')
      )
    ) THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Permission denied: unauthorized modification of user_type (attempted escalation by user %)', auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_type_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_user_type_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_type_self_escalation();

-- 2. Harden the RLS policy on public.profiles with an explicit WITH CHECK constraint
DROP POLICY IF EXISTS "Users can update their own profile" ON public."profiles";
CREATE POLICY "Users can update their own profile" ON public."profiles"
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND (
            -- user_type must remain unchanged unless caller is already an admin/root
            user_type = (SELECT p.user_type FROM public.profiles p WHERE p.id = auth.uid())
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.user_type IN ('admin', 'root')
            )
        )
    );

