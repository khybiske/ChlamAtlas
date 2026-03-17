-- ============================================================
-- ChlamAtlas Row-Level Security Policies
-- Run AFTER 01_tables.sql
-- ============================================================

-- Helper: get the current user's role from the users table.
-- Returns 'public' if the user is unauthenticated or not found.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(
        (SELECT role FROM public.users WHERE id = auth.uid()),
        'public'
    );
$$;


-- ─── ENABLE RLS ───────────────────────────────────────────────
ALTER TABLE strains         ENABLE ROW LEVEL SECURITY;
ALTER TABLE genes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE orthologs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutant_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;


-- ─── STRAINS (fully public) ───────────────────────────────────
CREATE POLICY "strains: public read"
    ON strains FOR SELECT USING (true);

CREATE POLICY "strains: admin write"
    ON strains FOR ALL USING (current_user_role() = 'admin');


-- ─── GENES (fully public) ────────────────────────────────────
CREATE POLICY "genes: public read"
    ON genes FOR SELECT USING (true);

CREATE POLICY "genes: admin write"
    ON genes FOR ALL USING (current_user_role() = 'admin');


-- ─── ORTHOLOGS (fully public) ────────────────────────────────
CREATE POLICY "orthologs: public read"
    ON orthologs FOR SELECT USING (true);

CREATE POLICY "orthologs: admin write"
    ON orthologs FOR ALL USING (current_user_role() = 'admin');


-- ─── MUTANTS ──────────────────────────────────────────────────
-- Public: only published mutants
-- Lab member: all mutants
-- Admin: all mutants (+ write)
CREATE POLICY "mutants: public read published only"
    ON mutants FOR SELECT
    USING (
        is_published = true
        OR current_user_role() IN ('lab_member', 'admin')
    );

CREATE POLICY "mutants: lab member write own records"
    ON mutants FOR UPDATE
    USING (current_user_role() IN ('lab_member', 'admin'));

CREATE POLICY "mutants: admin full write"
    ON mutants FOR ALL USING (current_user_role() = 'admin');


-- ─── MUTANT PIPELINE ─────────────────────────────────────────
-- Pipeline is lab-internal; public can only see pipeline rows
-- for published mutants.
CREATE POLICY "pipeline: public read published only"
    ON mutant_pipeline FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM mutants m
            WHERE m.mutant_id = mutant_pipeline.mutant_id
              AND (m.is_published = true OR current_user_role() IN ('lab_member', 'admin'))
        )
    );

CREATE POLICY "pipeline: lab member write"
    ON mutant_pipeline FOR INSERT
    WITH CHECK (current_user_role() IN ('lab_member', 'admin'));

CREATE POLICY "pipeline: lab member update"
    ON mutant_pipeline FOR UPDATE
    USING (current_user_role() IN ('lab_member', 'admin'));

CREATE POLICY "pipeline: admin full write"
    ON mutant_pipeline FOR ALL USING (current_user_role() = 'admin');


-- ─── USERS ────────────────────────────────────────────────────
-- Users can read their own row; admins can read all.
CREATE POLICY "users: read own row"
    ON users FOR SELECT
    USING (id = auth.uid() OR current_user_role() = 'admin');

CREATE POLICY "users: update own row"
    ON users FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "users: admin full write"
    ON users FOR ALL USING (current_user_role() = 'admin');


-- ─── AUTO-CREATE USER ROW ON SIGNUP ──────────────────────────
-- Trigger fires when a new user is confirmed in auth.users.
-- Creates a matching row in public.users with role='public'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name, role, is_approved)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        'public',
        false
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
