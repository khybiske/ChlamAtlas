-- Google OAuth doesn't populate display_name/lab_affiliation/city/country
-- (those keys only exist in metadata set by the email/password signUp flow),
-- so Google sign-ins fell back to showing the email prefix as their name.
-- Fall back to Google's own full_name/name/user_name metadata keys instead.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, lab_affiliation, city, country, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      NULLIF(TRIM(new.raw_user_meta_data->>'display_name'), ''),
      NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''),
      NULLIF(TRIM(new.raw_user_meta_data->>'user_name'), '')
    ),
    NULLIF(TRIM(new.raw_user_meta_data->>'lab_affiliation'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'city'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'country'), ''),
    'community'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
