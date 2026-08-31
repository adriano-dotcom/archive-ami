CREATE OR REPLACE FUNCTION public.get_or_create_active_conversation(p_contact_id uuid, p_status text DEFAULT 'nina'::text, p_touch_window boolean DEFAULT true)
 RETURNS conversations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  conv public.conversations;
BEGIN
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
          status = COALESCE(p_status::public.conversation_status, status),
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

  BEGIN
    INSERT INTO public.conversations (contact_id, status, is_active, whatsapp_window_start, last_message_at)
    VALUES (p_contact_id, COALESCE(p_status, 'nina')::public.conversation_status, true, now(), now())
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
$function$;