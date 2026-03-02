import React, { useState, useEffect } from 'react';
import { PhoneCall } from 'lucide-react';
import WhatsAppCallHistoryPanel from './WhatsAppCallHistoryPanel';
import { supabase } from '@/integrations/supabase/client';
import type { WhatsAppCall } from '@/hooks/useWhatsAppCallHistory';

const CallsPage: React.FC = () => {
  const [calls, setCalls] = useState<WhatsAppCall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCalls = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('whatsapp_calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setCalls(data || []);
      setLoading(false);
    };
    fetchCalls();
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="flex-shrink-0 p-6 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500/20 to-primary/20 flex items-center justify-center">
            <PhoneCall className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Chamadas</h1>
            <p className="text-sm text-muted-foreground">Histórico de chamadas recebidas e realizadas</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-card/50 border border-border rounded-xl p-4">
          <WhatsAppCallHistoryPanel calls={calls} loading={loading} />
        </div>
      </div>
    </div>
  );
};

export default CallsPage;
