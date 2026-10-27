-- Invitations in both directions with consent from the other side.
--  * Everyone gets an invite code (workers too), found with find_profile_by_code().
--  * join_requests remembers who started it (initiated_by). A worker's request is answered by the
--    foreman, a foreman's invitation is answered by the worker. Nobody can answer their own.
--  * Only the answer (status) can change on a request; it can be withdrawn while not accepted.
BEGIN;

ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS initiated_by text NOT NULL DEFAULT 'worker';
ALTER TABLE join_requests DROP CONSTRAINT IF EXISTS join_requests_initiated_by_check;
ALTER TABLE join_requests ADD CONSTRAINT join_requests_initiated_by_check CHECK (initiated_by IN ('worker', 'foreman'));

UPDATE profiles SET invite_code = lower(substr(md5(random()::text || id::text), 1, 8)) WHERE invite_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_invite_code_unique ON profiles (lower(invite_code)) WHERE invite_code IS NOT NULL;

-- Look a person up by invite code (any role). Returns only id, name, role.
CREATE OR REPLACE FUNCTION find_profile_by_code(p_code text)
RETURNS TABLE (id uuid, name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.name, p.role FROM profiles p
  WHERE p.invite_code = lower(trim(p_code)) AND auth.uid() IS NOT NULL
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION find_profile_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION find_profile_by_code(text) TO authenticated;

-- A worker must see the foreman who invited them (name on the invitation), whatever its status
CREATE OR REPLACE FUNCTION visible_profile_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid()
  UNION SELECT worker_id  FROM join_requests WHERE foreman_id = auth.uid()
  UNION SELECT foreman_id FROM join_requests WHERE worker_id = auth.uid()
  UNION SELECT worker_id  FROM project_workers WHERE project_id IN (SELECT my_project_ids())
  UNION SELECT foreman_id FROM projects WHERE id IN (SELECT my_project_ids())
  UNION SELECT client_id  FROM projects WHERE foreman_id = auth.uid() AND client_id IS NOT NULL
$$;

-- Who may create what
DROP POLICY IF EXISTS join_requests_worker_request ON join_requests;
CREATE POLICY join_requests_worker_request ON join_requests FOR INSERT TO authenticated
  WITH CHECK (worker_id = auth.uid() AND status = 'pending' AND initiated_by = 'worker');

DROP POLICY IF EXISTS join_requests_foreman_invite ON join_requests;
CREATE POLICY join_requests_foreman_invite ON join_requests FOR INSERT TO authenticated
  WITH CHECK (
    foreman_id = auth.uid() AND worker_id <> auth.uid() AND status = 'pending' AND initiated_by = 'foreman'
    AND EXISTS (SELECT 1 FROM profiles me WHERE me.id = auth.uid() AND me.role = 'foreman')
  );

-- Who may answer: the other side only
DROP POLICY IF EXISTS "foreman can update request" ON join_requests;
DROP POLICY IF EXISTS join_requests_foreman_answers ON join_requests;
CREATE POLICY join_requests_foreman_answers ON join_requests FOR UPDATE TO authenticated
  USING (foreman_id = auth.uid() AND initiated_by = 'worker')
  WITH CHECK (foreman_id = auth.uid() AND initiated_by = 'worker');

DROP POLICY IF EXISTS join_requests_worker_answers ON join_requests;
CREATE POLICY join_requests_worker_answers ON join_requests FOR UPDATE TO authenticated
  USING (worker_id = auth.uid() AND initiated_by = 'foreman')
  WITH CHECK (worker_id = auth.uid() AND initiated_by = 'foreman');

-- Withdraw an invitation / clear a declined one (an accepted membership is not deleted here)
DROP POLICY IF EXISTS join_requests_delete_open ON join_requests;
CREATE POLICY join_requests_delete_open ON join_requests FOR DELETE TO authenticated
  USING ((foreman_id = auth.uid() OR worker_id = auth.uid()) AND status <> 'approved');

-- Only the answer can change, and only a pending request can be answered
CREATE OR REPLACE FUNCTION protect_join_request() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE answer text := NEW.status;
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' THEN RETURN NEW; END IF;
  NEW := OLD;
  IF OLD.status = 'pending' AND answer IN ('approved', 'rejected') THEN NEW.status := answer; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_join_request ON join_requests;
CREATE TRIGGER trg_protect_join_request BEFORE UPDATE ON join_requests
  FOR EACH ROW EXECUTE FUNCTION protect_join_request();

COMMIT;
