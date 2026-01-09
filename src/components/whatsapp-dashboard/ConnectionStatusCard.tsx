import { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Wifi, Phone, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    configuration?: {
      status: 'ok' | 'warning' | 'error';
    };
    whatsapp_api?: {
      status: 'ok' | 'error' | 'skipped';
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
    };
    webhook?: {
      status: 'ok' | 'warning';
    };
  };
}

interface ConnectionStatusCardProps {
  initialData?: HealthCheckResult | null;
}

export function ConnectionStatusCard({ initialData }: ConnectionStatusCardProps) {
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(initialData || null);
  const [isChecking, setIsChecking] = useState(false);

  const handleCheckHealth = async () => {
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-webhook-health');
      if (error) throw error;
      setHealthResult(data);
      toast.success('Status atualizado');
    } catch (error) {
      console.error('Error checking health:', error);
      toast.error('Erro ao verificar status');
    } finally {
      setIsChecking(false);
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'ok':
        return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      case 'error':
      case 'skipped':
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getOverallStatusConfig = () => {
    if (!healthResult) {
      return {
        icon: AlertTriangle,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/20',
        label: 'Não verificado',
      };
    }

    switch (healthResult.status) {
      case 'healthy':
        return {
          icon: CheckCircle2,
          color: 'text-green-400',
          bgColor: 'bg-green-500/20',
          label: 'Conectado',
        };
      case 'degraded':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/20',
          label: 'Degradado',
        };
      case 'unhealthy':
        return {
          icon: XCircle,
          color: 'text-red-400',
          bgColor: 'bg-red-500/20',
          label: 'Desconectado',
        };
      default:
        return {
          icon: AlertTriangle,
          color: 'text-muted-foreground',
          bgColor: 'bg-muted/20',
          label: 'Desconhecido',
        };
    }
  };

  const statusConfig = getOverallStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <div className="rounded-xl border border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Status da Conexão</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCheckHealth}
          disabled={isChecking}
          className="h-8 gap-1 text-xs"
        >
          <RefreshCw className={cn('h-3 w-3', isChecking && 'animate-spin')} />
          Verificar
        </Button>
      </div>

      {/* Overall Status */}
      <div className={cn('mb-4 flex items-center gap-3 rounded-lg p-3', statusConfig.bgColor)}>
        <StatusIcon className={cn('h-8 w-8', statusConfig.color)} />
        <div>
          <p className={cn('font-semibold', statusConfig.color)}>{statusConfig.label}</p>
          {healthResult?.checks.whatsapp_api?.display_phone_number && (
            <p className="text-xs text-muted-foreground">
              {healthResult.checks.whatsapp_api.display_phone_number}
            </p>
          )}
        </div>
      </div>

      {/* Checks List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-muted/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Configuração</span>
          </div>
          {getStatusIcon(healthResult?.checks.configuration?.status)}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">API WhatsApp</span>
          </div>
          {getStatusIcon(healthResult?.checks.whatsapp_api?.status)}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Webhook</span>
          </div>
          {getStatusIcon(healthResult?.checks.webhook?.status)}
        </div>
      </div>

      {/* Additional Info */}
      {healthResult?.checks.whatsapp_api?.verified_name && (
        <div className="mt-4 border-t border-muted/20 pt-3">
          <p className="text-xs text-muted-foreground">
            Nome: <span className="text-foreground">{healthResult.checks.whatsapp_api.verified_name}</span>
          </p>
          {healthResult.checks.whatsapp_api.quality_rating && (
            <p className="text-xs text-muted-foreground">
              Qualidade:{' '}
              <span
                className={cn(
                  healthResult.checks.whatsapp_api.quality_rating === 'GREEN'
                    ? 'text-green-400'
                    : healthResult.checks.whatsapp_api.quality_rating === 'YELLOW'
                    ? 'text-yellow-400'
                    : 'text-red-400'
                )}
              >
                {healthResult.checks.whatsapp_api.quality_rating}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
