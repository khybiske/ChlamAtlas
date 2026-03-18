-- Home page admin-managed content tables

-- Admin-editable spotlight/featured card (single row, key = 'spotlight')
CREATE TABLE IF NOT EXISTS public.site_config (
  key        text PRIMARY KEY,
  title      text,
  body       text,
  link_url   text,
  link_label text
);

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_config public read" ON public.site_config FOR SELECT USING (true);
CREATE POLICY "site_config admin write" ON public.site_config FOR ALL USING (public.is_admin());

-- Admin-managed recent updates list
CREATE TABLE IF NOT EXISTS public.site_updates (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title      text NOT NULL,
  category   text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.site_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_updates public read" ON public.site_updates FOR SELECT USING (true);
CREATE POLICY "site_updates admin write" ON public.site_updates FOR ALL USING (public.is_admin());

-- Seed spotlight row (empty until admin edits it)
INSERT INTO public.site_config (key, title) VALUES ('spotlight', null) ON CONFLICT DO NOTHING;
