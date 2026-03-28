
-- View 1: orbe_support_tickets_v
CREATE OR REPLACE VIEW public.orbe_support_tickets_v AS
SELECT
  c.id,
  c.created_at,
  c.updated_at,
  CASE c.status
    WHEN 'nina' THEN 'open'
    WHEN 'human' THEN 'open'
    WHEN 'paused' THEN 'pending'
    WHEN 'closed' THEN 'closed'
    ELSE c.status::text
  END AS status,
  'whatsapp' AS channel,
  ct.name AS customer_name,
  ct.phone_number AS customer_phone,
  ct.email AS customer_email,
  COALESCE(c.assigned_user_name, 'Nina (IA)') AS assigned_to,
  c.last_message_at,
  (
    SELECT m.from_type::text
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.sent_at DESC
    LIMIT 1
  ) AS last_message_from,
  (
    SELECT COUNT(*)::int
    FROM messages m
    WHERE m.conversation_id = c.id
      AND m.from_type = 'user'
      AND m.read_at IS NULL
  ) AS unread_count,
  c.tags,
  CASE
    WHEN c.last_message_at < now() - interval '48 hours' AND c.status != 'closed' THEN 'high'
    WHEN c.last_message_at < now() - interval '24 hours' AND c.status != 'closed' THEN 'medium'
    ELSE 'low'
  END AS priority
FROM conversations c
JOIN contacts ct ON ct.id = c.contact_id;

-- View 2: orbe_support_daily_metrics_v
CREATE OR REPLACE VIEW public.orbe_support_daily_metrics_v AS
WITH today AS (
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS date_local
),
sla_check AS (
  SELECT c.id
  FROM conversations c
  WHERE c.status IN ('nina', 'human', 'paused')
    AND c.last_message_at < now() - interval '24 hours'
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = c.id
        AND m.from_type = 'user'
        AND m.sent_at > c.last_message_at - interval '1 second'
      ORDER BY m.sent_at DESC
      LIMIT 1
    )
),
waiting_customer AS (
  SELECT c.id
  FROM conversations c
  WHERE c.status IN ('nina', 'human', 'paused')
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.sent_at DESC
      LIMIT 1
    )
    AND (
      SELECT m.from_type FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.sent_at DESC
      LIMIT 1
    ) IN ('nina', 'human')
)
SELECT
  t.date_local,
  (SELECT COUNT(*)::int FROM conversations WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = t.date_local) AS tickets_new_today,
  (SELECT COUNT(*)::int FROM conversations WHERE status IN ('nina', 'human')) AS tickets_open_now,
  (SELECT COUNT(*)::int FROM conversations WHERE status = 'paused') AS tickets_pending_now,
  (SELECT COUNT(*)::int FROM conversations WHERE status = 'closed' AND (updated_at AT TIME ZONE 'America/Sao_Paulo')::date = t.date_local) AS tickets_closed_today,
  (SELECT COUNT(*)::int FROM sla_check) AS tickets_sla_over_24h,
  (SELECT COUNT(*)::int FROM waiting_customer) AS tickets_waiting_customer,
  (
    SELECT jsonb_object_agg(
      CASE s
        WHEN 'nina' THEN 'open_nina'
        WHEN 'human' THEN 'open_human'
        WHEN 'paused' THEN 'pending'
        WHEN 'closed' THEN 'closed'
        ELSE s::text
      END,
      cnt
    )
    FROM (
      SELECT status::text AS s, COUNT(*)::int AS cnt
      FROM conversations
      GROUP BY status
    ) sub
  ) AS by_status_json,
  (
    SELECT jsonb_object_agg(COALESCE(assigned_user_name, 'Nina (IA)'), cnt)
    FROM (
      SELECT assigned_user_name, COUNT(*)::int AS cnt
      FROM conversations
      WHERE status IN ('nina', 'human', 'paused')
      GROUP BY assigned_user_name
    ) sub
  ) AS by_assigned_to_json
FROM today t;

-- View 3: orbe_support_weekly_metrics_v
CREATE OR REPLACE VIEW public.orbe_support_weekly_metrics_v AS
WITH week_range AS (
  SELECT
    ((now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '6 days')::date AS week_start,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date AS week_end
),
sla_check AS (
  SELECT c.id
  FROM conversations c
  WHERE c.status IN ('nina', 'human', 'paused')
    AND c.last_message_at < now() - interval '24 hours'
),
waiting_customer AS (
  SELECT c.id
  FROM conversations c
  WHERE c.status IN ('nina', 'human', 'paused')
    AND (
      SELECT m.from_type FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.sent_at DESC
      LIMIT 1
    ) IN ('nina', 'human')
)
SELECT
  w.week_start || ' a ' || w.week_end AS date_range,
  (SELECT COUNT(*)::int FROM conversations WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN w.week_start AND w.week_end) AS tickets_new_week,
  (SELECT COUNT(*)::int FROM conversations WHERE status IN ('nina', 'human')) AS tickets_open_now,
  (SELECT COUNT(*)::int FROM conversations WHERE status = 'paused') AS tickets_pending_now,
  (SELECT COUNT(*)::int FROM conversations WHERE status = 'closed' AND (updated_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN w.week_start AND w.week_end) AS tickets_closed_week,
  (SELECT COUNT(*)::int FROM sla_check) AS tickets_sla_over_24h,
  (SELECT COUNT(*)::int FROM waiting_customer) AS tickets_waiting_customer,
  (
    SELECT jsonb_object_agg(
      CASE s
        WHEN 'nina' THEN 'open_nina'
        WHEN 'human' THEN 'open_human'
        WHEN 'paused' THEN 'pending'
        WHEN 'closed' THEN 'closed'
        ELSE s::text
      END,
      cnt
    )
    FROM (
      SELECT status::text AS s, COUNT(*)::int AS cnt
      FROM conversations
      WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN w.week_start AND w.week_end
         OR status IN ('nina', 'human', 'paused')
      GROUP BY status
    ) sub
  ) AS by_status_json,
  (
    SELECT jsonb_object_agg(COALESCE(assigned_user_name, 'Nina (IA)'), cnt)
    FROM (
      SELECT assigned_user_name, COUNT(*)::int AS cnt
      FROM conversations
      WHERE status IN ('nina', 'human', 'paused')
      GROUP BY assigned_user_name
    ) sub
  ) AS by_assigned_to_json
FROM week_range w;
