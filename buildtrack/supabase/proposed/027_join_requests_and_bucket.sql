-- STEP C. Two small fixes found while checking the app.
BEGIN;

-- 1) Inviting a worker by email failed with "new row violates row-level security policy
--    for table join_requests": only the worker could create a row. A foreman may now
--    create a row for himself (this is what "add worker by email" does).
-- 2) A worker could create a request already marked 'approved' and so put himself into
--    any foreman's crew. A worker's own request must be 'pending'; only the foreman
--    approves it (the existing "foreman can update request" policy).
DROP POLICY IF EXISTS "worker can create request" ON join_requests;
DROP POLICY IF EXISTS join_requests_worker_request ON join_requests;
CREATE POLICY join_requests_worker_request ON join_requests FOR INSERT TO authenticated
  WITH CHECK (worker_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS join_requests_foreman_invite ON join_requests;
CREATE POLICY join_requests_foreman_invite ON join_requests FOR INSERT TO authenticated
  WITH CHECK (
    foreman_id = auth.uid() AND worker_id <> auth.uid()
    AND EXISTS (SELECT 1 FROM profiles me WHERE me.id = auth.uid() AND me.role = 'foreman')
  );

-- 3) The public file bucket accepted any file of any size. Photos, videos, project
--    documents (pdf, office, drawings, archives) stay allowed; web pages, scripts and
--    svg (what phishing or malware hosting would need) are no longer accepted.
--    application/octet-stream stays because browsers send it for .dwg/.dxf/.rar.
UPDATE storage.buckets
SET file_size_limit = 52428800,  -- 50 MB
    allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
      'video/mp4','video/quicktime','video/webm',
      'application/pdf',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip','application/x-zip-compressed','application/vnd.rar','application/x-rar-compressed',
      'image/vnd.dwg','image/vnd.dxf','application/acad','application/dxf','application/octet-stream',
      'text/plain','text/csv'
    ]
WHERE id = 'task-photos';

COMMIT;
