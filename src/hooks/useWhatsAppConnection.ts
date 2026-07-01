import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppConnectionStatus {
  connected: boolean;
  phone_configured: boolean;
  token_present: boolean;
  pending_count: number;
  oldest_pending_at: string | null;
}

const DEFAULT_STATUS: WhatsAppConnectionStatus = {
  connected: true, // optimistic default while loading, to avoid banner flash
  phone_configured: true,
  token_present: true,
  pending_count: 0,
  oldest_pending_at: null,
};

export function useWhatsAppConnection() {
  return useQuery<WhatsAppConnectionStatus>({
    queryKey: ['whatsapp-connection-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('whatsapp-connection-status');
      if (error) throw error;
      return data as WhatsAppConnectionStatus;
    },
    refetchInterval: 60_000, // re-check every 60s
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    placeholderData: DEFAULT_STATUS,
  });
}
