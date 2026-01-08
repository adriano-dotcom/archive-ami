CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'operator',
    'viewer'
);


--
-- Name: appointment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.appointment_type AS ENUM (
    'demo',
    'meeting',
    'support',
    'followup'
);


--
-- Name: conversation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.conversation_status AS ENUM (
    'nina',
    'human',
    'paused',
    'closed'
);


--
-- Name: member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.member_role AS ENUM (
    'admin',
    'manager',
    'agent'
);


--
-- Name: member_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.member_status AS ENUM (
    'active',
    'invited',
    'disabled'
);


--
-- Name: message_from; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_from AS ENUM (
    'user',
    'nina',
    'human'
);


--
-- Name: message_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_status AS ENUM (
    'sent',
    'delivered',
    'read',
    'failed',
    'processing'
);


--
-- Name: message_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_type AS ENUM (
    'text',
    'audio',
    'image',
    'document',
    'video'
);


--
-- Name: queue_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.queue_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


--
-- Name: team_assignment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.team_assignment AS ENUM (
    'mateus',
    'igor',
    'fe',
    'vendas',
    'suporte'
);


SET default_table_access_method = heap;

--
-- Name: message_processing_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_processing_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    whatsapp_message_id text NOT NULL,
    phone_number_id text NOT NULL,
    raw_data jsonb NOT NULL,
    status public.queue_status DEFAULT 'pending'::public.queue_status NOT NULL,
    priority integer DEFAULT 1 NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    error_message text,
    scheduled_for timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: claim_message_processing_batch(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_message_processing_batch(p_limit integer DEFAULT 50) RETURNS SETOF public.message_processing_queue
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.message_processing_queue
        WHERE status = 'pending'
          AND (scheduled_for IS NULL OR scheduled_for <= now())
        ORDER BY priority DESC, scheduled_for ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.message_processing_queue m
    SET status = 'processing', updated_at = now()
    WHERE m.id IN (SELECT id FROM cte)
    RETURNING m.*;
END;
$$;


--
-- Name: nina_processing_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nina_processing_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    context_data jsonb,
    status public.queue_status DEFAULT 'pending'::public.queue_status NOT NULL,
    priority integer DEFAULT 1 NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    error_message text,
    scheduled_for timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: claim_nina_processing_batch(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_nina_processing_batch(p_limit integer DEFAULT 50) RETURNS SETOF public.nina_processing_queue
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.nina_processing_queue
        WHERE status = 'pending'
          AND (scheduled_for IS NULL OR scheduled_for <= now())
        ORDER BY priority DESC, scheduled_for ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.nina_processing_queue n
    SET status = 'processing', updated_at = now()
    WHERE n.id IN (SELECT id FROM cte)
    RETURNING n.*;
END;
$$;


--
-- Name: send_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.send_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    from_type text DEFAULT 'nina'::text NOT NULL,
    content text,
    media_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    status public.queue_status DEFAULT 'pending'::public.queue_status NOT NULL,
    priority integer DEFAULT 1 NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    error_message text,
    scheduled_at timestamp with time zone DEFAULT now(),
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    message_id uuid
);


--
-- Name: claim_send_queue_batch(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_send_queue_batch(p_limit integer DEFAULT 10) RETURNS SETOF public.send_queue
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.send_queue
        WHERE status = 'pending'
          AND (scheduled_at IS NULL OR scheduled_at <= now())
        ORDER BY priority DESC, scheduled_at ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.send_queue s
    SET status = 'processing', updated_at = now()
    WHERE s.id IN (SELECT id FROM cte)
    RETURNING s.*;
END;
$$;


--
-- Name: cleanup_processed_message_queue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_processed_message_queue() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    DELETE FROM public.message_grouping_queue 
    WHERE processed = true AND created_at < now() - interval '1 hour';
END;
$$;


--
-- Name: cleanup_processed_queues(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_processed_queues() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    DELETE FROM public.message_processing_queue 
    WHERE status = 'completed' AND processed_at < now() - interval '24 hours';
    
    DELETE FROM public.nina_processing_queue 
    WHERE status = 'completed' AND processed_at < now() - interval '24 hours';
    
    DELETE FROM public.send_queue 
    WHERE status = 'completed' AND sent_at < now() - interval '24 hours';
    
    DELETE FROM public.message_processing_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
    
    DELETE FROM public.nina_processing_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
    
    DELETE FROM public.send_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
END;
$$;


--
-- Name: create_deal_for_new_contact(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_deal_for_new_contact() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  first_stage_id UUID;
  default_pipeline_id UUID;
  default_agent_id UUID;
  default_owner_id UUID;
BEGIN
  -- Buscar agente default e seu pipeline
  SELECT a.id, p.id INTO default_agent_id, default_pipeline_id
  FROM public.agents a
  LEFT JOIN public.pipelines p ON p.agent_id = a.id AND p.is_active = true
  WHERE a.is_default = true AND a.is_active = true
  LIMIT 1;
  
  -- Buscar primeiro estágio do pipeline
  SELECT id INTO first_stage_id 
  FROM public.pipeline_stages 
  WHERE pipeline_id = default_pipeline_id AND is_active = true 
  ORDER BY position 
  LIMIT 1;
  
  -- Fallback se não encontrar estágio
  IF first_stage_id IS NULL THEN
    SELECT id INTO first_stage_id 
    FROM public.pipeline_stages 
    WHERE is_active = true 
    ORDER BY position 
    LIMIT 1;
  END IF;
  
  IF first_stage_id IS NULL THEN
    RAISE NOTICE 'No pipeline stages found, skipping deal creation for contact %', NEW.id;
    RETURN NEW;
  END IF;
  
  -- Obter próximo responsável usando a função de distribuição
  IF default_agent_id IS NOT NULL THEN
    SELECT get_next_deal_owner(default_agent_id) INTO default_owner_id;
  END IF;
  
  INSERT INTO deals (contact_id, title, stage, stage_id, pipeline_id, priority, owner_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.name, NEW.call_name, 'Novo Lead'),
    'new',
    first_stage_id,
    default_pipeline_id,
    'medium',
    default_owner_id
  );
  
  RETURN NEW;
END;
$$;


--
-- Name: delete_vault_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_vault_secret(secret_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = secret_name;
  RETURN FOUND;
END;
$$;


--
-- Name: get_next_deal_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_deal_owner(p_agent_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  agent_record RECORD;
  next_owner_id UUID;
  current_index INT;
BEGIN
  SELECT * INTO agent_record FROM agents WHERE id = p_agent_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Tipo fixo: retorna default_owner_id
  IF agent_record.owner_distribution_type = 'fixed' THEN
    RETURN agent_record.default_owner_id;
  END IF;
  
  -- Tipo round_robin: encontra próximo na lista
  IF agent_record.owner_distribution_type = 'round_robin' THEN
    IF array_length(agent_record.owner_rotation_ids, 1) IS NULL OR array_length(agent_record.owner_rotation_ids, 1) = 0 THEN
      RETURN agent_record.default_owner_id;
    END IF;
    
    IF agent_record.last_assigned_owner_id IS NULL THEN
      -- Primeiro da lista
      next_owner_id := agent_record.owner_rotation_ids[1];
    ELSE
      -- Encontrar índice atual e pegar próximo
      SELECT array_position(agent_record.owner_rotation_ids, agent_record.last_assigned_owner_id) INTO current_index;
      IF current_index IS NULL OR current_index >= array_length(agent_record.owner_rotation_ids, 1) THEN
        next_owner_id := agent_record.owner_rotation_ids[1];
      ELSE
        next_owner_id := agent_record.owner_rotation_ids[current_index + 1];
      END IF;
    END IF;
    
    -- Atualizar último atribuído
    UPDATE agents SET last_assigned_owner_id = next_owner_id WHERE id = p_agent_id;
    RETURN next_owner_id;
  END IF;
  
  RETURN NULL;
END;
$$;


--
-- Name: conversation_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    current_state text DEFAULT 'idle'::text NOT NULL,
    last_action text,
    last_action_at timestamp with time zone,
    scheduling_context jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: get_or_create_conversation_state(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_or_create_conversation_state(p_conversation_id uuid) RETURNS public.conversation_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    state_record public.conversation_states;
BEGIN
    SELECT * INTO state_record
    FROM public.conversation_states
    WHERE conversation_id = p_conversation_id;
    
    IF NOT FOUND THEN
        INSERT INTO public.conversation_states (conversation_id, current_state)
        VALUES (p_conversation_id, 'idle')
        RETURNING * INTO state_record;
    END IF;
    
    RETURN state_record;
END;
$$;


--
-- Name: get_vault_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vault_secret(secret_name text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE 
  decrypted text;
BEGIN
  SELECT decrypted_secret INTO decrypted
  FROM vault.decrypted_secrets 
  WHERE name = secret_name;
  
  RETURN decrypted;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  user_count INTEGER;
  assigned_role app_role;
  invite_record RECORD;
BEGIN
  -- Verificar se existe convite pendente para este email
  SELECT * INTO invite_record 
  FROM pending_invites 
  WHERE email = new.email 
    AND expires_at > now();
  
  IF FOUND THEN
    -- Usar role do convite
    assigned_role := invite_record.app_role;
    
    -- Atualizar team_member para ativo
    IF invite_record.team_member_id IS NOT NULL THEN
      UPDATE team_members 
      SET status = 'active' 
      WHERE id = invite_record.team_member_id;
    END IF;
    
    -- Remover convite usado
    DELETE FROM pending_invites WHERE id = invite_record.id;
  ELSE
    -- Comportamento padrão: primeiro=admin, demais=operator
    SELECT COUNT(*) INTO user_count FROM user_roles;
    IF user_count = 0 THEN
      assigned_role := 'admin';
    ELSE
      assigned_role := 'operator';
    END IF;
  END IF;
  
  INSERT INTO user_roles (user_id, role)
  VALUES (new.id, assigned_role);
  
  RETURN new;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: has_vault_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_vault_secret(secret_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE 
  exists_flag boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM vault.secrets WHERE name = secret_name
  ) INTO exists_flag;
  
  RETURN exists_flag;
END;
$$;


--
-- Name: is_authenticated_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_authenticated_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
  )
$$;


--
-- Name: is_whatsapp_window_open(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_whatsapp_window_open(p_conversation_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  window_start timestamp with time zone;
BEGIN
  SELECT whatsapp_window_start INTO window_start
  FROM public.conversations
  WHERE id = p_conversation_id;
  
  -- Window is open if window_start exists AND less than 24h have passed
  IF window_start IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN (now() < window_start + interval '24 hours');
END;
$$;


--
-- Name: set_vault_secret(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_vault_secret(secret_name text, secret_value text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE 
  secret_id uuid;
  existing_id uuid;
BEGIN
  -- Verificar se já existe
  SELECT id INTO existing_id
  FROM vault.secrets 
  WHERE name = secret_name;
  
  IF existing_id IS NOT NULL THEN
    -- Atualizar secret existente
    UPDATE vault.secrets 
    SET secret = secret_value,
        updated_at = now()
    WHERE id = existing_id;
    RETURN existing_id;
  ELSE
    -- Criar novo secret
    INSERT INTO vault.secrets (name, secret)
    VALUES (secret_name, secret_value)
    RETURNING id INTO secret_id;
    RETURN secret_id;
  END IF;
END;
$$;


--
-- Name: update_client_memory(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_client_memory(p_contact_id uuid, p_new_memory jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
    UPDATE public.contacts 
    SET client_memory = p_new_memory, updated_at = now()
    WHERE id = p_contact_id;
END;
$$;


--
-- Name: update_conversation_last_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_conversation_last_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
    UPDATE public.conversations 
    SET last_message_at = NEW.sent_at
    WHERE id = NEW.conversation_id;
    
    UPDATE public.contacts 
    SET last_activity = NEW.sent_at
    WHERE id = (
        SELECT contact_id 
        FROM public.conversations 
        WHERE id = NEW.conversation_id
    );
    
    RETURN NEW;
END;
$$;


--
-- Name: update_conversation_state(uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_conversation_state(p_conversation_id uuid, p_new_state text, p_action text DEFAULT NULL::text, p_context jsonb DEFAULT NULL::jsonb) RETURNS public.conversation_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    state_record public.conversation_states;
BEGIN
    INSERT INTO public.conversation_states (
        conversation_id, current_state, last_action, last_action_at, scheduling_context
    )
    VALUES (
        p_conversation_id, p_new_state, p_action, now(), COALESCE(p_context, '{}')
    )
    ON CONFLICT (conversation_id) 
    DO UPDATE SET
        current_state = EXCLUDED.current_state,
        last_action = EXCLUDED.last_action,
        last_action_at = EXCLUDED.last_action_at,
        scheduling_context = CASE 
            WHEN EXCLUDED.scheduling_context = '{}' THEN conversation_states.scheduling_context
            ELSE EXCLUDED.scheduling_context
        END,
        updated_at = now()
    RETURNING * INTO state_record;
    
    RETURN state_record;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_whatsapp_window(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_whatsapp_window() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_window_start timestamp with time zone;
BEGIN
  -- Only process if message is from client (user)
  IF NEW.from_type != 'user' THEN
    RETURN NEW;
  END IF;
  
  -- Get current window start
  SELECT whatsapp_window_start INTO current_window_start
  FROM public.conversations
  WHERE id = NEW.conversation_id;
  
  -- Only update window if:
  -- 1. Window never existed (NULL), OR
  -- 2. Window has expired (more than 24h passed)
  IF current_window_start IS NULL OR now() >= current_window_start + interval '24 hours' THEN
    UPDATE public.conversations
    SET whatsapp_window_start = now()
    WHERE id = NEW.conversation_id;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(50) NOT NULL,
    specialty character varying(100),
    description text,
    system_prompt text NOT NULL,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    detection_keywords text[] DEFAULT '{}'::text[],
    greeting_message text,
    handoff_message text,
    qualification_questions jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    audio_response_enabled boolean DEFAULT false,
    elevenlabs_voice_id character varying(255) DEFAULT NULL::character varying,
    elevenlabs_model text DEFAULT 'eleven_turbo_v2_5'::text,
    elevenlabs_stability numeric DEFAULT 0.75,
    elevenlabs_similarity_boost numeric DEFAULT 0.80,
    elevenlabs_style numeric DEFAULT 0.30,
    elevenlabs_speed numeric DEFAULT 1.0,
    elevenlabs_speaker_boost boolean DEFAULT true,
    cargo_focused_greeting text,
    owner_distribution_type text DEFAULT 'fixed'::text,
    default_owner_id uuid,
    owner_rotation_ids uuid[] DEFAULT '{}'::uuid[],
    last_assigned_owner_id uuid
);


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    date date NOT NULL,
    "time" time without time zone NOT NULL,
    duration integer DEFAULT 60 NOT NULL,
    type public.appointment_type DEFAULT 'meeting'::public.appointment_type NOT NULL,
    attendees text[] DEFAULT '{}'::text[],
    contact_id uuid,
    meeting_url text,
    status text DEFAULT 'scheduled'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: call_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    conversation_id uuid,
    extension text NOT NULL,
    phone_number text NOT NULL,
    status text DEFAULT 'dialing'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_seconds integer,
    hangup_cause text,
    record_url text,
    api4com_call_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    transcription text,
    transcription_status text
);


--
-- Name: callback_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.callback_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid,
    pipeline_id uuid,
    last_assigned_member_id uuid,
    assignment_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#3b82f6'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number text NOT NULL,
    whatsapp_id text,
    name text,
    call_name text,
    email text,
    profile_picture_url text,
    is_business boolean DEFAULT false,
    is_blocked boolean DEFAULT false,
    blocked_at timestamp with time zone,
    blocked_reason text,
    tags text[] DEFAULT '{}'::text[],
    notes text,
    client_memory jsonb DEFAULT '{"last_updated": null, "lead_profile": {"interests": [], "lead_stage": "new", "objections": [], "products_discussed": [], "communication_style": "unknown", "qualification_score": 0}, "sales_intelligence": {"pain_points": [], "next_best_action": "qualify", "budget_indication": "unknown", "decision_timeline": "unknown"}, "interaction_summary": {"response_pattern": "unknown", "last_contact_reason": "", "total_conversations": 0, "preferred_contact_time": "unknown"}, "conversation_history": []}'::jsonb,
    first_contact_date timestamp with time zone DEFAULT now() NOT NULL,
    last_activity timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company text,
    cnpj text,
    cep text,
    street text,
    number text,
    complement text,
    neighborhood text,
    city text,
    state text,
    pipedrive_person_id text,
    lead_source text DEFAULT 'inbound'::text,
    lead_status text DEFAULT 'new'::text,
    utm_source text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    fleet_size integer,
    campaign text,
    vertical text
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    status public.conversation_status DEFAULT 'nina'::public.conversation_status NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    assigned_team public.team_assignment,
    assigned_user_id uuid,
    tags text[] DEFAULT '{}'::text[],
    nina_context jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    current_agent_id uuid,
    whatsapp_window_start timestamp with time zone,
    assigned_user_name text
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    reply_to_id uuid,
    whatsapp_message_id text,
    type public.message_type DEFAULT 'text'::public.message_type NOT NULL,
    from_type public.message_from NOT NULL,
    content text,
    media_url text,
    media_type text,
    status public.message_status DEFAULT 'sent'::public.message_status NOT NULL,
    processed_by_nina boolean DEFAULT false,
    nina_response_time integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts_with_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.contacts_with_stats WITH (security_invoker='true') AS
 SELECT c.id,
    c.whatsapp_id,
    c.phone_number,
    c.name,
    c.call_name,
    c.email,
    c.profile_picture_url,
    c.is_business,
    c.is_blocked,
    c.blocked_at,
    c.blocked_reason,
    c.tags,
    c.notes,
    c.client_memory,
    c.first_contact_date,
    c.last_activity,
    c.created_at,
    c.updated_at,
    COALESCE(msg_stats.total_messages, (0)::bigint) AS total_messages,
    COALESCE(msg_stats.nina_messages, (0)::bigint) AS nina_messages,
    COALESCE(msg_stats.user_messages, (0)::bigint) AS user_messages,
    COALESCE(msg_stats.human_messages, (0)::bigint) AS human_messages
   FROM (public.contacts c
     LEFT JOIN ( SELECT conv.contact_id,
            count(m.id) AS total_messages,
            count(
                CASE
                    WHEN (m.from_type = 'nina'::public.message_from) THEN 1
                    ELSE NULL::integer
                END) AS nina_messages,
            count(
                CASE
                    WHEN (m.from_type = 'user'::public.message_from) THEN 1
                    ELSE NULL::integer
                END) AS user_messages,
            count(
                CASE
                    WHEN (m.from_type = 'human'::public.message_from) THEN 1
                    ELSE NULL::integer
                END) AS human_messages
           FROM (public.conversations conv
             JOIN public.messages m ON ((m.conversation_id = conv.id)))
          GROUP BY conv.contact_id) msg_stats ON ((msg_stats.contact_id = c.id)));


--
-- Name: deal_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    type text DEFAULT 'note'::text NOT NULL,
    title text NOT NULL,
    description text,
    scheduled_at timestamp with time zone,
    completed_at timestamp with time zone,
    is_completed boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT deal_activities_type_check CHECK ((type = ANY (ARRAY['note'::text, 'call'::text, 'email'::text, 'meeting'::text, 'task'::text])))
);


--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    title text NOT NULL,
    company text,
    value numeric DEFAULT 0,
    stage text DEFAULT 'new'::text,
    priority text DEFAULT 'medium'::text,
    tags text[] DEFAULT '{}'::text[],
    due_date date,
    owner_id uuid,
    notes text,
    lost_reason text,
    won_at timestamp with time zone,
    lost_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    stage_id uuid NOT NULL,
    pipeline_id uuid,
    pipedrive_deal_id text
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    body_html text NOT NULL,
    category text DEFAULT 'general'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: followup_automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followup_automations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    hours_without_response integer DEFAULT 24 NOT NULL,
    template_id uuid,
    template_variables jsonb DEFAULT '{}'::jsonb,
    conversation_statuses text[] DEFAULT '{nina,human}'::text[],
    pipeline_ids uuid[],
    tags text[],
    max_attempts integer DEFAULT 1,
    cooldown_hours integer DEFAULT 24,
    active_hours_start time without time zone DEFAULT '09:00:00'::time without time zone,
    active_hours_end time without time zone DEFAULT '18:00:00'::time without time zone,
    active_days integer[] DEFAULT '{1,2,3,4,5}'::integer[],
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    automation_type text DEFAULT 'template'::text NOT NULL,
    free_text_message text,
    within_window_only boolean DEFAULT false NOT NULL,
    time_unit text DEFAULT 'hours'::text NOT NULL,
    minutes_before_expiry integer DEFAULT 10,
    only_if_no_client_response boolean DEFAULT true,
    agent_messages jsonb DEFAULT '{}'::jsonb,
    messages_sequence jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT followup_automations_automation_type_check CHECK ((automation_type = ANY (ARRAY['template'::text, 'free_text'::text, 'window_expiring'::text]))),
    CONSTRAINT followup_automations_time_unit_check CHECK ((time_unit = ANY (ARRAY['hours'::text, 'minutes'::text])))
);


--
-- Name: followup_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followup_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    automation_id uuid,
    conversation_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    message_id uuid,
    template_name text,
    status text DEFAULT 'sent'::text,
    error_message text,
    hours_waited numeric,
    created_at timestamp with time zone DEFAULT now(),
    message_content text
);


--
-- Name: learning_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text DEFAULT 'prompt'::text NOT NULL,
    agent_id uuid,
    pipeline_id uuid,
    title text NOT NULL,
    description text NOT NULL,
    suggestion text,
    examples jsonb DEFAULT '[]'::jsonb,
    priority integer DEFAULT 2,
    impact text,
    occurrence_count integer DEFAULT 1,
    status text DEFAULT 'pending'::text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    applied_at timestamp with time zone,
    rejection_reason text,
    review_notes text,
    source_reports uuid[] DEFAULT '{}'::uuid[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT learning_insights_priority_check CHECK (((priority >= 1) AND (priority <= 3))),
    CONSTRAINT learning_insights_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewing'::text, 'applied'::text, 'rejected'::text])))
);


--
-- Name: message_grouping_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_grouping_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    whatsapp_message_id text NOT NULL,
    phone_number_id text NOT NULL,
    message_data jsonb NOT NULL,
    contacts_data jsonb,
    processed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nina_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nina_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    openai_api_key text,
    openai_model text DEFAULT 'gpt-4.1'::text NOT NULL,
    openai_assistant_id text DEFAULT 'asst_X8XSK8rxKOLieSVQwOcvQTdZ'::text NOT NULL,
    system_prompt_override text,
    test_system_prompt text,
    elevenlabs_api_key text,
    elevenlabs_voice_id text DEFAULT '9BWtsMINqrJLrRacOk9x'::text NOT NULL,
    elevenlabs_model text DEFAULT 'eleven_turbo_v2_5'::text,
    elevenlabs_stability numeric DEFAULT 0.75 NOT NULL,
    elevenlabs_similarity_boost numeric DEFAULT 0.80 NOT NULL,
    elevenlabs_style numeric DEFAULT 0.30 NOT NULL,
    elevenlabs_speaker_boost boolean DEFAULT true NOT NULL,
    elevenlabs_speed numeric DEFAULT 1.0,
    whatsapp_access_token text,
    whatsapp_phone_number_id text,
    whatsapp_verify_token text DEFAULT 'viver-de-ia-nina-webhook'::text,
    calcom_api_key text,
    auto_response_enabled boolean DEFAULT true NOT NULL,
    adaptive_response_enabled boolean DEFAULT true NOT NULL,
    message_breaking_enabled boolean DEFAULT true NOT NULL,
    response_delay_min integer DEFAULT 1000 NOT NULL,
    response_delay_max integer DEFAULT 3000 NOT NULL,
    timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
    business_hours_start time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    business_hours_end time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    business_days integer[] DEFAULT '{1,2,3,4,5}'::integer[] NOT NULL,
    async_booking_enabled boolean DEFAULT false,
    route_all_to_receiver_enabled boolean DEFAULT false NOT NULL,
    test_phone_numbers jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_name text,
    sdr_name text,
    ai_model_mode text DEFAULT 'flash'::text,
    audio_response_enabled boolean DEFAULT false,
    pipedrive_api_token text,
    pipedrive_domain text,
    pipedrive_enabled boolean DEFAULT false,
    pipedrive_min_score integer DEFAULT 70,
    pipedrive_default_pipeline_id text,
    pipedrive_field_mappings jsonb DEFAULT '{"deal_fields": {"notes": "notes", "title": "title", "value": "value"}, "custom_fields": [], "person_fields": {"name": "name", "email": "email", "company": "org_name", "phone_number": "phone"}}'::jsonb,
    api4com_api_token text,
    api4com_default_extension text DEFAULT '1000'::text,
    api4com_enabled boolean DEFAULT false,
    whatsapp_waba_id text,
    whatsapp_token_in_vault boolean DEFAULT false,
    elevenlabs_key_in_vault boolean DEFAULT false,
    pipedrive_token_in_vault boolean DEFAULT false,
    api4com_token_in_vault boolean DEFAULT false,
    calcom_key_in_vault boolean DEFAULT false,
    openai_key_in_vault boolean DEFAULT false,
    facebook_lead_template text DEFAULT 'lead_facebook_meta'::text,
    facebook_lead_email_template uuid,
    google_lead_template text DEFAULT 'lead_google_ads'::text,
    google_lead_email_template uuid,
    facebook_whatsapp_enabled boolean DEFAULT true,
    facebook_email_enabled boolean DEFAULT true,
    google_whatsapp_enabled boolean DEFAULT true,
    google_email_enabled boolean DEFAULT true,
    CONSTRAINT nina_settings_ai_model_mode_check CHECK ((ai_model_mode = ANY (ARRAY['flash'::text, 'pro'::text, 'pro3'::text, 'adaptive'::text])))
);


--
-- Name: pending_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    invited_by uuid,
    app_role public.app_role DEFAULT 'operator'::public.app_role NOT NULL,
    team_member_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval)
);


--
-- Name: pipeline_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    color text DEFAULT 'border-slate-500'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_system boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ai_trigger_criteria text,
    is_ai_managed boolean DEFAULT false,
    pipeline_id uuid,
    sync_to_pipedrive boolean DEFAULT false
);


--
-- Name: pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    agent_id uuid,
    color text DEFAULT '#3b82f6'::text,
    icon text DEFAULT '📋'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sales_coaching_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_coaching_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid,
    report_type text DEFAULT 'daily'::text NOT NULL,
    analysis_period_start timestamp with time zone,
    analysis_period_end timestamp with time zone,
    conversations_analyzed integer DEFAULT 0,
    calls_analyzed integer DEFAULT 0,
    human_interactions_analyzed integer DEFAULT 0,
    strengths jsonb DEFAULT '[]'::jsonb,
    improvement_areas jsonb DEFAULT '[]'::jsonb,
    recommended_actions jsonb DEFAULT '[]'::jsonb,
    prompt_suggestions text,
    good_examples jsonb DEFAULT '[]'::jsonb,
    bad_examples jsonb DEFAULT '[]'::jsonb,
    overall_score integer,
    qualification_effectiveness integer,
    objection_handling_score integer,
    closing_skills_score integer,
    generated_by text DEFAULT 'sales_manager_agent'::text,
    reviewed_by uuid,
    review_notes text,
    is_applied boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pipeline_id uuid,
    pipeline_name text,
    alert_sent boolean DEFAULT false,
    alert_sent_at timestamp with time zone,
    alert_recipients text[],
    prospecting_metrics jsonb DEFAULT '{}'::jsonb
);


--
-- Name: scheduled_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid,
    contact_id uuid,
    to_email text NOT NULL,
    subject text NOT NULL,
    body_html text NOT NULL,
    scheduled_for date NOT NULL,
    days_before_due integer DEFAULT 15,
    status text DEFAULT 'pending'::text,
    sent_at timestamp with time zone,
    error_message text,
    generated_by text DEFAULT 'ai'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tag_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tag_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    color text DEFAULT '#3b82f6'::text NOT NULL,
    category text DEFAULT 'custom'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: team_functions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_functions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    role public.member_role DEFAULT 'agent'::public.member_role NOT NULL,
    status public.member_status DEFAULT 'invited'::public.member_status NOT NULL,
    avatar text,
    team_id uuid,
    function_id uuid,
    weight integer DEFAULT 1,
    last_active timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    api4com_extension text
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#3b82f6'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pipeline_id uuid
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'operator'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meta_template_id text NOT NULL,
    name text NOT NULL,
    language text DEFAULT 'pt_BR'::text,
    category text,
    status text DEFAULT 'PENDING'::text,
    components jsonb DEFAULT '[]'::jsonb,
    example_values jsonb DEFAULT '{}'::jsonb,
    variables_count integer DEFAULT 0,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: agents agents_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_slug_key UNIQUE (slug);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: call_logs call_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_pkey PRIMARY KEY (id);


--
-- Name: callback_assignments callback_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.callback_assignments
    ADD CONSTRAINT callback_assignments_pkey PRIMARY KEY (id);


--
-- Name: callback_assignments callback_assignments_team_id_pipeline_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.callback_assignments
    ADD CONSTRAINT callback_assignments_team_id_pipeline_id_key UNIQUE (team_id, pipeline_id);


--
-- Name: campaigns campaigns_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_name_key UNIQUE (name);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_phone_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_phone_number_unique UNIQUE (phone_number);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: conversation_states conversation_states_conversation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_conversation_id_key UNIQUE (conversation_id);


--
-- Name: conversation_states conversation_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: deal_activities deal_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_activities
    ADD CONSTRAINT deal_activities_pkey PRIMARY KEY (id);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: followup_automations followup_automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_automations
    ADD CONSTRAINT followup_automations_pkey PRIMARY KEY (id);


--
-- Name: followup_logs followup_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_logs
    ADD CONSTRAINT followup_logs_pkey PRIMARY KEY (id);


--
-- Name: learning_insights learning_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_insights
    ADD CONSTRAINT learning_insights_pkey PRIMARY KEY (id);


--
-- Name: message_grouping_queue message_grouping_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_grouping_queue
    ADD CONSTRAINT message_grouping_queue_pkey PRIMARY KEY (id);


--
-- Name: message_processing_queue message_processing_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_processing_queue
    ADD CONSTRAINT message_processing_queue_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: nina_processing_queue nina_processing_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nina_processing_queue
    ADD CONSTRAINT nina_processing_queue_pkey PRIMARY KEY (id);


--
-- Name: nina_settings nina_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nina_settings
    ADD CONSTRAINT nina_settings_pkey PRIMARY KEY (id);


--
-- Name: pending_invites pending_invites_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_invites
    ADD CONSTRAINT pending_invites_email_unique UNIQUE (email);


--
-- Name: pending_invites pending_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_invites
    ADD CONSTRAINT pending_invites_pkey PRIMARY KEY (id);


--
-- Name: pipeline_stages pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: pipelines pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_pkey PRIMARY KEY (id);


--
-- Name: pipelines pipelines_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_slug_key UNIQUE (slug);


--
-- Name: sales_coaching_reports sales_coaching_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_coaching_reports
    ADD CONSTRAINT sales_coaching_reports_pkey PRIMARY KEY (id);


--
-- Name: scheduled_emails scheduled_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_emails
    ADD CONSTRAINT scheduled_emails_pkey PRIMARY KEY (id);


--
-- Name: send_queue send_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_queue
    ADD CONSTRAINT send_queue_pkey PRIMARY KEY (id);


--
-- Name: tag_definitions tag_definitions_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_definitions
    ADD CONSTRAINT tag_definitions_key_key UNIQUE (key);


--
-- Name: tag_definitions tag_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_definitions
    ADD CONSTRAINT tag_definitions_pkey PRIMARY KEY (id);


--
-- Name: team_functions team_functions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_functions
    ADD CONSTRAINT team_functions_name_key UNIQUE (name);


--
-- Name: team_functions team_functions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_functions
    ADD CONSTRAINT team_functions_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_email_key UNIQUE (email);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: teams teams_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_name_key UNIQUE (name);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: whatsapp_templates whatsapp_templates_meta_template_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_meta_template_id_key UNIQUE (meta_template_id);


--
-- Name: whatsapp_templates whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);


--
-- Name: contacts_whatsapp_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_whatsapp_id_unique ON public.contacts USING btree (whatsapp_id) WHERE (whatsapp_id IS NOT NULL);


--
-- Name: idx_call_logs_api4com_call_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_logs_api4com_call_id ON public.call_logs USING btree (api4com_call_id);


--
-- Name: idx_call_logs_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_logs_contact_id ON public.call_logs USING btree (contact_id);


--
-- Name: idx_call_logs_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_logs_conversation_id ON public.call_logs USING btree (conversation_id);


--
-- Name: idx_callback_assignments_pipeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_callback_assignments_pipeline ON public.callback_assignments USING btree (pipeline_id);


--
-- Name: idx_contacts_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_campaign ON public.contacts USING btree (campaign);


--
-- Name: idx_contacts_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_city ON public.contacts USING btree (city);


--
-- Name: idx_contacts_cnpj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_cnpj ON public.contacts USING btree (cnpj) WHERE (cnpj IS NOT NULL);


--
-- Name: idx_contacts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_company ON public.contacts USING btree (company) WHERE (company IS NOT NULL);


--
-- Name: idx_contacts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_created_at ON public.contacts USING btree (created_at DESC);


--
-- Name: idx_contacts_is_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_is_blocked ON public.contacts USING btree (is_blocked);


--
-- Name: idx_contacts_last_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_last_activity ON public.contacts USING btree (last_activity DESC);


--
-- Name: idx_contacts_phone_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_phone_number ON public.contacts USING btree (phone_number);


--
-- Name: idx_contacts_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_state ON public.contacts USING btree (state);


--
-- Name: idx_contacts_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_tags ON public.contacts USING gin (tags);


--
-- Name: idx_contacts_whatsapp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_whatsapp_id ON public.contacts USING btree (whatsapp_id);


--
-- Name: idx_conversation_states_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_states_conversation_id ON public.conversation_states USING btree (conversation_id);


--
-- Name: idx_conversation_states_current_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_states_current_state ON public.conversation_states USING btree (current_state);


--
-- Name: idx_conversations_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_contact_id ON public.conversations USING btree (contact_id);


--
-- Name: idx_conversations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_created_at ON public.conversations USING btree (created_at DESC);


--
-- Name: idx_conversations_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_is_active ON public.conversations USING btree (is_active);


--
-- Name: idx_conversations_last_message_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_last_message_at ON public.conversations USING btree (last_message_at DESC);


--
-- Name: idx_conversations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_status ON public.conversations USING btree (status);


--
-- Name: idx_conversations_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_tags ON public.conversations USING gin (tags);


--
-- Name: idx_deal_activities_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deal_activities_created_at ON public.deal_activities USING btree (created_at DESC);


--
-- Name: idx_deal_activities_deal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deal_activities_deal_id ON public.deal_activities USING btree (deal_id);


--
-- Name: idx_followup_logs_automation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followup_logs_automation_id ON public.followup_logs USING btree (automation_id);


--
-- Name: idx_followup_logs_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followup_logs_conversation_id ON public.followup_logs USING btree (conversation_id);


--
-- Name: idx_followup_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followup_logs_created_at ON public.followup_logs USING btree (created_at);


--
-- Name: idx_learning_insights_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_insights_agent ON public.learning_insights USING btree (agent_id);


--
-- Name: idx_learning_insights_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_insights_priority ON public.learning_insights USING btree (priority);


--
-- Name: idx_learning_insights_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_insights_status ON public.learning_insights USING btree (status);


--
-- Name: idx_message_grouping_queue_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_grouping_queue_created_at ON public.message_grouping_queue USING btree (created_at);


--
-- Name: idx_message_grouping_queue_phone_number_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_grouping_queue_phone_number_id ON public.message_grouping_queue USING btree (phone_number_id);


--
-- Name: idx_message_grouping_queue_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_grouping_queue_processed ON public.message_grouping_queue USING btree (processed);


--
-- Name: idx_message_processing_queue_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_processing_queue_priority ON public.message_processing_queue USING btree (priority DESC);


--
-- Name: idx_message_processing_queue_scheduled_for; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_processing_queue_scheduled_for ON public.message_processing_queue USING btree (scheduled_for);


--
-- Name: idx_message_processing_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_processing_queue_status ON public.message_processing_queue USING btree (status);


--
-- Name: idx_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);


--
-- Name: idx_messages_from_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_from_type ON public.messages USING btree (from_type);


--
-- Name: idx_messages_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sent_at ON public.messages USING btree (sent_at DESC);


--
-- Name: idx_messages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_status ON public.messages USING btree (status);


--
-- Name: idx_messages_whatsapp_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_whatsapp_message_id ON public.messages USING btree (whatsapp_message_id);


--
-- Name: idx_nina_processing_queue_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nina_processing_queue_conversation_id ON public.nina_processing_queue USING btree (conversation_id);


--
-- Name: idx_nina_processing_queue_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nina_processing_queue_message_id ON public.nina_processing_queue USING btree (message_id);


--
-- Name: idx_nina_processing_queue_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nina_processing_queue_priority ON public.nina_processing_queue USING btree (priority DESC);


--
-- Name: idx_nina_processing_queue_scheduled_for; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nina_processing_queue_scheduled_for ON public.nina_processing_queue USING btree (scheduled_for);


--
-- Name: idx_nina_processing_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nina_processing_queue_status ON public.nina_processing_queue USING btree (status);


--
-- Name: idx_nina_settings_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nina_settings_is_active ON public.nina_settings USING btree (is_active);


--
-- Name: idx_pipeline_stages_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_stages_is_active ON public.pipeline_stages USING btree (is_active);


--
-- Name: idx_pipeline_stages_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_stages_position ON public.pipeline_stages USING btree ("position");


--
-- Name: idx_scheduled_emails_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_emails_pending ON public.scheduled_emails USING btree (status, scheduled_for) WHERE (status = 'pending'::text);


--
-- Name: idx_send_queue_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_send_queue_contact_id ON public.send_queue USING btree (contact_id);


--
-- Name: idx_send_queue_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_send_queue_conversation_id ON public.send_queue USING btree (conversation_id);


--
-- Name: idx_send_queue_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_send_queue_priority ON public.send_queue USING btree (priority DESC);


--
-- Name: idx_send_queue_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_send_queue_scheduled_at ON public.send_queue USING btree (scheduled_at);


--
-- Name: idx_send_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_send_queue_status ON public.send_queue USING btree (status);


--
-- Name: idx_tag_definitions_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tag_definitions_category ON public.tag_definitions USING btree (category);


--
-- Name: idx_tag_definitions_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tag_definitions_key ON public.tag_definitions USING btree (key);


--
-- Name: contacts auto_create_deal_on_contact; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_create_deal_on_contact AFTER INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.create_deal_for_new_contact();


--
-- Name: agents update_agents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: appointments update_appointments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: call_logs update_call_logs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_call_logs_updated_at BEFORE UPDATE ON public.call_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: callback_assignments update_callback_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_callback_assignments_updated_at BEFORE UPDATE ON public.callback_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: campaigns update_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contacts update_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: messages update_conversation_last_message_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversation_last_message_trigger AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();


--
-- Name: conversation_states update_conversation_states_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversation_states_updated_at BEFORE UPDATE ON public.conversation_states FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversations update_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: deal_activities update_deal_activities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_deal_activities_updated_at BEFORE UPDATE ON public.deal_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: deals update_deals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_templates update_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: followup_automations update_followup_automations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_followup_automations_updated_at BEFORE UPDATE ON public.followup_automations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: learning_insights update_learning_insights_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_learning_insights_updated_at BEFORE UPDATE ON public.learning_insights FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: message_processing_queue update_message_processing_queue_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_message_processing_queue_updated_at BEFORE UPDATE ON public.message_processing_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: nina_processing_queue update_nina_processing_queue_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_nina_processing_queue_updated_at BEFORE UPDATE ON public.nina_processing_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: nina_settings update_nina_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_nina_settings_updated_at BEFORE UPDATE ON public.nina_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pipeline_stages update_pipeline_stages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pipeline_stages_updated_at BEFORE UPDATE ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pipelines update_pipelines_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pipelines_updated_at BEFORE UPDATE ON public.pipelines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sales_coaching_reports update_sales_coaching_reports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sales_coaching_reports_updated_at BEFORE UPDATE ON public.sales_coaching_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: scheduled_emails update_scheduled_emails_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_scheduled_emails_updated_at BEFORE UPDATE ON public.scheduled_emails FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: send_queue update_send_queue_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_send_queue_updated_at BEFORE UPDATE ON public.send_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tag_definitions update_tag_definitions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tag_definitions_updated_at BEFORE UPDATE ON public.tag_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: team_functions update_team_functions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_team_functions_updated_at BEFORE UPDATE ON public.team_functions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: team_members update_team_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: teams update_teams_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_templates update_whatsapp_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: messages update_whatsapp_window_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_window_trigger AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_whatsapp_window();


--
-- Name: agents agents_default_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_default_owner_id_fkey FOREIGN KEY (default_owner_id) REFERENCES public.team_members(id);


--
-- Name: agents agents_last_assigned_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_last_assigned_owner_id_fkey FOREIGN KEY (last_assigned_owner_id) REFERENCES public.team_members(id);


--
-- Name: appointments appointments_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: call_logs call_logs_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: call_logs call_logs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: callback_assignments callback_assignments_last_assigned_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.callback_assignments
    ADD CONSTRAINT callback_assignments_last_assigned_member_id_fkey FOREIGN KEY (last_assigned_member_id) REFERENCES public.team_members(id) ON DELETE SET NULL;


--
-- Name: callback_assignments callback_assignments_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.callback_assignments
    ADD CONSTRAINT callback_assignments_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE;


--
-- Name: callback_assignments callback_assignments_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.callback_assignments
    ADD CONSTRAINT callback_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: conversation_states conversation_states_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_current_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_current_agent_id_fkey FOREIGN KEY (current_agent_id) REFERENCES public.agents(id);


--
-- Name: deal_activities deal_activities_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_activities
    ADD CONSTRAINT deal_activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: deal_activities deal_activities_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_activities
    ADD CONSTRAINT deal_activities_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deals deals_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: deals deals_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.team_members(id);


--
-- Name: deals deals_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;


--
-- Name: deals deals_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id);


--
-- Name: followup_automations followup_automations_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_automations
    ADD CONSTRAINT followup_automations_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL;


--
-- Name: followup_logs followup_logs_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_logs
    ADD CONSTRAINT followup_logs_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.followup_automations(id) ON DELETE CASCADE;


--
-- Name: learning_insights learning_insights_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_insights
    ADD CONSTRAINT learning_insights_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: learning_insights learning_insights_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_insights
    ADD CONSTRAINT learning_insights_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.messages(id);


--
-- Name: nina_settings nina_settings_facebook_lead_email_template_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nina_settings
    ADD CONSTRAINT nina_settings_facebook_lead_email_template_fkey FOREIGN KEY (facebook_lead_email_template) REFERENCES public.email_templates(id);


--
-- Name: nina_settings nina_settings_google_lead_email_template_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nina_settings
    ADD CONSTRAINT nina_settings_google_lead_email_template_fkey FOREIGN KEY (google_lead_email_template) REFERENCES public.email_templates(id);


--
-- Name: pending_invites pending_invites_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_invites
    ADD CONSTRAINT pending_invites_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;


--
-- Name: pipeline_stages pipeline_stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE;


--
-- Name: pipelines pipelines_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: sales_coaching_reports sales_coaching_reports_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_coaching_reports
    ADD CONSTRAINT sales_coaching_reports_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: sales_coaching_reports sales_coaching_reports_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_coaching_reports
    ADD CONSTRAINT sales_coaching_reports_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id);


--
-- Name: scheduled_emails scheduled_emails_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_emails
    ADD CONSTRAINT scheduled_emails_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: scheduled_emails scheduled_emails_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_emails
    ADD CONSTRAINT scheduled_emails_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: send_queue send_queue_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_queue
    ADD CONSTRAINT send_queue_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: team_members team_members_function_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_function_id_fkey FOREIGN KEY (function_id) REFERENCES public.team_functions(id) ON DELETE SET NULL;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: teams teams_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agents Admins can manage agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage agents" ON public.agents TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can manage all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: followup_automations Admins can manage followup_automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage followup_automations" ON public.followup_automations TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: learning_insights Admins can manage learning_insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage learning_insights" ON public.learning_insights USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: message_processing_queue Admins can manage message_processing_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage message_processing_queue" ON public.message_processing_queue USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: nina_processing_queue Admins can manage nina_processing_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage nina_processing_queue" ON public.nina_processing_queue USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: pending_invites Admins can manage pending_invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage pending_invites" ON public.pending_invites USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sales_coaching_reports Admins can manage sales_coaching_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage sales_coaching_reports" ON public.sales_coaching_reports USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: send_queue Admins can manage send_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage send_queue" ON public.send_queue USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: nina_settings Admins can manage settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage settings" ON public.nina_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: appointments Authenticated users can manage appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage appointments" ON public.appointments TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: call_logs Authenticated users can manage call_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage call_logs" ON public.call_logs TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: callback_assignments Authenticated users can manage callback_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage callback_assignments" ON public.callback_assignments USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: campaigns Authenticated users can manage campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage campaigns" ON public.campaigns USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: contacts Authenticated users can manage contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage contacts" ON public.contacts TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: conversation_states Authenticated users can manage conversation_states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage conversation_states" ON public.conversation_states TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: conversations Authenticated users can manage conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage conversations" ON public.conversations TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: deal_activities Authenticated users can manage deal_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage deal_activities" ON public.deal_activities TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: deals Authenticated users can manage deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage deals" ON public.deals TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: email_templates Authenticated users can manage email_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage email_templates" ON public.email_templates TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: followup_logs Authenticated users can manage followup_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage followup_logs" ON public.followup_logs TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: messages Authenticated users can manage messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage messages" ON public.messages TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: pipeline_stages Authenticated users can manage pipeline_stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage pipeline_stages" ON public.pipeline_stages TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: pipelines Authenticated users can manage pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage pipelines" ON public.pipelines TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: scheduled_emails Authenticated users can manage scheduled_emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage scheduled_emails" ON public.scheduled_emails USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: tag_definitions Authenticated users can manage tag_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage tag_definitions" ON public.tag_definitions TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: team_functions Authenticated users can manage team_functions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage team_functions" ON public.team_functions TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: team_members Authenticated users can manage team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage team_members" ON public.team_members TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: teams Authenticated users can manage teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage teams" ON public.teams TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: whatsapp_templates Authenticated users can manage whatsapp_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage whatsapp_templates" ON public.whatsapp_templates TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());


--
-- Name: agents Authenticated users can view agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view agents" ON public.agents FOR SELECT TO authenticated USING (public.is_authenticated_user());


--
-- Name: followup_automations Authenticated users can view followup_automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view followup_automations" ON public.followup_automations FOR SELECT TO authenticated USING (public.is_authenticated_user());


--
-- Name: learning_insights Authenticated users can view learning_insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view learning_insights" ON public.learning_insights FOR SELECT USING (public.is_authenticated_user());


--
-- Name: sales_coaching_reports Authenticated users can view sales_coaching_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view sales_coaching_reports" ON public.sales_coaching_reports FOR SELECT USING (public.is_authenticated_user());


--
-- Name: message_grouping_queue Only admins can manage message_grouping_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can manage message_grouping_queue" ON public.message_grouping_queue USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: message_processing_queue Operators can insert into message_processing_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Operators can insert into message_processing_queue" ON public.message_processing_queue FOR INSERT WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role)));


--
-- Name: nina_processing_queue Operators can insert into nina_processing_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Operators can insert into nina_processing_queue" ON public.nina_processing_queue FOR INSERT WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role)));


--
-- Name: send_queue Operators can insert into send_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Operators can insert into send_queue" ON public.send_queue FOR INSERT WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role)));


--
-- Name: message_processing_queue Operators can view message_processing_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Operators can view message_processing_queue" ON public.message_processing_queue FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role)));


--
-- Name: nina_processing_queue Operators can view nina_processing_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Operators can view nina_processing_queue" ON public.nina_processing_queue FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role)));


--
-- Name: send_queue Operators can view send_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Operators can view send_queue" ON public.send_queue FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role)));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: call_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: callback_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.callback_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: followup_automations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.followup_automations ENABLE ROW LEVEL SECURITY;

--
-- Name: followup_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.followup_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: message_grouping_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_grouping_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: message_processing_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_processing_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: nina_processing_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nina_processing_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: nina_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nina_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: pipelines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_coaching_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_coaching_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: send_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.send_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: tag_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tag_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: team_functions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_functions ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;