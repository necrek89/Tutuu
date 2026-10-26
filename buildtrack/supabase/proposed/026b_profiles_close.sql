-- STEP B (run only AFTER the new app version is live and step A is applied).
-- Closes the leak: profiles are no longer readable by every signed-in user.
BEGIN;

DROP POLICY IF EXISTS authenticated_can_read_profiles ON profiles;
-- This one also exposed every worker who is on ANY project (it lacked a foreman check):
DROP POLICY IF EXISTS foreman_can_read_worker_profiles ON profiles;

-- Tools: "users can view tools" let everybody read all tools. Own and assigned tools stay
-- visible (tools_foreman / tools_worker already cover project tools).
CREATE POLICY tools_select_own ON tools FOR SELECT TO authenticated
  USING (foreman_id = auth.uid() OR worker_id = auth.uid());
DROP POLICY IF EXISTS "users can view tools" ON tools;

COMMIT;
