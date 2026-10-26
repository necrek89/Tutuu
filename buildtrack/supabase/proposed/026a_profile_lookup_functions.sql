-- STEP A (additive, safe to run first). Adds what the app needs once strangers can no
-- longer read profiles: two lookup functions and a "people related to me" policy.
-- Nothing is removed here; the old open policy still exists until step B.
BEGIN;

-- Profiles a user may see: self, own crew, own foreman, people on shared projects.
CREATE OR REPLACE FUNCTION visible_profile_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid()
  UNION SELECT worker_id  FROM join_requests WHERE foreman_id = auth.uid()
  UNION SELECT foreman_id FROM join_requests WHERE worker_id = auth.uid() AND status = 'approved'
  UNION SELECT worker_id  FROM project_workers WHERE project_id IN (SELECT my_project_ids())
  UNION SELECT foreman_id FROM projects WHERE id IN (SELECT my_project_ids())
  UNION SELECT client_id  FROM projects WHERE foreman_id = auth.uid() AND client_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION visible_profile_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION visible_profile_ids() TO authenticated;

DROP POLICY IF EXISTS profiles_select_related ON profiles;
CREATE POLICY profiles_select_related ON profiles FOR SELECT TO authenticated
  USING (id IN (SELECT visible_profile_ids()));

-- Add a worker/manager by email. Only foremen may ask; only id, name and role come back.
CREATE OR REPLACE FUNCTION find_profile_by_email(p_email text)
RETURNS TABLE (id uuid, name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.name, p.role FROM profiles p
  WHERE lower(p.email) = lower(trim(p_email))
    AND EXISTS (SELECT 1 FROM profiles me WHERE me.id = auth.uid() AND me.role = 'foreman')
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION find_profile_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION find_profile_by_email(text) TO authenticated;

-- A worker joins a crew by invite code. Only foremen are found; only id, name, role come back.
CREATE OR REPLACE FUNCTION find_foreman_by_code(p_code text)
RETURNS TABLE (id uuid, name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.name, p.role FROM profiles p
  WHERE p.invite_code = lower(trim(p_code)) AND p.role = 'foreman' AND auth.uid() IS NOT NULL
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION find_foreman_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION find_foreman_by_code(text) TO authenticated;

COMMIT;
