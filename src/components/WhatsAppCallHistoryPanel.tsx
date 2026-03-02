import React from 'react';
import { Phone, PhoneIncoming, PhoneOff, PhoneMissed, Clock, Loader2 } from 'lucide-react';
import type { WhatsAppCall } from '@/hooks/useWhatsAppCallHistory';

interface WhatsAppCallLocal {
  id: string;
  status: string;
  direction: string;
  created_at: string;
  duration_seconds: number | null;
}

interface StatusConfig {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  color: string;
  bg: string;
}

interface WhatsAppCallHistoryPanelProps {
  calls: WhatsAppCall[];
  loading: boolean;
}

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const getStatusConfig = (status: string, direction: string): StatusConfig => {
  switch (status) {
    case 'completed':
    case 'ended':
      return {
        icon: direction === 'inbound' ? PhoneIncoming : Phone,
        label: 'Atendida',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/15',
      };
    case 'missed':
    case 'no_answer':
      return {
        icon: PhoneMissed,
        label: 'Perdida',
        color: 'text-amber-400',
        bg: 'bg-amber-500/15',
      };
    case 'rejected':
      return {
        icon: PhoneOff,
        label: 'Rejeitada',
        color: 'text-red-400',
        bg: 'bg-red-500/15',
      };
    case 'ringing':
      return {
        icon: Phone,
        label: 'Chamando',
        color: 'text-blue-400',
        bg: 'bg-blue-500/15',
      };
    default:
      return {
        icon: Phone,
        label: status,
        color: 'text-muted-foreground',
        bg: 'bg-muted/50',
      };
  }
};

const WhatsAppCallHistoryPanel: React.FC<WhatsAppCallHistoryPanelProps> = ({ calls, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-3">
        Nenhuma chamada WhatsApp registrada
      </p>
    );
  }

  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
      {calls.map((call) => {
        const config = getStatusConfig(call.status, call.direction);
        const StatusIcon = config.icon;

        return (
          <div
            key={call.id}
            className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className={`w-7 h-7 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
              <StatusIcon className={`w-3.5 h-3.5 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium ${config.color}`}>
                  {config.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(call.created_at)} {formatTime(call.created_at)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-muted-foreground capitalize">
                  {call.direction === 'inbound' ? '↙ Recebida' : '↗ Realizada'}
                </span>
                {call.duration_seconds && call.duration_seconds > 0 && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDuration(call.duration_seconds)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default WhatsAppCallHistoryPanel;
