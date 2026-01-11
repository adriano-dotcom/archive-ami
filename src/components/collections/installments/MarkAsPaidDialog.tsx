import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, Building2, AlertTriangle } from 'lucide-react';
import { Installment } from './useInstallments';

interface MarkAsPaidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installments: Installment[];
  totalValue: number;
  isPending: boolean;
  onConfirm: () => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

export const MarkAsPaidDialog: React.FC<MarkAsPaidDialogProps> = ({
  open,
  onOpenChange,
  installments,
  totalValue,
  isPending,
  onConfirm
}) => {
  const [confirmed, setConfirmed] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setConfirmed(false);
      setCountdown(3);
    }
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (open && confirmed && countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [open, confirmed, countdown]);

  const canConfirm = confirmed && countdown === 0;

  // Group by company for better visualization
  const groupedByCompany = installments.reduce((acc, inst) => {
    const companyName = inst.policy?.company?.nome_fantasia || 
                        inst.policy?.company?.razao_social || 
                        'Empresa não identificada';
    if (!acc[companyName]) {
      acc[companyName] = [];
    }
    acc[companyName].push(inst);
    return acc;
  }, {} as Record<string, Installment[]>);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-amber-400" />
            Confirmar Pagamento
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2">
              <p className="text-slate-300">
                Você está prestes a marcar <span className="font-bold text-white">{installments.length} parcela(s)</span> como paga(s).
              </p>
              
              {/* Summary */}
              <div className="bg-slate-800/50 rounded-lg p-4 border border-amber-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Valor total:</span>
                  <span className="text-2xl font-bold text-amber-400">
                    {formatCurrency(totalValue)}
                  </span>
                </div>
              </div>

              {/* Installments list */}
              {installments.length <= 10 ? (
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-3">
                    {Object.entries(groupedByCompany).map(([company, insts]) => (
                      <div key={company} className="bg-slate-800/30 rounded-lg p-3 border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className="w-4 h-4 text-slate-500" />
                          <span className="font-medium text-slate-200 text-sm truncate">
                            {company}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {insts.map(inst => (
                            <Badge 
                              key={inst.id}
                              variant="outline"
                              className="border-slate-600 text-slate-300"
                            >
                              Parcela {inst.installment_number} • {formatCurrency(inst.value)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-slate-400">
                  {Object.keys(groupedByCompany).length} empresa(s) • {installments.length} parcela(s)
                </p>
              )}

              {/* Warning */}
              <div className="flex items-start gap-2 text-sm text-amber-400 bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Após confirmar, as parcelas serão removidas da lista de cobrança. 
                  Você terá 15 segundos para desfazer a ação.
                </span>
              </div>

              {/* Confirmation checkbox */}
              <div className="flex items-start gap-3 pt-2">
                <Checkbox 
                  id="confirm-paid"
                  checked={confirmed}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                  className="mt-1"
                />
                <label 
                  htmlFor="confirm-paid" 
                  className="text-sm text-slate-300 cursor-pointer select-none"
                >
                  Li e confirmo que estas {installments.length} parcela(s) foram efetivamente pagas
                </label>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={`min-w-[140px] transition-all ${
              canConfirm 
                ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
            }`}
            disabled={!canConfirm || isPending}
          >
            {isPending ? (
              'Processando...'
            ) : !confirmed ? (
              'Marque para confirmar'
            ) : countdown > 0 ? (
              `Aguarde ${countdown}s...`
            ) : (
              `Confirmar (${installments.length})`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
