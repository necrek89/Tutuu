-- Monthly AI spend per user (micro-dollars), used by the assistant/transcribe
-- edge functions to enforce a per-plan budget. Only the service role touches it.
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id    uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month      text    NOT NULL,              -- 'YYYY-MM'
  cost_micro bigint  NOT NULL DEFAULT 0,    -- 1_000_000 = $1
  requests   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

-- RLS on with no policies: the anon/authenticated roles cannot read or write.
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION ai_add_usage(p_user uuid, p_month text, p_cost bigint)
RETURNS bigint
LANGUAGE sql
AS $$
  INSERT INTO ai_usage (user_id, month, cost_micro, requests)
  VALUES (p_user, p_month, p_cost, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET cost_micro = ai_usage.cost_micro + EXCLUDED.cost_micro,
                requests   = ai_usage.requests + 1
  RETURNING cost_micro;
$$;

REVOKE ALL ON FUNCTION ai_add_usage(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
