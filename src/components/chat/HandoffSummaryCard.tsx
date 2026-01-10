import React from 'react';
import { ClipboardList, CheckCircle2, HelpCircle, Building2, MapPin, Truck, Package, FileCheck } from 'lucide-react';
import { Json } from '@/integrations/supabase/types';

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
}

export const HandoffSummaryCard: React.FC<HandoffSummaryCardProps> = ({ ninaContext, agentSlug }) => {
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
  const answeredCount = Object.values(answers).filter(v => v && v.trim() !== '').length;

  if (answeredCount === 0) {
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
          {answeredCount} itens
        </span>
      </h4>
      
      <div className="p-3 rounded-lg bg-gradient-to-br from-slate-800/70 to-slate-900/70 border border-slate-700/50 space-y-2">
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
      </div>
    </div>
  );
};
