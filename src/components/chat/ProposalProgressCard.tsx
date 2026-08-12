import React, { useEffect, useState } from 'react';
import { Check, Circle, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ProposalDraft {
  cnpj: string | null;
  razao_social: string | null;
  rntrc: string | null;
  endereco: Record<string, string | null> | null;
  responsavel: string | null;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  collecting: 'Coletando dados',
  awaiting_acceptance: 'Aguardando aceite',
  transmitted: 'Transmitida',
};

export function ProposalProgressCard({ conversationId }: { conversationId: string }) {
  const [draft, setDraft] = useState<ProposalDraft | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('proposal_drafts')
        .select('cnpj, razao_social, rntrc, endereco, responsavel, cpf, email, telefone, status')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setDraft((data as unknown as ProposalDraft) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (!draft) return null;

  const enderecoOk = !!(draft.endereco && Object.values(draft.endereco).some((v) => !!v));

  const steps: { label: string; items: { label: string; value: string | null; done: boolean }[] }[] = [
    {
      label: 'Passo 1 — Empresa',
      items: [
        { label: 'CNPJ', value: draft.cnpj, done: !!draft.cnpj },
        { label: 'Razão social', value: draft.razao_social, done: !!draft.razao_social },
        { label: 'RNTRC', value: draft.rntrc, done: !!draft.rntrc },
        { label: 'Endereço', value: enderecoOk ? 'confirmado' : null, done: enderecoOk },
      ],
    },
    {
      label: 'Passo 2 — Contato',
      items: [
        { label: 'Responsável', value: draft.responsavel, done: !!draft.responsavel },
        { label: 'CPF', value: draft.cpf, done: !!draft.cpf },
        { label: 'E-mail', value: draft.email, done: !!draft.email },
        { label: 'Telefone', value: draft.telefone, done: !!draft.telefone },
      ],
    },
  ];

  const pending = steps.find((s) => s.items.some((i) => !i.done));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          Proposta
        </h4>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
          {STATUS_LABEL[draft.status] || draft.status}
        </span>
      </div>

      {pending && (
        <p className="text-xs text-muted-foreground">
          Pendente: <span className="text-foreground">{pending.label}</span>
        </p>
      )}

      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.label} className="rounded-lg border border-border bg-background/50 p-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">{step.label}</p>
            <ul className="space-y-1">
              {step.items.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-xs">
                  {item.done ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-muted-foreground">{item.label}:</span>
                  <span className="truncate text-foreground">{item.value || '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProposalProgressCard;
