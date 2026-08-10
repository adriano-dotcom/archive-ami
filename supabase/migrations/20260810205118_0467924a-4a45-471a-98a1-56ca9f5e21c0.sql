-- 1. Merge duplicate active conversations into the oldest one per contact
WITH ranked AS (
  SELECT id, contact_id,
         first_value(id) OVER (PARTITION BY contact_id ORDER BY created_at) AS keep_id
  FROM public.conversations
  WHERE is_active = true AND contact_id IS NOT NULL
),
dups AS (
  SELECT id, keep_id FROM ranked WHERE id <> keep_id
)
UPDATE public.messages m
SET conversation_id = d.keep_id
FROM dups d
WHERE m.conversation_id = d.id;

WITH ranked AS (
  SELECT id, contact_id,
         first_value(id) OVER (PARTITION BY contact_id ORDER BY created_at) AS keep_id
  FROM public.conversations
  WHERE is_active = true AND contact_id IS NOT NULL
),
dups AS (
  SELECT id, keep_id FROM ranked WHERE id <> keep_id
)
UPDATE public.call_logs c
SET conversation_id = d.keep_id
FROM dups d
WHERE c.conversation_id = d.id;

WITH ranked AS (
  SELECT id, contact_id,
         first_value(id) OVER (PARTITION BY contact_id ORDER BY created_at) AS keep_id
  FROM public.conversations
  WHERE is_active = true AND contact_id IS NOT NULL
),
dups AS (
  SELECT id, keep_id FROM ranked WHERE id <> keep_id
)
UPDATE public.whatsapp_calls c
SET conversation_id = d.keep_id
FROM dups d
WHERE c.conversation_id = d.id;

-- Carry over the freshest WhatsApp window / last message to the surviving conversation
WITH ranked AS (
  SELECT id, contact_id, whatsapp_window_start, last_message_at,
         first_value(id) OVER (PARTITION BY contact_id ORDER BY created_at) AS keep_id
  FROM public.conversations
  WHERE is_active = true AND contact_id IS NOT NULL
),
agg AS (
  SELECT keep_id,
         max(whatsapp_window_start) AS win,
         max(last_message_at) AS lastmsg
  FROM ranked
  GROUP BY keep_id
  HAVING count(*) > 1
)
UPDATE public.conversations c
SET whatsapp_window_start = GREATEST(COALESCE(c.whatsapp_window_start, a.win), COALESCE(a.win, c.whatsapp_window_start)),
    last_message_at = GREATEST(COALESCE(c.last_message_at, a.lastmsg), COALESCE(a.lastmsg, c.last_message_at)),
    updated_at = now()
FROM agg a
WHERE c.id = a.keep_id;

-- Deactivate the duplicates
WITH ranked AS (
  SELECT id, contact_id,
         first_value(id) OVER (PARTITION BY contact_id ORDER BY created_at) AS keep_id
  FROM public.conversations
  WHERE is_active = true AND contact_id IS NOT NULL
)
UPDATE public.conversations c
SET is_active = false, status = 'closed', updated_at = now()
FROM ranked r
WHERE c.id = r.id AND r.id <> r.keep_id;

-- 2. Prevent more than one active conversation per contact
CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_active_per_contact
  ON public.conversations (contact_id)
  WHERE is_active AND contact_id IS NOT NULL;

-- 3. Atomic get-or-create
CREATE OR REPLACE FUNCTION public.get_or_create_active_conversation(
  p_contact_id uuid,
  p_status text DEFAULT 'nina',
  p_touch_window boolean DEFAULT true
)
RETURNS public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  conv public.conversations;
BEGIN
  -- Try to grab the active conversation with a row lock
  SELECT * INTO conv
  FROM public.conversations
  WHERE contact_id = p_contact_id AND is_active = true
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF p_touch_window THEN
      UPDATE public.conversations
      SET whatsapp_window_start = now(),
          last_message_at = now(),
          updated_at = now()
      WHERE id = conv.id
      RETURNING * INTO conv;
    END IF;
    RETURN conv;
  END IF;

  -- Reactivate the most recent inactive conversation, keeping history
  SELECT * INTO conv
  FROM public.conversations
  WHERE contact_id = p_contact_id AND is_active = false
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    BEGIN
      UPDATE public.conversations
      SET is_active = true,
          status = COALESCE(p_status, status)::conversation_status,
          whatsapp_window_start = now(),
          last_message_at = now(),
          updated_at = now()
      WHERE id = conv.id
      RETURNING * INTO conv;
      RETURN conv;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO conv
      FROM public.conversations
      WHERE contact_id = p_contact_id AND is_active = true
      ORDER BY created_at
      LIMIT 1;
      RETURN conv;
    END;
  END IF;

  -- Nothing exists: create
  BEGIN
    INSERT INTO public.conversations (contact_id, status, is_active, whatsapp_window_start, last_message_at)
    VALUES (p_contact_id, COALESCE(p_status, 'nina')::conversation_status, true, now(), now())
    RETURNING * INTO conv;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO conv
    FROM public.conversations
    WHERE contact_id = p_contact_id AND is_active = true
    ORDER BY created_at
    LIMIT 1;
  END;

  RETURN conv;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_active_conversation(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, text, boolean) TO authenticated, service_role;