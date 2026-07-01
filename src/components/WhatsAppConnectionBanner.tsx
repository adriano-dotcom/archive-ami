import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useWhatsAppConnection } from '@/hooks/useWhatsAppConnection';
import { Button } from './Button';

export const WhatsAppConnectionBanner: React.FC = () => {
  const navigate = useNavigate();
  const { data } = useWhatsAppConnection();

  if (!data) return null;

  const disconnected = !data.connected;
  const hasStuckQueue = data.pending_count > 0;

  // Only show the banner when there's a real problem:
  // - WhatsApp is disconnected (no token / no phone), OR
  // - Messages are stuck in the queue while disconnected.
  if (!disconnected && !hasStuckQueue) return null;
  // If connected but a few messages are pending, that's normal processing — stay quiet.
  if (!disconnected && hasStuckQueue) return null;

  const missingToken = data.phone_configured && !data.token_present;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2.5 bg-destructive/10 border-b border-destructive/30 text-sm"
    >
      <AlertTriangle className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-destructive">
          WhatsApp desconectado — mensagens não estão sendo enviadas.
        </span>
        <span className="text-muted-foreground ml-1">
          {missingToken
            ? 'O Access Token do WhatsApp está ausente.'
            : 'Configure o WhatsApp em Configurações → APIs.'}
          {hasStuckQueue && (
            <> {data.pending_count} mensagem{data.pending_count > 1 ? 's' : ''} aguardando na fila.</>
          )}
        </span>
      </div>
      <Button
        size="sm"
        onClick={() => navigate('/settings?tab=apis')}
        className="shrink-0"
      >
        Reconectar
      </Button>
    </div>
  );
};

export default WhatsAppConnectionBanner;
