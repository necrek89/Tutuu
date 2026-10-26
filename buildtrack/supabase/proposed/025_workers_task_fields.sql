-- A worker may only (a) send their own task for review (status -> 'pending') and
-- (b) attach photos (photo_url). Every other column is kept as it was, and a worker
-- cannot set a task to 'approved'/'rejected' by himself. The project's foreman and
-- the server are not restricted.
CREATE OR REPLACE FUNCTION protect_task_for_workers() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_status text := NEW.status;
  new_photo  text := NEW.photo_url;
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' AND NOT is_foreman_of(OLD.project_id) THEN
    NEW := OLD;
    IF new_status = 'pending' THEN NEW.status := 'pending'; END IF;
    NEW.photo_url := new_photo;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_task_for_workers ON tasks;
CREATE TRIGGER trg_protect_task_for_workers
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION protect_task_for_workers();
