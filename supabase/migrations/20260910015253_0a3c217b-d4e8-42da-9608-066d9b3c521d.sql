DO $$
DECLARE r RECORD; stmt TEXT;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = '{public}'
      AND (coalesce(qual,'') || coalesce(with_check,'')) ~ '(has_role|is_authenticated_user|is_authenticated_team_member|get_current_team_member_id)'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    stmt := format('CREATE POLICY %I ON %I.%I AS PERMISSIVE FOR %s TO authenticated',
                   r.policyname, r.schemaname, r.tablename,
                   CASE r.cmd WHEN 'ALL' THEN 'ALL' ELSE r.cmd END);
    IF r.qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', r.qual);
    END IF;
    IF r.with_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', r.with_check);
    END IF;
    EXECUTE stmt;
  END LOOP;
END $$;