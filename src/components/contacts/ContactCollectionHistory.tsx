import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Mail, MessageCircle, Check, Clock, AlertCircle, FileText, Loader2, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CollectionAttempt {
  id: string;
  channel: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  template_name: string | null;
  message_content: string | null;
  error_message: string | null;
  delivered_at: string | null;
  read_at: string | null;
  metadata: {
    installment_data?: {
      installment_number?: number;
      value?: number;
      due_date?: string;
      days_overdue?: number;
      policy_number?: string | null;
      insurer?: string | null;
    };
    contact_name?: string;
    company_name?: string;
    total_value?: number;
    installments_count?: number;
    email_to?: string;
    seller_name?: string;
  } | null;
}

interface ContactCollectionHistoryProps {
  contactId: string;
  maxHeight?: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

const getStatusInfo = (status: string, deliveredAt: string | null, readAt: string | null) => {
  if (readAt) {
    return { label: 'Lido', color: 'bg-blue-500/20 text-blue-400', icon: Check };
  }
  if (deliveredAt) {
    return { label: 'Entregue', color: 'bg-green-500/20 text-green-400', icon: Check };
  }
  switch (status) {
    case 'sent':
      return { label: 'Enviado', color: 'bg-emerald-500/20 text-emerald-400', icon: ArrowRight };
    case 'failed':
      return { label: 'Falhou', color: 'bg-red-500/20 text-red-400', icon: AlertCircle };
    case 'pending':
      return { label: 'Pendente', color: 'bg-yellow-500/20 text-yellow-400', icon: Clock };
    default:
      return { label: status, color: 'bg-slate-500/20 text-slate-400', icon: Clock };
  }
};

const getChannelIcon = (channel: string) => {
  switch (channel) {
    case 'whatsapp':
      return <MessageCircle className="w-4 h-4 text-emerald-400" />;
    case 'email':
      return <Mail className="w-4 h-4 text-blue-400" />;
    default:
      return <FileText className="w-4 h-4 text-slate-400" />;
  }
};

export const ContactCollectionHistory: React.FC<ContactCollectionHistoryProps> = ({ 
  contactId, 
  maxHeight = '400px' 
}) => {
  const { data: history, isLoading, error } = useQuery({
    queryKey: ['collection-history', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_attempts')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as CollectionAttempt[];
    },
    enabled: !!contactId
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-400">
        <AlertCircle className="w-8 h-8 mx-auto mb-2" />
        <p className="text-sm">Erro ao carregar histórico</p>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <FileText className="w-10 h-10 mx-auto mb-2 text-slate-600" />
        <p className="text-sm">Nenhuma cobrança enviada</p>
        <p className="text-xs text-slate-500 mt-1">
          O histórico aparecerá aqui após enviar cobranças
        </p>
      </div>
    );
  }

  // Group by date
  const groupedByDate = history.reduce((acc, attempt) => {
    const date = format(new Date(attempt.sent_at || attempt.created_at), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(attempt);
    return acc;
  }, {} as Record<string, CollectionAttempt[]>);

  return (
    <ScrollArea style={{ maxHeight }} className="pr-4">
      <div className="space-y-6">
        {Object.entries(groupedByDate).map(([date, attempts]) => (
          <div key={date}>
            <div className="sticky top-0 bg-slate-950/95 py-2 z-10">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {format(new Date(date), "dd 'de' MMMM", { locale: ptBR })}
              </h4>
            </div>
            <div className="space-y-3 mt-2">
              {attempts.map((attempt) => {
                const statusInfo = getStatusInfo(attempt.status, attempt.delivered_at, attempt.read_at);
                const StatusIcon = statusInfo.icon;
                const metadata = attempt.metadata || {};
                const installmentData = metadata.installment_data;

                return (
                  <div
                    key={attempt.id}
                    className="bg-slate-900/50 rounded-lg p-3 border border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {getChannelIcon(attempt.channel)}
                        <span className="text-sm font-medium text-white capitalize">
                          {attempt.channel}
                        </span>
                        <span className="text-xs text-slate-500">
                          {format(new Date(attempt.sent_at || attempt.created_at), 'HH:mm')}
                        </span>
                      </div>
                      <Badge className={`${statusInfo.color} text-xs gap-1`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo.label}
                      </Badge>
                    </div>

                    {/* Installment details from metadata */}
                    {installmentData && (
                      <div className="mt-2 text-xs text-slate-400 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {installmentData.policy_number && (
                            <span className="bg-slate-800 px-2 py-0.5 rounded">
                              {installmentData.insurer} #{installmentData.policy_number}
                            </span>
                          )}
                          {installmentData.installment_number && (
                            <span>Parcela {installmentData.installment_number}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {installmentData.value && (
                            <span className="text-emerald-400 font-medium">
                              {formatCurrency(installmentData.value)}
                            </span>
                          )}
                          {installmentData.due_date && (
                            <span>
                              Venc: {format(parseISO(installmentData.due_date), 'dd/MM/yyyy')}
                            </span>
                          )}
                          {installmentData.days_overdue && installmentData.days_overdue > 0 && (
                            <span className="text-red-400">
                              {installmentData.days_overdue}d atraso
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Show consolidated info if available */}
                    {metadata.installments_count && metadata.installments_count > 1 && (
                      <div className="mt-2 text-xs text-slate-500">
                        Cobrança consolidada: {metadata.installments_count} parcelas, total {formatCurrency(metadata.total_value || 0)}
                      </div>
                    )}

                    {/* Template used */}
                    {attempt.template_name && (
                      <div className="mt-2 text-xs text-slate-500">
                        Template: {attempt.template_name}
                      </div>
                    )}

                    {/* Error message if failed */}
                    {attempt.status === 'failed' && attempt.error_message && (
                      <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded p-2">
                        {attempt.error_message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Summary stats */}
      <div className="mt-6 pt-4 border-t border-slate-800">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-white">{history.length}</p>
            <p className="text-xs text-slate-500">Total enviado</p>
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-400">
              {history.filter(h => h.channel === 'whatsapp').length}
            </p>
            <p className="text-xs text-slate-500">WhatsApp</p>
          </div>
          <div>
            <p className="text-lg font-bold text-blue-400">
              {history.filter(h => h.channel === 'email').length}
            </p>
            <p className="text-xs text-slate-500">Email</p>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
};

export default ContactCollectionHistory;
