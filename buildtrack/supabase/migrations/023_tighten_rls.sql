-- Applied to production on 2026-10-27 (by hand in the SQL Editor).
--
-- Fixes two problems found on 2026-10-27:
--  1. Old "allow everything" policies (auth_all / all_access) are still on the
--     tables. Policies combine with OR, so they cancel the stricter ones.
--  2. Any signed-in user can edit billing fields of a profile (plan, subscription).
--
-- Everything the app does today is covered by the scoped policies that already
-- exist, plus the few replacements below. See 023_review.txt for the checklist.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1. Billing columns of profiles can only be changed by the server.
-- Restricts only requests that arrive with a user's token (auth.role() =
-- 'authenticated'). The service role (edge functions: Paddle webhook, quota),
-- the signup trigger and the SQL editor are not affected.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION protect_profile_billing() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.plan := NULL;
    NEW.plan_period := NULL;
    NEW.trial_ends_at := NULL;
    NEW.paddle_customer_id := NULL;
    NEW.paddle_subscription_id := NULL;
    NEW.subscription_status := NULL;
    NEW.subscription_current_period_end := NULL;
    NEW.scheduled_cancel_at := NULL;
    RETURN NEW;
  END IF;

  -- The app sets the 30-day trial itself the first time a foreman signs in
  -- (src/lib/billing.js). Allow exactly that: only while it is still empty,
  -- and never further than 31 days ahead.
  IF OLD.trial_ends_at IS NULL THEN
    IF NEW.trial_ends_at IS NOT NULL THEN
      NEW.trial_ends_at := least(NEW.trial_ends_at, now() + interval '31 days');
    END IF;
  ELSE
    NEW.trial_ends_at := OLD.trial_ends_at;
  END IF;

  NEW.plan := OLD.plan;
  NEW.plan_period := OLD.plan_period;
  NEW.paddle_customer_id := OLD.paddle_customer_id;
  NEW.paddle_subscription_id := OLD.paddle_subscription_id;
  NEW.subscription_status := OLD.subscription_status;
  NEW.subscription_current_period_end := OLD.subscription_current_period_end;
  NEW.scheduled_cancel_at := OLD.scheduled_cancel_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_billing ON profiles;
CREATE TRIGGER trg_protect_profile_billing
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_billing();

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2. activity_log and task_comments: no more access without a login,
-- and comments only for people on that project.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "all_access" ON activity_log;

DROP POLICY IF EXISTS "all_access" ON task_comments;
DROP POLICY IF EXISTS "read_comments" ON task_comments;
DROP POLICY IF EXISTS "insert_comments" ON task_comments;
DROP POLICY IF EXISTS "Project members can insert comments" ON task_comments;
-- "Project members can view comments" (foreman + project workers) stays.

-- Clients (projects.client_id) could read comments only through the open policy
-- before; give them the same access explicitly.
DROP POLICY IF EXISTS "comments_client_read" ON task_comments;
CREATE POLICY comments_client_read ON task_comments FOR SELECT TO authenticated
  USING (task_id IN (
    SELECT t.id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.client_id = auth.uid()
  ));

-- Insert: as yourself, and only on tasks of a project you are on
DROP POLICY IF EXISTS "comments_insert" ON task_comments;
CREATE POLICY comments_insert ON task_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND task_id IN (
      SELECT t.id FROM tasks t
      WHERE t.project_id IN (
        SELECT id FROM projects WHERE foreman_id = auth.uid() OR client_id = auth.uid()
        UNION
        SELECT project_id FROM project_workers WHERE worker_id = auth.uid()
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3. Remove "allow everything for any signed-in user".
-- The scoped policies listed in the review file already cover tasks, projects,
-- tools and notifications. project_workers and profiles need replacements first.
-- ─────────────────────────────────────────────────────────────────────────────

-- project_workers had NO scoped select/insert policy (only the open one + delete).
-- A helper avoids a policy that reads its own table (infinite recursion).
CREATE OR REPLACE FUNCTION my_project_ids() RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM projects WHERE foreman_id = auth.uid() OR client_id = auth.uid()
  UNION
  SELECT project_id FROM project_workers WHERE worker_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION my_project_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_project_ids() TO authenticated;

DROP POLICY IF EXISTS "project_workers_select" ON project_workers;
CREATE POLICY project_workers_select ON project_workers FOR SELECT TO authenticated
  USING (worker_id = auth.uid() OR project_id IN (SELECT my_project_ids()));

DROP POLICY IF EXISTS "project_workers_insert" ON project_workers;
CREATE POLICY project_workers_insert ON project_workers FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE foreman_id = auth.uid()));

-- Foreman edits worker_status / phone / telegram of their crew (updateWorkerStatus,
-- updateWorkerContact). Own row is already covered by profiles_own.
DROP POLICY IF EXISTS "profiles_foreman_update_crew" ON profiles;
CREATE POLICY profiles_foreman_update_crew ON profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM join_requests jr
            WHERE jr.foreman_id = auth.uid() AND jr.worker_id = profiles.id AND jr.status = 'approved')
    OR EXISTS (SELECT 1 FROM project_workers pw JOIN projects p ON p.id = pw.project_id
               WHERE pw.worker_id = profiles.id AND p.foreman_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM join_requests jr
            WHERE jr.foreman_id = auth.uid() AND jr.worker_id = profiles.id AND jr.status = 'approved')
    OR EXISTS (SELECT 1 FROM project_workers pw JOIN projects p ON p.id = pw.project_id
               WHERE pw.worker_id = profiles.id AND p.foreman_id = auth.uid())
  );

DROP POLICY IF EXISTS "auth_all" ON notifications;
DROP POLICY IF EXISTS "auth_all" ON projects;
DROP POLICY IF EXISTS "auth_all" ON tasks;
DROP POLICY IF EXISTS "auth_all" ON tools;
DROP POLICY IF EXISTS "auth_all" ON project_workers;
DROP POLICY IF EXISTS "auth_all" ON profiles;

COMMIT;
