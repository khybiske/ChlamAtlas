-- Sync public.users.id to match auth.users.id where email matches but UUID differs.
-- This fixes rows that were manually created (e.g. in the Supabase table editor)
-- before the on_auth_user_created trigger existed or before the user signed up.
-- Safe to run multiple times; only touches mismatched rows with no FK dependents.

UPDATE public.users u
SET id = a.id
FROM auth.users a
WHERE u.email = a.email
  AND u.id != a.id
  -- Only update if no other tables reference the old UUID (avoids FK violations)
  AND NOT EXISTS (
    SELECT 1 FROM public.mutants      WHERE creator    = u.id OR updated_by = u.id
    UNION ALL
    SELECT 1 FROM public.annotations  WHERE curator_id = u.id
  );
