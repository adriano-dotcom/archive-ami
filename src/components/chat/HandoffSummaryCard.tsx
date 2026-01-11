import React from 'react';
import { ClipboardList, CheckCircle2, HelpCircle, Building2, MapPin, Truck, Package, FileCheck, Receipt, DollarSign, Mail } from 'lucide-react';
import { Json } from '@/integrations/supabase/types';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface QualificationAnswers {
  contratacao?: string;
  tipo_carga?: string;
  estados?: string;
  cnpj?: string;
  empresa?: string;
  viagens_mes?: string;
  valor_medio?: string;
  maior_valor?: string;
  tipo_frota?: string;
  antt?: string;
  cte?: string;
  historico_sinistros?: string;
  // Health plan specific
  tipo_plano?: string;
  qtd_beneficiarios?: string;
  cidade_regiao?: string;
  operadora?: string;
  [key: string]: string | undefined;
}

interface HandoffSummaryCardProps {
  ninaContext: Json | null;
  agentSlug?: string | null;
  contactId?: string | null;
  contactEmail?: string | null;
  onOpenEmailModal?: () => void;
}

export const HandoffSummaryCard: React.FC<HandoffSummaryCardProps> = ({ ninaContext, agentSlug, contactId, contactEmail, onOpenEmailModal }) => {
  // Fetch pending installments summary
  const { data: installmentsSummary } = useQuery({
    queryKey: ['contact-installments-summary', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      
      const { data, error } = await supabase
        .from('installments')
        .select('value')
        .eq('contact_id', contactId)
        .in('status', ['pending', 'overdue', 'negotiating']);
      
      if (error || !data) return null;
      
      return {
        count: data.length,
        totalValue: data.reduce((sum, item) => sum + (Number(item.value) || 0), 0)
      };
    },
    enabled: !!contactId,
  });

  // Safely extract qualification answers from nina_context
  const getQualificationAnswers = (): QualificationAnswers => {
    if (!ninaContext || typeof ninaContext !== 'object') return {};
    const context = ninaContext as Record<string, unknown>;
    if (context.qualification_answers && typeof context.qualification_answers === 'object') {
      return context.qualification_answers as QualificationAnswers;
    }
    return {};
  };

  const answers = getQualificationAnswers();
  const qualificationCount = Object.values(answers).filter(v => v && v.trim() !== '').length;
  const installmentsDisplayed = installmentsSummary?.count ? 2 : 0;
  const totalItemsCount = qualificationCount + installmentsDisplayed;

  if (totalItemsCount === 0) {
    return null;
  }

  // Transport-specific field mappings
  const transportFields = [
    { key: 'contratacao', label: 'Contratação', icon: FileCheck },
    { key: 'tipo_carga', label: 'Tipo de Carga', icon: Package },
    { key: 'estados', label: 'Estados/Regiões', icon: MapPin },
    { key: 'tipo_frota', label: 'Tipo de Frota', icon: Truck },
    { key: 'viagens_mes', label: 'Viagens/Mês', icon: Truck },
    { key: 'valor_medio', label: 'Valor Médio', icon: Package },
    { key: 'maior_valor', label: 'Maior Valor', icon: Package },
    { key: 'antt', label: 'ANTT', icon: FileCheck },
    { key: 'cte', label: 'CT-e', icon: FileCheck },
    { key: 'empresa', label: 'Empresa', icon: Building2 },
  ];

  // Health-specific field mappings
  const healthFields = [
    { key: 'tipo_plano', label: 'Tipo de Plano', icon: FileCheck },
    { key: 'qtd_beneficiarios', label: 'Beneficiários', icon: FileCheck },
    { key: 'cidade_regiao', label: 'Cidade/Região', icon: MapPin },
    { key: 'operadora', label: 'Operadora', icon: Building2 },
  ];

  // Choose fields based on agent
  const fields = agentSlug === 'clara' ? healthFields : transportFields;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
        <ClipboardList className="w-4 h-4" />
        Resumo do Contato
        <span className="ml-auto px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded font-medium">
          {totalItemsCount} itens
        </span>
      </h4>
      
      <div className="p-3 rounded-lg bg-gradient-to-br from-slate-800/70 to-slate-900/70 border border-slate-700/50 space-y-2">
        {/* Qualification fields */}
        {fields.map(({ key, label, icon: Icon }) => {
          const value = answers[key];
          if (!value) return null;
          
          return (
            <div key={key} className="flex items-start gap-2 text-sm">
              <div className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-slate-500 text-xs">{label}:</span>
                <p className="text-slate-200 font-medium truncate">{value}</p>
              </div>
            </div>
          );
        })}

        {/* Show any extra fields not in the predefined list */}
        {Object.entries(answers).map(([key, value]) => {
          if (!value || fields.some(f => f.key === key)) return null;
          
          return (
            <div key={key} className="flex items-start gap-2 text-sm">
              <div className="w-5 h-5 rounded bg-slate-600/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <HelpCircle className="w-3 h-3 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-slate-500 text-xs capitalize">{key.replace(/_/g, ' ')}:</span>
                <p className="text-slate-200 font-medium truncate">{value}</p>
              </div>
            </div>
          );
        })}

        {/* Pending Installments Section */}
        {installmentsSummary && installmentsSummary.count > 0 && (
          <>
            <div className="h-px bg-slate-700/50 my-2" />
            
            <div className="flex items-start gap-2 text-sm">
              <div className="w-5 h-5 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Receipt className="w-3 h-3 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-slate-500 text-xs">Parcelas Pendentes:</span>
                <p className="text-amber-400 font-medium">{installmentsSummary.count}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2 text-sm">
              <div className="w-5 h-5 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <DollarSign className="w-3 h-3 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-slate-500 text-xs">Valor Pendente:</span>
                <p className="text-amber-400 font-medium">
                  {new Intl.NumberFormat('pt-BR', { 
                    style: 'currency', 
                    currency: 'BRL' 
                  }).format(installmentsSummary.totalValue)}
                </p>
              </div>
            </div>

            {/* Botão Enviar Email de Cobrança */}
            {contactEmail && onOpenEmailModal && (
              <button
                onClick={onOpenEmailModal}
                className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 
                           bg-gradient-to-r from-cyan-500/20 to-blue-500/20 
                           border border-cyan-500/30 rounded-lg 
                           text-cyan-400 text-sm font-medium 
                           hover:from-cyan-500/30 hover:to-blue-500/30 
                           hover:border-cyan-400/50 transition-all"
              >
                <Mail className="w-4 h-4" />
                Enviar Email de Cobrança
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
