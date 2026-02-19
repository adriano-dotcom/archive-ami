import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProcessingStatus {
  isAggregating: boolean;
  isProcessing: boolean;
  agentName: string | null;
}

export const useNinaProcessingStatus = (conversationId: string | null): ProcessingStatus => {
  const [status, setStatus] = useState<ProcessingStatus>({
    isAggregating: false,
    isProcessing: false,
    agentName: null,
  });

  useEffect(() => {
    if (!conversationId) {
      setStatus({ isAggregating: false, isProcessing: false, agentName: null });
      return;
    }

    // Check current status
    const checkStatus = async () => {
      const now = new Date().toISOString();
      
      const { data: queueItems } = await supabase
        .from('nina_processing_queue')
        .select('status, scheduled_for, context_data')
        .eq('conversation_id', conversationId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (!queueItems || queueItems.length === 0) {
        setStatus({ isAggregating: false, isProcessing: false, agentName: null });
        return;
      }

      const item = queueItems[0];
      const scheduledFor = item.scheduled_for ? new Date(item.scheduled_for) : null;
      const isScheduledInFuture = scheduledFor && scheduledFor > new Date();
      
      // Get agent name from conversation
      const { data: conversation } = await supabase
        .from('conversations')
        .select('current_agent_id, agents:current_agent_id(name)')
        .eq('id', conversationId)
        .single();

      const agentName = (conversation?.agents as any)?.name || 'Íris';

      setStatus({
        isAggregating: (item.status === 'pending' && isScheduledInFuture) as boolean,
        isProcessing: item.status === 'processing' || (item.status === 'pending' && !isScheduledInFuture),
        agentName,
      });
    };

    checkStatus();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`nina-processing-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'nina_processing_queue',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          checkStatus();
        }
      )
      .subscribe();

    // Poll every 2 seconds for scheduled_for timing
    const interval = setInterval(checkStatus, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [conversationId]);

  return status;
};
