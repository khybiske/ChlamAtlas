-- Auto-create a public.users row whenever someone signs up via Supabase Auth.
-- Reads display_name and lab_affiliation from user_metadata (set in signUp options).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, lab_affiliation, city, country, role)
  VALUES (
    new.id,
    new.email,
    NULLIF(TRIM(new.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'lab_affiliation'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'city'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'country'), ''),
    'community'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
