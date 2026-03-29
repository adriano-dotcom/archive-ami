export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          audio_response_enabled: boolean | null
          cargo_focused_greeting: string | null
          created_at: string | null
          default_owner_id: string | null
          description: string | null
          detection_keywords: string[] | null
          elevenlabs_model: string | null
          elevenlabs_similarity_boost: number | null
          elevenlabs_speaker_boost: boolean | null
          elevenlabs_speed: number | null
          elevenlabs_stability: number | null
          elevenlabs_style: number | null
          elevenlabs_voice_id: string | null
          greeting_message: string | null
          handoff_message: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          last_assigned_owner_id: string | null
          name: string
          owner_distribution_type: string | null
          owner_rotation_ids: string[] | null
          qualification_questions: Json | null
          slug: string
          specialty: string | null
          system_prompt: string
          updated_at: string | null
        }
        Insert: {
          audio_response_enabled?: boolean | null
          cargo_focused_greeting?: string | null
          created_at?: string | null
          default_owner_id?: string | null
          description?: string | null
          detection_keywords?: string[] | null
          elevenlabs_model?: string | null
          elevenlabs_similarity_boost?: number | null
          elevenlabs_speaker_boost?: boolean | null
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number | null
          elevenlabs_style?: number | null
          elevenlabs_voice_id?: string | null
          greeting_message?: string | null
          handoff_message?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          last_assigned_owner_id?: string | null
          name: string
          owner_distribution_type?: string | null
          owner_rotation_ids?: string[] | null
          qualification_questions?: Json | null
          slug: string
          specialty?: string | null
          system_prompt: string
          updated_at?: string | null
        }
        Update: {
          audio_response_enabled?: boolean | null
          cargo_focused_greeting?: string | null
          created_at?: string | null
          default_owner_id?: string | null
          description?: string | null
          detection_keywords?: string[] | null
          elevenlabs_model?: string | null
          elevenlabs_similarity_boost?: number | null
          elevenlabs_speaker_boost?: boolean | null
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number | null
          elevenlabs_style?: number | null
          elevenlabs_voice_id?: string | null
          greeting_message?: string | null
          handoff_message?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          last_assigned_owner_id?: string | null
          name?: string
          owner_distribution_type?: string | null
          owner_rotation_ids?: string[] | null
          qualification_questions?: Json | null
          slug?: string
          specialty?: string | null
          system_prompt?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_last_assigned_owner_id_fkey"
            columns: ["last_assigned_owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          attendees: string[] | null
          contact_id: string | null
          created_at: string
          date: string
          description: string | null
          duration: number
          id: string
          meeting_url: string | null
          status: string | null
          time: string
          title: string
          type: Database["public"]["Enums"]["appointment_type"]
          updated_at: string
        }
        Insert: {
          attendees?: string[] | null
          contact_id?: string | null
          created_at?: string
          date: string
          description?: string | null
          duration?: number
          id?: string
          meeting_url?: string | null
          status?: string | null
          time: string
          title: string
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
        }
        Update: {
          attendees?: string[] | null
          contact_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          duration?: number
          id?: string
          meeting_url?: string | null
          status?: string | null
          time?: string
          title?: string
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          answered_at: string | null
          api4com_call_id: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          extension: string
          hangup_cause: string | null
          id: string
          metadata: Json | null
          phone_number: string
          record_url: string | null
          started_at: string
          status: string
          transcription: string | null
          transcription_status: string | null
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          api4com_call_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          extension: string
          hangup_cause?: string | null
          id?: string
          metadata?: Json | null
          phone_number: string
          record_url?: string | null
          started_at?: string
          status?: string
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          api4com_call_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          extension?: string
          hangup_cause?: string | null
          id?: string
          metadata?: Json | null
          phone_number?: string
          record_url?: string | null
          started_at?: string
          status?: string
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "orbe_support_tickets_v"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      collection_attempts: {
        Row: {
          attempt_number: number
          batch_id: string | null
          channel: string
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          installment_id: string | null
          message_content: string | null
          message_id: string | null
          metadata: Json | null
          read_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: string
          template_name: string | null
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          batch_id?: string | null
          channel: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          installment_id?: string | null
          message_content?: string | null
          message_id?: string | null
          metadata?: Json | null
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          batch_id?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          installment_id?: string | null
          message_content?: string | null
          message_id?: string | null
          metadata?: Json | null
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_attempts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "collection_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_attempts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_attempts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_attempts_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_attempts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_batches: {
        Row: {
          channel: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          delivered_count: number
          description: string | null
          failed_count: number
          filters: Json | null
          id: string
          metadata: Json | null
          name: string
          replied_count: number
          scheduled_at: string | null
          sent_count: number
          started_at: string | null
          status: string
          template_name: string | null
          template_variables: Json | null
          total_count: number
          updated_at: string
        }
        Insert: {
          channel: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          failed_count?: number
          filters?: Json | null
          id?: string
          metadata?: Json | null
          name: string
          replied_count?: number
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          template_name?: string | null
          template_variables?: Json | null
          total_count?: number
          updated_at?: string
        }
        Update: {
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          failed_count?: number
          filters?: Json | null
          id?: string
          metadata?: Json | null
          name?: string
          replied_count?: number
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          template_name?: string | null
          template_variables?: Json | null
          total_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      collection_email_logs: {
        Row: {
          batch_id: string | null
          body_html: string
          contact_id: string | null
          created_at: string | null
          email_to: string
          error_message: string | null
          id: string
          installments_included: Json | null
          sent_at: string | null
          status: string | null
          subject: string
          updated_at: string | null
        }
        Insert: {
          batch_id?: string | null
          body_html: string
          contact_id?: string | null
          created_at?: string | null
          email_to: string
          error_message?: string | null
          id?: string
          installments_included?: Json | null
          sent_at?: string | null
          status?: string | null
          subject: string
          updated_at?: string | null
        }
        Update: {
          batch_id?: string | null
          body_html?: string
          contact_id?: string | null
          created_at?: string | null
          email_to?: string
          error_message?: string | null
          id?: string
          installments_included?: Json | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_email_logs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "collection_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_email_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_email_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cep: string | null
          city: string | null
          cnpj: string
          complement: string | null
          created_at: string
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          metadata: Json | null
          neighborhood: string | null
          nome_fantasia: string | null
          notes: string | null
          number: string | null
          razao_social: string
          seller_id: string | null
          state: string | null
          street: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          city?: string | null
          cnpj: string
          complement?: string | null
          created_at?: string
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          metadata?: Json | null
          neighborhood?: string | null
          nome_fantasia?: string | null
          notes?: string | null
          number?: string | null
          razao_social: string
          seller_id?: string | null
          state?: string | null
          street?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          city?: string | null
          cnpj?: string
          complement?: string | null
          created_at?: string
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          metadata?: Json | null
          neighborhood?: string | null
          nome_fantasia?: string | null
          notes?: string | null
          number?: string | null
          razao_social?: string
          seller_id?: string | null
          state?: string | null
          street?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          blocked_at: string | null
          blocked_reason: string | null
          call_name: string | null
          campaign: string | null
          cep: string | null
          city: string | null
          client_memory: Json | null
          cnpj: string | null
          company: string | null
          company_id: string | null
          complement: string | null
          cpf: string | null
          created_at: string
          email: string | null
          first_contact_date: string
          fleet_size: number | null
          id: string
          is_billing_contact: boolean | null
          is_blocked: boolean | null
          is_business: boolean | null
          last_activity: string
          lead_source: string | null
          lead_status: string | null
          name: string | null
          neighborhood: string | null
          notes: string | null
          number: string | null
          pet_name: string | null
          phone_number: string
          profile_picture_url: string | null
          role: string | null
          seller_id: string | null
          state: string | null
          street: string | null
          tags: string[] | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_source: string | null
          utm_term: string | null
          vertical: string | null
          whatsapp_id: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_reason?: string | null
          call_name?: string | null
          campaign?: string | null
          cep?: string | null
          city?: string | null
          client_memory?: Json | null
          cnpj?: string | null
          company?: string | null
          company_id?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          first_contact_date?: string
          fleet_size?: number | null
          id?: string
          is_billing_contact?: boolean | null
          is_blocked?: boolean | null
          is_business?: boolean | null
          last_activity?: string
          lead_source?: string | null
          lead_status?: string | null
          name?: string | null
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          pet_name?: string | null
          phone_number: string
          profile_picture_url?: string | null
          role?: string | null
          seller_id?: string | null
          state?: string | null
          street?: string | null
          tags?: string[] | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vertical?: string | null
          whatsapp_id?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_reason?: string | null
          call_name?: string | null
          campaign?: string | null
          cep?: string | null
          city?: string | null
          client_memory?: Json | null
          cnpj?: string | null
          company?: string | null
          company_id?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          first_contact_date?: string
          fleet_size?: number | null
          id?: string
          is_billing_contact?: boolean | null
          is_blocked?: boolean | null
          is_business?: boolean | null
          last_activity?: string
          lead_source?: string | null
          lead_status?: string | null
          name?: string | null
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          pet_name?: string | null
          phone_number?: string
          profile_picture_url?: string | null
          role?: string | null
          seller_id?: string | null
          state?: string | null
          street?: string | null
          tags?: string[] | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vertical?: string | null
          whatsapp_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_states: {
        Row: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          current_state?: string
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          scheduling_context?: Json | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          current_state?: string
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          scheduling_context?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_states_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_states_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "orbe_support_tickets_v"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_team: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id: string | null
          assigned_user_name: string | null
          contact_id: string
          created_at: string
          current_agent_id: string | null
          id: string
          is_active: boolean
          last_message_at: string
          metadata: Json | null
          nina_context: Json | null
          started_at: string
          status: Database["public"]["Enums"]["conversation_status"]
          tags: string[] | null
          updated_at: string
          whatsapp_window_start: string | null
        }
        Insert: {
          assigned_team?: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id?: string | null
          assigned_user_name?: string | null
          contact_id: string
          created_at?: string
          current_agent_id?: string | null
          id?: string
          is_active?: boolean
          last_message_at?: string
          metadata?: Json | null
          nina_context?: Json | null
          started_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[] | null
          updated_at?: string
          whatsapp_window_start?: string | null
        }
        Update: {
          assigned_team?: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id?: string | null
          assigned_user_name?: string | null
          contact_id?: string
          created_at?: string
          current_agent_id?: string | null
          id?: string
          is_active?: boolean
          last_message_at?: string
          metadata?: Json | null
          nina_context?: Json | null
          started_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[] | null
          updated_at?: string
          whatsapp_window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_current_agent_id_fkey"
            columns: ["current_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ecommerce_orders: {
        Row: {
          amount: number
          contact_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          order_id: string
          status: string
        }
        Insert: {
          amount?: number
          contact_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          order_id: string
          status?: string
        }
        Update: {
          amount?: number
          contact_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecommerce_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecommerce_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          body_html: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          body_html?: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      followup_automations: {
        Row: {
          active_days: number[] | null
          active_hours_end: string | null
          active_hours_start: string | null
          agent_messages: Json | null
          automation_type: string
          conversation_statuses: string[] | null
          cooldown_hours: number | null
          created_at: string | null
          description: string | null
          free_text_message: string | null
          hours_without_response: number
          id: string
          is_active: boolean | null
          max_attempts: number | null
          messages_sequence: Json | null
          minutes_before_expiry: number | null
          name: string
          only_if_no_client_response: boolean | null
          tags: string[] | null
          template_id: string | null
          template_variables: Json | null
          time_unit: string
          updated_at: string | null
          within_window_only: boolean
        }
        Insert: {
          active_days?: number[] | null
          active_hours_end?: string | null
          active_hours_start?: string | null
          agent_messages?: Json | null
          automation_type?: string
          conversation_statuses?: string[] | null
          cooldown_hours?: number | null
          created_at?: string | null
          description?: string | null
          free_text_message?: string | null
          hours_without_response?: number
          id?: string
          is_active?: boolean | null
          max_attempts?: number | null
          messages_sequence?: Json | null
          minutes_before_expiry?: number | null
          name: string
          only_if_no_client_response?: boolean | null
          tags?: string[] | null
          template_id?: string | null
          template_variables?: Json | null
          time_unit?: string
          updated_at?: string | null
          within_window_only?: boolean
        }
        Update: {
          active_days?: number[] | null
          active_hours_end?: string | null
          active_hours_start?: string | null
          agent_messages?: Json | null
          automation_type?: string
          conversation_statuses?: string[] | null
          cooldown_hours?: number | null
          created_at?: string | null
          description?: string | null
          free_text_message?: string | null
          hours_without_response?: number
          id?: string
          is_active?: boolean | null
          max_attempts?: number | null
          messages_sequence?: Json | null
          minutes_before_expiry?: number | null
          name?: string
          only_if_no_client_response?: boolean | null
          tags?: string[] | null
          template_id?: string | null
          template_variables?: Json | null
          time_unit?: string
          updated_at?: string | null
          within_window_only?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "followup_automations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_logs: {
        Row: {
          automation_id: string | null
          contact_id: string
          conversation_id: string
          created_at: string | null
          error_message: string | null
          hours_waited: number | null
          id: string
          message_content: string | null
          message_id: string | null
          status: string | null
          template_name: string | null
        }
        Insert: {
          automation_id?: string | null
          contact_id: string
          conversation_id: string
          created_at?: string | null
          error_message?: string | null
          hours_waited?: number | null
          id?: string
          message_content?: string | null
          message_id?: string | null
          status?: string | null
          template_name?: string | null
        }
        Update: {
          automation_id?: string | null
          contact_id?: string
          conversation_id?: string
          created_at?: string | null
          error_message?: string | null
          hours_waited?: number | null
          id?: string
          message_content?: string | null
          message_id?: string | null
          status?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followup_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "followup_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_audit_logs: {
        Row: {
          created_at: string
          error_message: string | null
          extracted_companies: number | null
          extracted_contacts: number | null
          extracted_installments: number | null
          extraction_errors: Json | null
          file_names: string[]
          id: string
          imported_companies: number | null
          imported_contacts: number | null
          imported_installments: number | null
          session_id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          extracted_companies?: number | null
          extracted_contacts?: number | null
          extracted_installments?: number | null
          extraction_errors?: Json | null
          file_names?: string[]
          id?: string
          imported_companies?: number | null
          imported_contacts?: number | null
          imported_installments?: number | null
          session_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          extracted_companies?: number | null
          extracted_contacts?: number | null
          extracted_installments?: number | null
          extraction_errors?: Json | null
          file_names?: string[]
          id?: string
          imported_companies?: number | null
          imported_contacts?: number | null
          imported_installments?: number | null
          session_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_count: number
          errors: Json | null
          file_name: string
          file_type: string | null
          id: string
          insurer: string | null
          mapping_id: string | null
          metadata: Json | null
          processed_rows: number
          started_at: string
          status: string
          success_count: number
          total_rows: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number
          errors?: Json | null
          file_name: string
          file_type?: string | null
          id?: string
          insurer?: string | null
          mapping_id?: string | null
          metadata?: Json | null
          processed_rows?: number
          started_at?: string
          status?: string
          success_count?: number
          total_rows?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number
          errors?: Json | null
          file_name?: string
          file_type?: string | null
          id?: string
          insurer?: string | null
          mapping_id?: string | null
          metadata?: Json | null
          processed_rows?: number
          started_at?: string
          status?: string
          success_count?: number
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "import_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      import_mappings: {
        Row: {
          column_mappings: Json
          created_at: string
          file_type: string
          id: string
          insurer: string | null
          is_default: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          column_mappings?: Json
          created_at?: string
          file_type: string
          id?: string
          insurer?: string | null
          is_default?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          column_mappings?: Json
          created_at?: string
          file_type?: string
          id?: string
          insurer?: string | null
          is_default?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      installment_history: {
        Row: {
          action: string
          can_revert: boolean | null
          created_at: string
          id: string
          installment_id: string | null
          metadata: Json | null
          new_paid_at: string | null
          new_status: string | null
          new_value: number | null
          notes: string | null
          performed_at: string
          performed_by: string | null
          previous_paid_at: string | null
          previous_status: string | null
          previous_value: number | null
        }
        Insert: {
          action: string
          can_revert?: boolean | null
          created_at?: string
          id?: string
          installment_id?: string | null
          metadata?: Json | null
          new_paid_at?: string | null
          new_status?: string | null
          new_value?: number | null
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          previous_paid_at?: string | null
          previous_status?: string | null
          previous_value?: number | null
        }
        Update: {
          action?: string
          can_revert?: boolean | null
          created_at?: string
          id?: string
          installment_id?: string | null
          metadata?: Json | null
          new_paid_at?: string | null
          new_status?: string | null
          new_value?: number | null
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          previous_paid_at?: string | null
          previous_status?: string | null
          previous_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "installment_history_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          contact_id: string | null
          created_at: string
          days_overdue: number | null
          due_date: string
          id: string
          installment_number: number
          metadata: Json | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_reference: string | null
          policy_id: string | null
          status: string
          updated_at: string
          value: number
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          days_overdue?: number | null
          due_date: string
          id?: string
          installment_number: number
          metadata?: Json | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          policy_id?: string | null
          status?: string
          updated_at?: string
          value: number
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          days_overdue?: number | null
          due_date?: string
          id?: string
          installment_number?: number
          metadata?: Json | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          policy_id?: string | null
          status?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "installments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_pages: {
        Row: {
          benefits: Json | null
          button_style: string | null
          created_at: string
          cta_text: string
          form_fields: Json
          hero_bg_color: string | null
          hero_image_url: string | null
          id: string
          is_active: boolean
          lead_magnet_file_url: string | null
          lead_magnet_title: string | null
          lead_magnet_type: string
          primary_color: string | null
          secondary_color: string | null
          section_bg_color: string | null
          slug: string
          subtitle: string | null
          testimonials: Json | null
          thank_you_message: string | null
          title: string
          updated_at: string
          utm_campaign: string | null
          utm_source: string | null
        }
        Insert: {
          benefits?: Json | null
          button_style?: string | null
          created_at?: string
          cta_text?: string
          form_fields?: Json
          hero_bg_color?: string | null
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          lead_magnet_file_url?: string | null
          lead_magnet_title?: string | null
          lead_magnet_type?: string
          primary_color?: string | null
          secondary_color?: string | null
          section_bg_color?: string | null
          slug: string
          subtitle?: string | null
          testimonials?: Json | null
          thank_you_message?: string | null
          title: string
          updated_at?: string
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Update: {
          benefits?: Json | null
          button_style?: string | null
          created_at?: string
          cta_text?: string
          form_fields?: Json
          hero_bg_color?: string | null
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          lead_magnet_file_url?: string | null
          lead_magnet_title?: string | null
          lead_magnet_type?: string
          primary_color?: string | null
          secondary_color?: string | null
          section_bg_color?: string | null
          slug?: string
          subtitle?: string | null
          testimonials?: Json | null
          thank_you_message?: string | null
          title?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      lead_captures: {
        Row: {
          contact_id: string | null
          created_at: string
          email: string | null
          id: string
          landing_page_id: string | null
          lead_magnet_downloaded: boolean | null
          name: string | null
          pet_name: string | null
          pet_species: string | null
          phone: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          landing_page_id?: string | null
          lead_magnet_downloaded?: boolean | null
          name?: string | null
          pet_name?: string | null
          pet_species?: string | null
          phone?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          landing_page_id?: string | null
          lead_magnet_downloaded?: boolean | null
          name?: string | null
          pet_name?: string | null
          pet_species?: string | null
          phone?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_captures_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_captures_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_captures_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_nurture_enrollments: {
        Row: {
          completed_at: string | null
          contact_id: string
          created_at: string
          current_step: number
          enrolled_at: string
          id: string
          last_step_sent_at: string | null
          lead_capture_id: string | null
          sequence_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          created_at?: string
          current_step?: number
          enrolled_at?: string
          id?: string
          last_step_sent_at?: string | null
          lead_capture_id?: string | null
          sequence_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          current_step?: number
          enrolled_at?: string
          id?: string
          last_step_sent_at?: string | null
          lead_capture_id?: string | null
          sequence_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_nurture_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_nurture_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_nurture_enrollments_lead_capture_id_fkey"
            columns: ["lead_capture_id"]
            isOneToOne: false
            referencedRelation: "lead_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_nurture_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "nurture_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_insights: {
        Row: {
          agent_id: string | null
          applied_at: string | null
          category: string
          created_at: string | null
          description: string
          examples: Json | null
          id: string
          impact: string | null
          occurrence_count: number | null
          pipeline_id: string | null
          priority: number | null
          rejection_reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_reports: string[] | null
          status: string | null
          suggestion: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          applied_at?: string | null
          category?: string
          created_at?: string | null
          description: string
          examples?: Json | null
          id?: string
          impact?: string | null
          occurrence_count?: number | null
          pipeline_id?: string | null
          priority?: number | null
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_reports?: string[] | null
          status?: string | null
          suggestion?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          applied_at?: string | null
          category?: string
          created_at?: string | null
          description?: string
          examples?: Json | null
          id?: string
          impact?: string | null
          occurrence_count?: number | null
          pipeline_id?: string | null
          priority?: number | null
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_reports?: string[] | null
          status?: string | null
          suggestion?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      message_grouping_queue: {
        Row: {
          contacts_data: Json | null
          created_at: string
          id: string
          message_data: Json
          phone_number_id: string
          processed: boolean
          whatsapp_message_id: string
        }
        Insert: {
          contacts_data?: Json | null
          created_at?: string
          id?: string
          message_data: Json
          phone_number_id: string
          processed?: boolean
          whatsapp_message_id: string
        }
        Update: {
          contacts_data?: Json | null
          created_at?: string
          id?: string
          message_data?: Json
          phone_number_id?: string
          processed?: boolean
          whatsapp_message_id?: string
        }
        Relationships: []
      }
      message_processing_queue: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          phone_number_id: string
          priority: number
          processed_at: string | null
          raw_data: Json
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
          whatsapp_message_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          phone_number_id: string
          priority?: number
          processed_at?: string | null
          raw_data: Json
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          whatsapp_message_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          phone_number_id?: string
          priority?: number
          processed_at?: string | null
          raw_data?: Json
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          whatsapp_message_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          from_type: Database["public"]["Enums"]["message_from"]
          id: string
          media_type: string | null
          media_url: string | null
          metadata: Json | null
          nina_response_time: number | null
          processed_by_nina: boolean | null
          read_at: string | null
          reply_to_id: string | null
          sent_at: string
          status: Database["public"]["Enums"]["message_status"]
          type: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          from_type: Database["public"]["Enums"]["message_from"]
          id?: string
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          nina_response_time?: number | null
          processed_by_nina?: boolean | null
          read_at?: string | null
          reply_to_id?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["message_status"]
          type?: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          from_type?: Database["public"]["Enums"]["message_from"]
          id?: string
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          nina_response_time?: number | null
          processed_by_nina?: boolean | null
          read_at?: string | null
          reply_to_id?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["message_status"]
          type?: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "orbe_support_tickets_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_processing_queue: {
        Row: {
          contact_id: string
          context_data: Json | null
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          priority: number
          processed_at: string | null
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          contact_id: string
          context_data?: Json | null
          conversation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id: string
          priority?: number
          processed_at?: string | null
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          contact_id?: string
          context_data?: Json | null
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string
          priority?: number
          processed_at?: string | null
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: []
      }
      nina_settings: {
        Row: {
          adaptive_response_enabled: boolean
          ai_model_mode: string | null
          api4com_api_token: string | null
          api4com_default_extension: string | null
          api4com_enabled: boolean | null
          api4com_token_in_vault: boolean | null
          async_booking_enabled: boolean | null
          audio_response_enabled: boolean | null
          auto_response_enabled: boolean
          business_days: number[]
          business_hours_end: string
          business_hours_start: string
          calcom_api_key: string | null
          calcom_key_in_vault: boolean | null
          collection_email_bcc: string[] | null
          collection_email_from: string | null
          company_name: string | null
          created_at: string
          elevenlabs_api_key: string | null
          elevenlabs_key_in_vault: boolean | null
          elevenlabs_model: string | null
          elevenlabs_similarity_boost: number
          elevenlabs_speaker_boost: boolean
          elevenlabs_speed: number | null
          elevenlabs_stability: number
          elevenlabs_style: number
          elevenlabs_voice_id: string
          id: string
          is_active: boolean
          message_breaking_enabled: boolean
          message_cost_per_unit: number | null
          openai_api_key: string | null
          openai_assistant_id: string
          openai_key_in_vault: boolean | null
          openai_model: string
          response_delay_max: number
          response_delay_min: number
          route_all_to_receiver_enabled: boolean
          sdr_name: string | null
          system_prompt_override: string | null
          test_phone_numbers: Json | null
          test_system_prompt: string | null
          timezone: string
          updated_at: string
          whatsapp_access_token: string | null
          whatsapp_phone_number_id: string | null
          whatsapp_token_in_vault: boolean | null
          whatsapp_verify_token: string | null
          whatsapp_waba_id: string | null
        }
        Insert: {
          adaptive_response_enabled?: boolean
          ai_model_mode?: string | null
          api4com_api_token?: string | null
          api4com_default_extension?: string | null
          api4com_enabled?: boolean | null
          api4com_token_in_vault?: boolean | null
          async_booking_enabled?: boolean | null
          audio_response_enabled?: boolean | null
          auto_response_enabled?: boolean
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          calcom_api_key?: string | null
          calcom_key_in_vault?: boolean | null
          collection_email_bcc?: string[] | null
          collection_email_from?: string | null
          company_name?: string | null
          created_at?: string
          elevenlabs_api_key?: string | null
          elevenlabs_key_in_vault?: boolean | null
          elevenlabs_model?: string | null
          elevenlabs_similarity_boost?: number
          elevenlabs_speaker_boost?: boolean
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number
          elevenlabs_style?: number
          elevenlabs_voice_id?: string
          id?: string
          is_active?: boolean
          message_breaking_enabled?: boolean
          message_cost_per_unit?: number | null
          openai_api_key?: string | null
          openai_assistant_id?: string
          openai_key_in_vault?: boolean | null
          openai_model?: string
          response_delay_max?: number
          response_delay_min?: number
          route_all_to_receiver_enabled?: boolean
          sdr_name?: string | null
          system_prompt_override?: string | null
          test_phone_numbers?: Json | null
          test_system_prompt?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_access_token?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_token_in_vault?: boolean | null
          whatsapp_verify_token?: string | null
          whatsapp_waba_id?: string | null
        }
        Update: {
          adaptive_response_enabled?: boolean
          ai_model_mode?: string | null
          api4com_api_token?: string | null
          api4com_default_extension?: string | null
          api4com_enabled?: boolean | null
          api4com_token_in_vault?: boolean | null
          async_booking_enabled?: boolean | null
          audio_response_enabled?: boolean | null
          auto_response_enabled?: boolean
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          calcom_api_key?: string | null
          calcom_key_in_vault?: boolean | null
          collection_email_bcc?: string[] | null
          collection_email_from?: string | null
          company_name?: string | null
          created_at?: string
          elevenlabs_api_key?: string | null
          elevenlabs_key_in_vault?: boolean | null
          elevenlabs_model?: string | null
          elevenlabs_similarity_boost?: number
          elevenlabs_speaker_boost?: boolean
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number
          elevenlabs_style?: number
          elevenlabs_voice_id?: string
          id?: string
          is_active?: boolean
          message_breaking_enabled?: boolean
          message_cost_per_unit?: number | null
          openai_api_key?: string | null
          openai_assistant_id?: string
          openai_key_in_vault?: boolean | null
          openai_model?: string
          response_delay_max?: number
          response_delay_min?: number
          route_all_to_receiver_enabled?: boolean
          sdr_name?: string | null
          system_prompt_override?: string | null
          test_phone_numbers?: Json | null
          test_system_prompt?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_access_token?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_token_in_vault?: boolean | null
          whatsapp_verify_token?: string | null
          whatsapp_waba_id?: string | null
        }
        Relationships: []
      }
      nurture_sequences: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          landing_page_id: string | null
          name: string
          steps: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          landing_page_id?: string | null
          name: string
          steps?: Json
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          landing_page_id?: string | null
          name?: string
          steps?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurture_sequences_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      nurture_step_logs: {
        Row: {
          channel: string
          created_at: string
          enrollment_id: string
          error_message: string | null
          id: string
          sent_at: string
          status: string
          step_index: number
        }
        Insert: {
          channel: string
          created_at?: string
          enrollment_id: string
          error_message?: string | null
          id?: string
          sent_at?: string
          status?: string
          step_index: number
        }
        Update: {
          channel?: string
          created_at?: string
          enrollment_id?: string
          error_message?: string | null
          id?: string
          sent_at?: string
          status?: string
          step_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "nurture_step_logs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "lead_nurture_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      orbe_plans_catalog: {
        Row: {
          annual_limit: number | null
          coverages: Json
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          limits_per_event: Json | null
          max_pet_age_years: number | null
          monthly_price: number
          plan_name: string
          preexisting_conditions_rule: string | null
          species_allowed: string[] | null
          updated_at: string | null
          waiting_period_days: number | null
        }
        Insert: {
          annual_limit?: number | null
          coverages?: Json
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          limits_per_event?: Json | null
          max_pet_age_years?: number | null
          monthly_price: number
          plan_name: string
          preexisting_conditions_rule?: string | null
          species_allowed?: string[] | null
          updated_at?: string | null
          waiting_period_days?: number | null
        }
        Update: {
          annual_limit?: number | null
          coverages?: Json
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          limits_per_event?: Json | null
          max_pet_age_years?: number | null
          monthly_price?: number
          plan_name?: string
          preexisting_conditions_rule?: string | null
          species_allowed?: string[] | null
          updated_at?: string | null
          waiting_period_days?: number | null
        }
        Relationships: []
      }
      pending_invites: {
        Row: {
          app_role: Database["public"]["Enums"]["app_role"]
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          team_member_id: string | null
        }
        Insert: {
          app_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          team_member_id?: string | null
        }
        Update: {
          app_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          annual_limit: number
          benefits: Json | null
          color: string | null
          coverage_details: Json | null
          created_at: string | null
          description: string | null
          id: string
          ideal_for: string[] | null
          is_active: boolean | null
          monthly_price: number
          name: string
          orbi_pitch: string | null
          reembolso_prazo_dias_uteis: number | null
          reembolso_via: string | null
          slug: string
          sort_order: number | null
          tagline: string | null
          updated_at: string | null
          whatsapp_template_name: string | null
        }
        Insert: {
          annual_limit?: number
          benefits?: Json | null
          color?: string | null
          coverage_details?: Json | null
          created_at?: string | null
          description?: string | null
          id: string
          ideal_for?: string[] | null
          is_active?: boolean | null
          monthly_price?: number
          name: string
          orbi_pitch?: string | null
          reembolso_prazo_dias_uteis?: number | null
          reembolso_via?: string | null
          slug: string
          sort_order?: number | null
          tagline?: string | null
          updated_at?: string | null
          whatsapp_template_name?: string | null
        }
        Update: {
          annual_limit?: number
          benefits?: Json | null
          color?: string | null
          coverage_details?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          ideal_for?: string[] | null
          is_active?: boolean | null
          monthly_price?: number
          name?: string
          orbi_pitch?: string | null
          reembolso_prazo_dias_uteis?: number | null
          reembolso_via?: string | null
          slug?: string
          sort_order?: number | null
          tagline?: string | null
          updated_at?: string | null
          whatsapp_template_name?: string | null
        }
        Relationships: []
      }
      policies: {
        Row: {
          branch: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          end_date: string | null
          id: string
          insurer: string
          is_cargo_insurance: boolean | null
          metadata: Json | null
          policy_number: string
          product: string | null
          start_date: string | null
          status: string
          total_value: number | null
          updated_at: string
        }
        Insert: {
          branch?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          insurer: string
          is_cargo_insurance?: boolean | null
          metadata?: Json | null
          policy_number: string
          product?: string | null
          start_date?: string | null
          status?: string
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          branch?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          insurer?: string
          is_cargo_insurance?: boolean | null
          metadata?: Json | null
          policy_number?: string
          product?: string | null
          start_date?: string | null
          status?: string
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      product_knowledge: {
        Row: {
          created_at: string
          extraction_status: string
          full_content: string | null
          id: string
          insurer: string | null
          is_active: boolean
          name: string
          source_file_url: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          extraction_status?: string
          full_content?: string | null
          id?: string
          insurer?: string | null
          is_active?: boolean
          name: string
          source_file_url?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          extraction_status?: string
          full_content?: string | null
          id?: string
          insurer?: string | null
          is_active?: boolean
          name?: string
          source_file_url?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reimbursement_claims: {
        Row: {
          amount_paid: number | null
          amount_requested: number
          claim_type: string | null
          clinic_name: string | null
          contact_id: string | null
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          paid_at: string | null
          pet_name: string | null
          receipt_url: string | null
          rejected_at: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_paid?: number | null
          amount_requested?: number
          claim_type?: string | null
          clinic_name?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          pet_name?: string | null
          receipt_url?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_paid?: number | null
          amount_requested?: number
          claim_type?: string | null
          clinic_name?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          pet_name?: string | null
          receipt_url?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_claims_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_coaching_reports: {
        Row: {
          agent_id: string | null
          alert_recipients: string[] | null
          alert_sent: boolean | null
          alert_sent_at: string | null
          analysis_period_end: string | null
          analysis_period_start: string | null
          bad_examples: Json | null
          calls_analyzed: number | null
          closing_skills_score: number | null
          conversations_analyzed: number | null
          created_at: string | null
          generated_by: string | null
          good_examples: Json | null
          human_interactions_analyzed: number | null
          id: string
          improvement_areas: Json | null
          is_applied: boolean | null
          objection_handling_score: number | null
          overall_score: number | null
          pipeline_id: string | null
          pipeline_name: string | null
          prompt_suggestions: string | null
          prospecting_metrics: Json | null
          qualification_effectiveness: number | null
          recommended_actions: Json | null
          report_type: string
          review_notes: string | null
          reviewed_by: string | null
          strengths: Json | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          alert_recipients?: string[] | null
          alert_sent?: boolean | null
          alert_sent_at?: string | null
          analysis_period_end?: string | null
          analysis_period_start?: string | null
          bad_examples?: Json | null
          calls_analyzed?: number | null
          closing_skills_score?: number | null
          conversations_analyzed?: number | null
          created_at?: string | null
          generated_by?: string | null
          good_examples?: Json | null
          human_interactions_analyzed?: number | null
          id?: string
          improvement_areas?: Json | null
          is_applied?: boolean | null
          objection_handling_score?: number | null
          overall_score?: number | null
          pipeline_id?: string | null
          pipeline_name?: string | null
          prompt_suggestions?: string | null
          prospecting_metrics?: Json | null
          qualification_effectiveness?: number | null
          recommended_actions?: Json | null
          report_type?: string
          review_notes?: string | null
          reviewed_by?: string | null
          strengths?: Json | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          alert_recipients?: string[] | null
          alert_sent?: boolean | null
          alert_sent_at?: string | null
          analysis_period_end?: string | null
          analysis_period_start?: string | null
          bad_examples?: Json | null
          calls_analyzed?: number | null
          closing_skills_score?: number | null
          conversations_analyzed?: number | null
          created_at?: string | null
          generated_by?: string | null
          good_examples?: Json | null
          human_interactions_analyzed?: number | null
          id?: string
          improvement_areas?: Json | null
          is_applied?: boolean | null
          objection_handling_score?: number | null
          overall_score?: number | null
          pipeline_id?: string | null
          pipeline_name?: string | null
          prompt_suggestions?: string | null
          prospecting_metrics?: Json | null
          qualification_effectiveness?: number | null
          recommended_actions?: Json | null
          report_type?: string
          review_notes?: string | null
          reviewed_by?: string | null
          strengths?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_coaching_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_emails: {
        Row: {
          body_html: string
          contact_id: string | null
          created_at: string | null
          days_before_due: number | null
          deal_id: string | null
          error_message: string | null
          generated_by: string | null
          id: string
          scheduled_for: string
          sent_at: string | null
          status: string | null
          subject: string
          to_email: string
          updated_at: string | null
        }
        Insert: {
          body_html: string
          contact_id?: string | null
          created_at?: string | null
          days_before_due?: number | null
          deal_id?: string | null
          error_message?: string | null
          generated_by?: string | null
          id?: string
          scheduled_for: string
          sent_at?: string | null
          status?: string | null
          subject: string
          to_email: string
          updated_at?: string | null
        }
        Update: {
          body_html?: string
          contact_id?: string | null
          created_at?: string | null
          days_before_due?: number | null
          deal_id?: string | null
          error_message?: string | null
          generated_by?: string | null
          id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string | null
          subject?: string
          to_email?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      send_queue: {
        Row: {
          contact_id: string
          content: string | null
          conversation_id: string
          created_at: string
          error_message: string | null
          from_type: string
          id: string
          media_url: string | null
          message_id: string | null
          message_type: string
          metadata: Json | null
          priority: number
          retry_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          contact_id: string
          content?: string | null
          conversation_id: string
          created_at?: string
          error_message?: string | null
          from_type?: string
          id?: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          priority?: number
          retry_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          contact_id?: string
          content?: string | null
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          from_type?: string
          id?: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          priority?: number
          retry_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "send_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_definitions: {
        Row: {
          category: string
          color: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          label: string
          updated_at: string
        }
        Insert: {
          category?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          updated_at?: string
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_functions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          api4com_extension: string | null
          avatar: string | null
          created_at: string
          email: string
          function_id: string | null
          id: string
          last_active: string | null
          name: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          team_id: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          api4com_extension?: string | null
          avatar?: string | null
          created_at?: string
          email: string
          function_id?: string | null
          id?: string
          last_active?: string | null
          name: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          team_id?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          api4com_extension?: string | null
          avatar?: string | null
          created_at?: string
          email?: string
          function_id?: string | null
          id?: string
          last_active?: string | null
          name?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          team_id?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "team_functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          pipeline_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          pipeline_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          pipeline_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      template_status_notifications: {
        Row: {
          created_at: string | null
          disable_date: string | null
          event_type: string
          id: string
          meta_template_id: string
          new_status: string
          previous_status: string | null
          read_at: string | null
          reason: string | null
          rejection_reason: string | null
          rejection_recommendation: string | null
          template_id: string | null
          template_language: string | null
          template_name: string
        }
        Insert: {
          created_at?: string | null
          disable_date?: string | null
          event_type: string
          id?: string
          meta_template_id: string
          new_status: string
          previous_status?: string | null
          read_at?: string | null
          reason?: string | null
          rejection_reason?: string | null
          rejection_recommendation?: string | null
          template_id?: string | null
          template_language?: string | null
          template_name: string
        }
        Update: {
          created_at?: string | null
          disable_date?: string | null
          event_type?: string
          id?: string
          meta_template_id?: string
          new_status?: string
          previous_status?: string | null
          read_at?: string | null
          reason?: string | null
          rejection_reason?: string | null
          rejection_recommendation?: string | null
          template_id?: string | null
          template_language?: string | null
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_status_notifications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_request_logs: {
        Row: {
          body: Json | null
          created_at: string | null
          error_message: string | null
          event_type: string | null
          headers: Json | null
          id: string
          is_meta_test: boolean | null
          method: string
          path: string | null
          processing_time_ms: number | null
          query_params: Json | null
          response_status: number | null
          source_ip: string | null
          user_agent: string | null
        }
        Insert: {
          body?: Json | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          headers?: Json | null
          id?: string
          is_meta_test?: boolean | null
          method: string
          path?: string | null
          processing_time_ms?: number | null
          query_params?: Json | null
          response_status?: number | null
          source_ip?: string | null
          user_agent?: string | null
        }
        Update: {
          body?: Json | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          headers?: Json | null
          id?: string
          is_meta_test?: boolean | null
          method?: string
          path?: string | null
          processing_time_ms?: number | null
          query_params?: Json | null
          response_status?: number | null
          source_ip?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      whatsapp_calls: {
        Row: {
          answered_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          from_number: string | null
          hangup_cause: string | null
          id: string
          metadata: Json | null
          phone_number_id: string | null
          started_at: string | null
          status: string
          to_number: string | null
          updated_at: string
          whatsapp_call_id: string | null
        }
        Insert: {
          answered_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          hangup_cause?: string | null
          id?: string
          metadata?: Json | null
          phone_number_id?: string | null
          started_at?: string | null
          status?: string
          to_number?: string | null
          updated_at?: string
          whatsapp_call_id?: string | null
        }
        Update: {
          answered_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          hangup_cause?: string | null
          id?: string
          metadata?: Json | null
          phone_number_id?: string | null
          started_at?: string | null
          status?: string
          to_number?: string | null
          updated_at?: string
          whatsapp_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "orbe_support_tickets_v"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          category: string | null
          components: Json | null
          created_at: string | null
          example_values: Json | null
          id: string
          language: string | null
          last_synced_at: string | null
          meta_template_id: string
          name: string
          status: string | null
          updated_at: string | null
          variables_count: number | null
        }
        Insert: {
          category?: string | null
          components?: Json | null
          created_at?: string | null
          example_values?: Json | null
          id?: string
          language?: string | null
          last_synced_at?: string | null
          meta_template_id: string
          name: string
          status?: string | null
          updated_at?: string | null
          variables_count?: number | null
        }
        Update: {
          category?: string | null
          components?: Json | null
          created_at?: string | null
          example_values?: Json | null
          id?: string
          language?: string | null
          last_synced_at?: string | null
          meta_template_id?: string
          name?: string
          status?: string | null
          updated_at?: string | null
          variables_count?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      collection_summary: {
        Row: {
          range_1_30: number | null
          range_31_60: number | null
          range_61_90: number | null
          range_90_plus: number | null
          total_debtors: number | null
          total_overdue_installments: number | null
          total_overdue_value: number | null
          value_1_30: number | null
          value_31_60: number | null
          value_61_90: number | null
          value_90_plus: number | null
        }
        Relationships: []
      }
      contacts_with_stats: {
        Row: {
          blocked_at: string | null
          blocked_reason: string | null
          call_name: string | null
          client_memory: Json | null
          created_at: string | null
          email: string | null
          first_contact_date: string | null
          human_messages: number | null
          id: string | null
          is_blocked: boolean | null
          is_business: boolean | null
          last_activity: string | null
          name: string | null
          nina_messages: number | null
          notes: string | null
          phone_number: string | null
          profile_picture_url: string | null
          tags: string[] | null
          total_messages: number | null
          updated_at: string | null
          user_messages: number | null
          whatsapp_id: string | null
        }
        Relationships: []
      }
      orbe_reembolsos_daily_metrics_v: {
        Row: {
          amount_paid_today: number | null
          amount_requested_today: number | null
          date_local: string | null
          reembolsos_over_7d: number | null
          reembolsos_paid_today: number | null
          reembolsos_pending_now: number | null
          reembolsos_submitted_today: number | null
        }
        Relationships: []
      }
      orbe_reembolsos_v: {
        Row: {
          amount_paid: number | null
          amount_requested: number | null
          claim_type: string | null
          clinic_name: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string | null
          paid_at: string | null
          pet_name: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      orbe_support_daily_metrics_v: {
        Row: {
          by_assigned_to_json: Json | null
          by_status_json: Json | null
          date_local: string | null
          tickets_closed_today: number | null
          tickets_new_today: number | null
          tickets_open_now: number | null
          tickets_pending_now: number | null
          tickets_sla_over_24h: number | null
          tickets_waiting_customer: number | null
        }
        Relationships: []
      }
      orbe_support_tickets_v: {
        Row: {
          assigned_to: string | null
          channel: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string | null
          last_message_at: string | null
          last_message_from: string | null
          priority: string | null
          status: string | null
          tags: string[] | null
          unread_count: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      orbe_support_weekly_metrics_v: {
        Row: {
          by_assigned_to_json: Json | null
          by_status_json: Json | null
          date_range: string | null
          tickets_closed_week: number | null
          tickets_new_week: number | null
          tickets_open_now: number | null
          tickets_pending_now: number | null
          tickets_sla_over_24h: number | null
          tickets_waiting_customer: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      auth_email: { Args: never; Returns: string }
      claim_message_processing_batch: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          error_message: string | null
          id: string
          phone_number_id: string
          priority: number
          processed_at: string | null
          raw_data: Json
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
          whatsapp_message_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "message_processing_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_nina_processing_batch: {
        Args: { p_limit?: number }
        Returns: {
          contact_id: string
          context_data: Json | null
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          priority: number
          processed_at: string | null
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "nina_processing_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_send_queue_batch: {
        Args: { p_limit?: number }
        Returns: {
          contact_id: string
          content: string | null
          conversation_id: string
          created_at: string
          error_message: string | null
          from_type: string
          id: string
          media_url: string | null
          message_id: string | null
          message_type: string
          metadata: Json | null
          priority: number
          retry_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "send_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_processed_message_queue: { Args: never; Returns: undefined }
      cleanup_processed_queues: { Args: never; Returns: undefined }
      delete_vault_secret: { Args: { secret_name: string }; Returns: boolean }
      get_current_team_member_id: { Args: never; Returns: string }
      get_or_create_conversation_state: {
        Args: { p_conversation_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_vault_secret: { Args: { secret_name: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_vault_secret: { Args: { secret_name: string }; Returns: boolean }
      is_authenticated_team_member: { Args: never; Returns: boolean }
      is_authenticated_user: { Args: never; Returns: boolean }
      is_whatsapp_window_open: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      set_vault_secret: {
        Args: { secret_name: string; secret_value: string }
        Returns: string
      }
      update_client_memory: {
        Args: { p_contact_id: string; p_new_memory: Json }
        Returns: undefined
      }
      update_conversation_state: {
        Args: {
          p_action?: string
          p_context?: Json
          p_conversation_id: string
          p_new_state: string
        }
        Returns: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer"
      appointment_type: "demo" | "meeting" | "support" | "followup"
      conversation_status: "nina" | "human" | "paused" | "closed"
      member_role: "admin" | "manager" | "agent"
      member_status: "active" | "invited" | "disabled"
      message_from: "user" | "nina" | "human"
      message_status: "sent" | "delivered" | "read" | "failed" | "processing"
      message_type: "text" | "audio" | "image" | "document" | "video"
      queue_status: "pending" | "processing" | "completed" | "failed"
      team_assignment: "mateus" | "igor" | "fe" | "vendas" | "suporte"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operator", "viewer"],
      appointment_type: ["demo", "meeting", "support", "followup"],
      conversation_status: ["nina", "human", "paused", "closed"],
      member_role: ["admin", "manager", "agent"],
      member_status: ["active", "invited", "disabled"],
      message_from: ["user", "nina", "human"],
      message_status: ["sent", "delivered", "read", "failed", "processing"],
      message_type: ["text", "audio", "image", "document", "video"],
      queue_status: ["pending", "processing", "completed", "failed"],
      team_assignment: ["mateus", "igor", "fe", "vendas", "suporte"],
    },
  },
} as const
