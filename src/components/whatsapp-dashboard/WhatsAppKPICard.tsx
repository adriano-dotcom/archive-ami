import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhatsAppKPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

const variantStyles = {
  default: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
  success: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
  warning: 'from-yellow-500/20 to-amber-500/10 border-yellow-500/30',
  error: 'from-red-500/20 to-rose-500/10 border-red-500/30',
};

const iconVariantStyles = {
  default: 'text-green-400 bg-green-500/20',
  success: 'text-green-400 bg-green-500/20',
  warning: 'text-yellow-400 bg-yellow-500/20',
  error: 'text-red-400 bg-red-500/20',
};

export function WhatsAppKPICard({
  title,
  value,
  icon: Icon,
  trend,
  subtitle,
  variant = 'default',
}: WhatsAppKPICardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-gradient-to-br p-4 transition-all hover:scale-[1.02]',
        variantStyles[variant]
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            'rounded-lg p-2',
            iconVariantStyles[variant]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1">
          <span
            className={cn(
              'text-xs font-medium',
              trend.isPositive ? 'text-green-400' : 'text-red-400'
            )}
          >
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value).toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">vs período anterior</span>
        </div>
      )}
    </div>
  );
}
