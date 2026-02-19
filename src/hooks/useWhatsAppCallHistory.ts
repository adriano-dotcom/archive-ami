import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

export type WhatsAppCall = Tables<'whatsapp_calls'>;

export const useWhatsAppCallHistory = (contactId: string | null) => {
  const [calls, setCalls] = useState<WhatsAppCall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contactId) {
      setCalls([]);
      setLoading(false);
      return;
    }

    const fetchCalls = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_calls')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching WhatsApp call history:', error);
      } else {
        setCalls(data || []);
      }
      setLoading(false);
    };

    fetchCalls();

    const channel = supabase
      .channel(`wa-calls-${contactId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_calls',
          filter: `contact_id=eq.${contactId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCalls(prev => [payload.new as WhatsAppCall, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as WhatsAppCall;
            setCalls(prev => prev.map(c => c.id === updated.id ? updated : c));
          } else if (payload.eventType === 'DELETE') {
            setCalls(prev => prev.filter(c => c.id !== payload.old?.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId]);

  return { calls, loading };
};
