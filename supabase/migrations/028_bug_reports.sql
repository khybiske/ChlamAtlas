-- Bug reports: authenticated users submit, public reads open reports, admin resolves

CREATE TABLE bug_reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  description  text,
  reporter_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved'))
);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can read open reports
CREATE POLICY "bug_reports_public_read" ON bug_reports
  FOR SELECT USING (status = 'open');

-- Authenticated users can submit
CREATE POLICY "bug_reports_auth_insert" ON bug_reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Admin can update (resolve) any report
CREATE POLICY "bug_reports_admin_update" ON bug_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );
