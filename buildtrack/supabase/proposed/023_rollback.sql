-- Puts everything back exactly as it was before 023_tighten_rls.sql (re-opens the holes).
BEGIN;
DROP TRIGGER IF EXISTS trg_protect_profile_billing ON profiles;
DROP FUNCTION IF EXISTS protect_profile_billing();

CREATE POLICY "all_access" ON activity_log  FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "all_access" ON task_comments FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "read_comments" ON task_comments FOR SELECT TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "insert_comments" ON task_comments FOR INSERT TO public WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Project members can insert comments" ON task_comments FOR INSERT TO public
  WITH CHECK (task_id IN (SELECT tasks.id FROM tasks WHERE tasks.project_id IN (
    SELECT projects.id FROM projects WHERE projects.foreman_id = auth.uid()
    UNION SELECT project_workers.project_id FROM project_workers WHERE project_workers.worker_id = auth.uid())));
DROP POLICY IF EXISTS comments_client_read ON task_comments;
DROP POLICY IF EXISTS comments_insert ON task_comments;

DROP POLICY IF EXISTS project_workers_select ON project_workers;
DROP POLICY IF EXISTS project_workers_insert ON project_workers;
DROP POLICY IF EXISTS profiles_foreman_update_crew ON profiles;
DROP FUNCTION IF EXISTS my_project_ids();

CREATE POLICY "auth_all" ON notifications    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON projects         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON tasks            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON tools            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON project_workers  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON profiles         FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMIT;
