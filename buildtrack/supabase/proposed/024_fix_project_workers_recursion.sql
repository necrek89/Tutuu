-- project_workers <-> projects policies refer to each other; Postgres refuses ("infinite
-- recursion") when a policy on project_workers reads projects, whose own policy reads
-- project_workers. A SECURITY DEFINER helper reads projects without row security.
CREATE OR REPLACE FUNCTION is_foreman_of(pid bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM projects WHERE id = pid AND foreman_id = auth.uid()) $$;
REVOKE ALL ON FUNCTION is_foreman_of(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_foreman_of(bigint) TO authenticated;

DROP POLICY IF EXISTS project_workers_insert ON project_workers;
CREATE POLICY project_workers_insert ON project_workers FOR INSERT TO authenticated
  WITH CHECK (is_foreman_of(project_id));

DROP POLICY IF EXISTS "foreman can delete project workers of own projects" ON project_workers;
CREATE POLICY project_workers_delete ON project_workers FOR DELETE TO authenticated
  USING (is_foreman_of(project_id));
