-- ============================================================================
-- DEMO PROJECT SEED — paste into Supabase SQL Editor and click Run.
-- Creates one project "Demo: 3-room apartment renovation" owned by the
-- foreman id below, with realistic tasks/materials/expenses/tools/comments,
-- and (if any exist) auto-assigns tasks to your real existing worker
-- profiles — it does NOT create fake team accounts (see scripts/seed-demo.mjs
-- for that, via Node + service role key).
--
-- Idempotent: re-running this deletes the previous demo project (by exact
-- name + owner) before recreating it. Everything runs in one transaction —
-- if any statement errors, nothing is committed, so it's always safe to
-- just fix and re-run.
--
-- To remove the demo project without recreating it, run only the cleanup
-- DO block below (the first statement) and then COMMIT.
-- ============================================================================

BEGIN;

-- ── 0. Owner account ─────────────────────────────────────────────────────
-- If '906c78be-4cae-4b64-a6ba-02008469363c' below isn't your foreman
-- profile id, replace every occurrence of it in this file before running
-- (it's used as a plain literal throughout, not a variable).

DROP TABLE IF EXISTS _demo_project, _demo_workers, _demo_tasks;

-- ── 1. Clean up any previous demo project for this owner (idempotent) ──────
DO $$
DECLARE
  v_owner CONSTANT uuid := '906c78be-4cae-4b64-a6ba-02008469363c';
  v_pid   projects.id%TYPE;
BEGIN
  FOR v_pid IN SELECT id FROM projects WHERE name = 'Demo: 3-room apartment renovation' AND foreman_id = v_owner LOOP
    DELETE FROM task_comments     WHERE task_id IN (SELECT id FROM tasks WHERE project_id = v_pid);
    DELETE FROM material_requests WHERE project_id = v_pid;
    DELETE FROM materials         WHERE project_id = v_pid;
    DELETE FROM expenses          WHERE project_id = v_pid;
    DELETE FROM tools             WHERE project_id = v_pid;
    DELETE FROM work_logs         WHERE project_id = v_pid;
    DELETE FROM tasks             WHERE project_id = v_pid;
    DELETE FROM project_workers   WHERE project_id = v_pid;
    DELETE FROM projects          WHERE id = v_pid;
  END LOOP;
END $$;

-- ── 2. The project ───────────────────────────────────────────────────────
CREATE TEMP TABLE _demo_project ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO projects (name, foreman_id, address, deadline, stages, zones, progress)
  VALUES (
    'Demo: 3-room apartment renovation',
    '906c78be-4cae-4b64-a6ba-02008469363c',
    '14 Maple Street, Apt 3B',
    CURRENT_DATE + INTERVAL '21 days',
    '["Demolition","Plastering","Electrical","Tiling","Painting","Cleaning"]'::jsonb,
    ARRAY['Corridor','Kitchen','Bathroom','Living room','Balcony'],
    0
  )
  RETURNING id
)
SELECT * FROM ins;

-- ── 3. Whatever real workers already exist on your team, if any ───────────
CREATE TEMP TABLE _demo_workers ON COMMIT DROP AS
SELECT DISTINCT p.id, p.name, ROW_NUMBER() OVER (ORDER BY p.created_at) AS rn
FROM profiles p
JOIN project_workers pw ON pw.worker_id = p.id
JOIN projects pr ON pr.id = pw.project_id
WHERE pr.foreman_id = '906c78be-4cae-4b64-a6ba-02008469363c'
  AND p.role = 'worker';

-- ── 4. Tasks — 25 rows, statuses distributed to tell the "Corridor: demo
-- and plastering done, electrical in progress, tiling not started" story,
-- Bathroom nearly finished, Balcony untouched. worker_id round-robins over
-- whatever _demo_workers has (NULL if you have none yet).
CREATE TEMP TABLE _demo_tasks ON COMMIT DROP AS
WITH td(idx, zone, stage, text, qty, unit, unit_price, status, assign) AS (
  VALUES
    (0,  'Corridor',    'Demolition', 'Strip old wallpaper and baseboards',                          12, 'm²',   4::numeric, 'approved', true),
    (1,  'Corridor',    'Plastering', 'Plaster and level corridor walls',                             12, 'm²',   9,          'approved', true),
    (2,  'Corridor',    'Electrical', 'Run wiring for hallway outlets and light switch',                1, 'set', 180,          'new',      true),
    (3,  'Corridor',    'Tiling',     'Lay porcelain tile flooring',                                   10, 'm²',  22,          'new',      false),
    (4,  'Bathroom',    'Demolition', 'Remove old bathtub and tiling',                                  1, 'set', 220,          'approved', true),
    (5,  'Bathroom',    'Plastering', 'Waterproof and plaster bathroom walls',                         14, 'm²',  11,          'approved', true),
    (6,  'Bathroom',    'Electrical', 'Install waterproof light fixture and exhaust fan wiring',        1, 'set', 140,          'approved', true),
    (7,  'Bathroom',    'Painting',   'Apply moisture-resistant paint',                                14, 'm²',   5,          'approved', true),
    (8,  'Bathroom',    'Cleaning',   'Deep clean fixtures and grout lines',                             1, 'set',  60,          'new',      true),
    (9,  'Bathroom',    'Tiling',     'Tile bathroom floor',                                             6, 'm²',  26,          'pending',  true),
    (10, 'Kitchen',     'Demolition', 'Remove old kitchen cabinetry',                                    1, 'set', 150,          'approved', true),
    (11, 'Kitchen',     'Plastering', 'Plaster kitchen walls',                                          16, 'm²',   9,          'new',      true),
    (12, 'Kitchen',     'Painting',   'Prime and paint kitchen walls',                                  16, 'm²',   5,          'new',      true),
    (13, 'Kitchen',     'Electrical', 'Install electrical panel and kitchen circuit',                    1, 'set', 420,          'pending',  true),
    (14, 'Kitchen',     'Tiling',     'Tile kitchen backsplash',                                         5, 'm²',  24,          'new',      false),
    (15, 'Living room', 'Plastering', 'Skim coat living room walls',                                    22, 'm²',   8,          'approved', true),
    (16, 'Living room', 'Electrical', 'Add outlets and ceiling light wiring',                            1, 'set', 210,          'new',      true),
    (17, 'Living room', 'Painting',   'Two-coat paint, living room walls and ceiling',                  22, 'm²',   6,          'pending',  true),
    (18, 'Living room', 'Cleaning',   'Post-paint cleanup and floor protection removal',                 1, 'set',  45,          'new',      true),
    (19, 'Balcony',     'Demolition', 'Remove old balcony railing',                                      1, 'set',  90,          'new',      false),
    (20, 'Balcony',     'Painting',   'Weatherproof paint for balcony walls',                            6, 'm²',   7,          'new',      false),
    (21, NULL,          NULL,         'Order dumpster rental for debris removal',                        1, 'set', 180,          'new',      false),
    (22, NULL,          NULL,         'Submit renovation permit paperwork',                              1, 'set',   0,          'approved', false),
    (23, NULL,          NULL,         'Coordinate building inspector visit',                             1, 'set',   0,          'pending',  false),
    (24, NULL,          NULL,         'Schedule final walkthrough with client',                          1, 'set',   0,          'new',      false)
),
ins AS (
  INSERT INTO tasks (project_id, zone, stage, text, quantity, unit, cost, currency, status, priority, worker_id, start_date, deadline)
  SELECT
    (SELECT id FROM _demo_project),
    td.zone, td.stage, td.text, td.qty, td.unit, td.qty * td.unit_price, 'USD', td.status, 'normal',
    CASE WHEN td.assign THEN
      (SELECT w.id FROM _demo_workers w WHERE w.rn = (td.idx % GREATEST((SELECT count(*) FROM _demo_workers), 1)) + 1)
    ELSE NULL END,
    CURRENT_DATE - ((3 + td.idx % 10) || ' days')::interval,
    CURRENT_DATE + ((3 + td.idx % 12) || ' days')::interval
  FROM td
  RETURNING id, text
)
SELECT * FROM ins;

-- ── 5. Materials — 10 items, 3 open shortages ──────────────────────────────
INSERT INTO materials (foreman_id, project_id, name, qty, unit, status, reported_by, reported_by_id, purchased_at)
SELECT '906c78be-4cae-4b64-a6ba-02008469363c', (SELECT id FROM _demo_project), m.name, m.qty, m.unit, m.status,
       'Demo Foreman', '906c78be-4cae-4b64-a6ba-02008469363c',
       CASE WHEN m.status = 'purchased' THEN CURRENT_DATE - 4 ELSE NULL END
FROM (VALUES
  ('Cement bags, 50kg',    40::numeric, 'pcs', 'purchased'),
  ('Ceramic floor tiles',  20,          'm²',  'purchased'),
  ('Electrical outlets',   15,          'pcs', 'needed'),
  ('Circuit breaker panel', 1,          'pcs', 'needed'),
  ('Wall primer',          10,          'l',   'purchased'),
  ('Interior paint, white', 25,         'l',   'purchased'),
  ('PVC piping',           12,          'm',   'purchased'),
  ('Tile grout',            8,          'kg',  'needed'),
  ('Drywall sheets',       18,          'pcs', 'purchased'),
  ('Silicone sealant',      6,          'pcs', 'purchased')
) AS m(name, qty, unit, status);

-- Requests from workers (only if you have any workers to attribute them to)
INSERT INTO material_requests (project_id, worker_id, worker_name, name, qty, unit, status)
SELECT (SELECT id FROM _demo_project),
       (SELECT w.id   FROM _demo_workers w WHERE w.rn = (r.idx % GREATEST((SELECT count(*) FROM _demo_workers), 1)) + 1),
       (SELECT w.name FROM _demo_workers w WHERE w.rn = (r.idx % GREATEST((SELECT count(*) FROM _demo_workers), 1)) + 1),
       r.name, r.qty, r.unit, 'open'
FROM (VALUES (0, 'More tile grout', 5::numeric, 'kg'), (1, 'Extra electrical outlets', 6, 'pcs')) AS r(idx, name, qty, unit)
WHERE EXISTS (SELECT 1 FROM _demo_workers);

-- ── 6. Tools — assigned round-robin to real workers, if any ───────────────
INSERT INTO tools (name, status, foreman_id, project_id, worker_id)
SELECT t.name, 'active', '906c78be-4cae-4b64-a6ba-02008469363c', (SELECT id FROM _demo_project),
       (SELECT w.id FROM _demo_workers w WHERE w.rn = (t.idx % GREATEST((SELECT count(*) FROM _demo_workers), 1)) + 1)
FROM (VALUES (0,'Concrete mixer'), (1,'Tile cutter'), (2,'Laser level'), (3,'Cordless drill')) AS t(idx, name);

-- ── 7. Expenses — 8 rows across categories, spread over the last few weeks ─
INSERT INTO expenses (project_id, foreman_id, title, amount, currency, category, date)
SELECT (SELECT id FROM _demo_project), '906c78be-4cae-4b64-a6ba-02008469363c', e.title, e.amount, 'USD', e.category, CURRENT_DATE - e.days_back
FROM (VALUES
  ('Cement and tiling supplies',    640::numeric, 'materials', 18),
  ('Electrical panel and wiring',   480,          'materials', 12),
  ('Demolition crew, 2 days',       520,          'labor',     22),
  ('Dumpster rental',               210,          'equipment', 20),
  ('Tile cutter rental',             85,          'equipment',  9),
  ('Material delivery truck',        95,          'transport', 15),
  ('Paint and primer',              260,          'materials',  6),
  ('Miscellaneous site supplies',    70,          'other',      3)
) AS e(title, amount, category, days_back);

-- ── 8. Attendance + work log hours for the last 5 workdays (real workers only) ─
INSERT INTO attendance (foreman_id, worker_id, date, status, arrived_at)
SELECT '906c78be-4cae-4b64-a6ba-02008469363c', w.id, d.day,
       CASE WHEN ((d.di + w.rn) % 7) = 6 THEN 'absent' WHEN ((d.di + w.rn) % 7) = 5 THEN 'sick' ELSE 'present' END,
       CASE WHEN ((d.di + w.rn) % 7) < 5 THEN '08:00'::time ELSE NULL END
FROM _demo_workers w
CROSS JOIN LATERAL (
  SELECT gs AS di, (CURRENT_DATE - gs)::date AS day
  FROM generate_series(0, 20) gs
  WHERE EXTRACT(ISODOW FROM (CURRENT_DATE - gs)) < 6
  ORDER BY gs LIMIT 5
) d
ON CONFLICT (worker_id, date) DO NOTHING;

INSERT INTO work_logs (worker_id, project_id, log_date, log_type, value, rate, created_by)
SELECT w.id, (SELECT id FROM _demo_project), d.day, 'hours', 8, 22, '906c78be-4cae-4b64-a6ba-02008469363c'
FROM _demo_workers w
CROSS JOIN LATERAL (
  SELECT gs AS di, (CURRENT_DATE - gs)::date AS day
  FROM generate_series(0, 20) gs
  WHERE EXTRACT(ISODOW FROM (CURRENT_DATE - gs)) < 6
  ORDER BY gs LIMIT 5
) d
WHERE ((d.di + w.rn) % 2) = 0;

-- ── 9. Comments — a few per notable task ───────────────────────────────────
INSERT INTO task_comments (task_id, author_id, author_name, text)
SELECT dt.id, '906c78be-4cae-4b64-a6ba-02008469363c', 'Demo Foreman', c.text
FROM (VALUES
  ('Run wiring for hallway outlets and light switch', 'Panel is in, running the circuits to the outlets today.'),
  ('Run wiring for hallway outlets and light switch', 'Great — let me know when it is ready for inspection.'),
  ('Waterproof and plaster bathroom walls',            'Waterproofing done, plaster going on tomorrow.'),
  ('Tile bathroom floor',                              'Floor tile is set, grouting tomorrow morning.'),
  ('Prime and paint kitchen walls',                    'First coat of primer on, will need a second pass.'),
  ('Add outlets and ceiling light wiring',              'Ceiling wiring is trickier than expected, might need another day.'),
  ('Submit renovation permit paperwork',                'Permit submitted, waiting on the city for approval.')
) AS c(task_text, text)
JOIN _demo_tasks dt ON dt.text = c.task_text;

-- ── Summary ──────────────────────────────────────────────────────────────
SELECT
  (SELECT id FROM _demo_project)          AS project_id,
  (SELECT count(*) FROM _demo_tasks)      AS tasks_created,
  (SELECT count(*) FROM _demo_workers)    AS real_workers_found;

COMMIT;
