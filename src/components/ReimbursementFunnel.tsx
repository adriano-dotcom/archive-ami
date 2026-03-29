import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Users, GripVertical, DollarSign, Clock, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Claim type definitions ─────────────────────────────────────
const CLAIM_TYPES: Record<string, { label: string; emoji: string; color: string; textColor: string }> = {
  consulta:   { label: 'Consulta',   emoji: '🩺', color: 'bg-blue-500/10',   textColor: 'text-blue-600' },
  exame:      { label: 'Exame',      emoji: '🔬', color: 'bg-purple-500/10', textColor: 'text-purple-600' },
  cirurgia:   { label: 'Cirurgia',   emoji: '🏥', color: 'bg-red-500/10',    textColor: 'text-red-600' },
  internacao: { label: 'Internação', emoji: '🛏️', color: 'bg-orange-500/10', textColor: 'text-orange-600' },
  outro:      { label: 'Outro',      emoji: '📋', color: 'bg-muted',         textColor: 'text-muted-foreground' },
};

// ─── Stage definitions ───────────────────────────────────────────
interface Stage {
  key: string;
  label: string;
  color: string;
  textColor: string;
  borderColor: string;
  dotColor: string;
}

const STAGES: Stage[] = [
  { key: 'submitted',   label: 'Submetido',   color: 'bg-blue-500/10',    textColor: 'text-blue-600',    borderColor: 'border-blue-500/30',    dotColor: 'bg-blue-500' },
  { key: 'in_review',   label: 'Em Revisão',  color: 'bg-yellow-500/10',  textColor: 'text-yellow-600',  borderColor: 'border-yellow-500/30',  dotColor: 'bg-yellow-500' },
  { key: 'approved',    label: 'Aprovado',     color: 'bg-green-500/10',   textColor: 'text-green-600',   borderColor: 'border-green-500/30',   dotColor: 'bg-green-500' },
  { key: 'paid',        label: 'Pago',         color: 'bg-emerald-500/10', textColor: 'text-emerald-600', borderColor: 'border-emerald-500/30', dotColor: 'bg-emerald-500' },
  { key: 'rejected',    label: 'Rejeitado',    color: 'bg-red-500/10',     textColor: 'text-red-600',     borderColor: 'border-red-500/30',     dotColor: 'bg-red-500' },
];

// ─── Types ───────────────────────────────────────────────────────
interface ReimbursementClaim {
  id: string;
  contact_id: string | null;
  status: string;
  claim_type: string | null;
  amount_requested: number;
  amount_paid: number | null;
  pet_name: string | null;
  clinic_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  contacts?: {
    name: string | null;
    call_name: string | null;
    phone_number: string;
    pet_name: string | null;
  } | null;
}

// ─── Data fetching ───────────────────────────────────────────────
const fetchClaims = async (): Promise<ReimbursementClaim[]> => {
  const { data, error } = await supabase
    .from('reimbursement_claims')
    .select('*, contacts(name, call_name, phone_number, pet_name)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data || []) as unknown as ReimbursementClaim[];
};

// ─── ClaimCard ───────────────────────────────────────────────────
const ClaimCard: React.FC<{
  claim: ReimbursementClaim;
  onDragStart: (e: React.DragEvent, id: string) => void;
}> = React.memo(({ claim, onDragStart }) => {
  const contact = claim.contacts;
  const displayName = contact?.name || contact?.call_name || 'Sem nome';
  const petName = claim.pet_name || contact?.pet_name;
  const timeAgo = formatDistanceToNow(new Date(claim.created_at), { addSuffix: true, locale: ptBR });
  const daysSinceCreation = Math.floor((Date.now() - new Date(claim.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const isOverSLA = daysSinceCreation > 7 && !['paid', 'rejected'].includes(claim.status);
  const typeInfo = CLAIM_TYPES[claim.claim_type || 'consulta'] || CLAIM_TYPES.outro;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, claim.id)}
      className={`group bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-primary/30 transition-all duration-200 space-y-2 ${
        isOverSLA ? 'border-red-500/50 ring-1 ring-red-500/20' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
          {petName && (
            <p className="text-[11px] text-muted-foreground truncate">🐾 {petName}</p>
          )}
        </div>
        {isOverSLA && (
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${typeInfo.color} ${typeInfo.textColor} border-0`}>
          {typeInfo.emoji} {typeInfo.label}
        </Badge>
        {claim.clinic_name && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
            {claim.clinic_name}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1 font-medium text-foreground">
          <DollarSign className="w-3 h-3" />
          R$ {claim.amount_requested.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {timeAgo}
        </span>
      </div>

      {claim.description && (
        <p className="text-[11px] text-muted-foreground truncate">
          {claim.description}
        </p>
      )}
    </div>
  );
});
ClaimCard.displayName = 'ClaimCard';

// ─── FunnelColumn ────────────────────────────────────────────────
const FunnelColumn: React.FC<{
  stage: Stage;
  claims: ReimbursementClaim[];
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, stageKey: string) => void;
}> = React.memo(({ stage, claims, onDragStart, onDrop }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const totalValue = claims.reduce((sum, c) => sum + c.amount_requested, 0);

  return (
    <div
      className={`flex flex-col min-w-[280px] w-[280px] shrink-0 rounded-xl border transition-all duration-200 ${
        isDragOver ? `${stage.borderColor} ${stage.color} shadow-lg` : 'border-border bg-muted/30'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop(e, stage.key); }}
    >
      <div className={`flex items-center justify-between p-3 border-b ${stage.borderColor}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${stage.dotColor}`} />
          <span className={`text-sm font-semibold ${stage.textColor}`}>{stage.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.color} ${stage.textColor}`}>
            {claims.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-300px)]">
        {claims.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-xs">Nenhuma solicitação</p>
          </div>
        ) : (
          claims.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} onDragStart={onDragStart} />
          ))
        )}
      </div>
    </div>
  );
});
FunnelColumn.displayName = 'FunnelColumn';

// ─── Main Component ──────────────────────────────────────────────
const ReimbursementFunnel: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const debouncedSearch = useDebounce(search, 300);

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ['reimbursement-claims'],
    queryFn: fetchClaims,
    staleTime: 2 * 60 * 1000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updateData: Record<string, any> = { status };
      if (status === 'paid') updateData.paid_at = new Date().toISOString();
      if (status === 'rejected') updateData.rejected_at = new Date().toISOString();

      const { error } = await supabase
        .from('reimbursement_claims')
        .update(updateData)
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['reimbursement-claims'] });
      const prev = queryClient.getQueryData<ReimbursementClaim[]>(['reimbursement-claims']);
      queryClient.setQueryData<ReimbursementClaim[]>(['reimbursement-claims'], (old) =>
        (old || []).map((c) => (c.id === id ? { ...c, status } : c))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['reimbursement-claims'], ctx?.prev);
      toast.error('Erro ao mover solicitação');
    },
    onSuccess: () => {
      toast.success('Status atualizado');
      queryClient.invalidateQueries({ queryKey: ['reimbursement-claims'] });
    },
  });

  const filteredClaims = useMemo(() => {
    let result = claims;
    if (typeFilter !== 'all') {
      result = result.filter((c) => (c.claim_type || 'consulta') === typeFilter);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (c) =>
          (c.contacts?.name || '').toLowerCase().includes(q) ||
          (c.contacts?.call_name || '').toLowerCase().includes(q) ||
          (c.pet_name || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [claims, debouncedSearch, typeFilter]);

  const claimsByStage = useMemo(() => {
    const map: Record<string, ReimbursementClaim[]> = {};
    STAGES.forEach((s) => (map[s.key] = []));
    filteredClaims.forEach((c) => {
      const key = c.status || 'submitted';
      if (map[key]) map[key].push(c);
      else map['submitted'].push(c);
    });
    return map;
  }, [filteredClaims]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, stageKey: string) => {
      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;
      const claim = claims.find((c) => c.id === id);
      if (claim && claim.status !== stageKey) {
        updateStatusMutation.mutate({ id, status: stageKey });
      }
    },
    [claims, updateStatusMutation]
  );

  // KPIs
  const pendingCount = filteredClaims.filter((c) => !['paid', 'rejected'].includes(c.status)).length;
  const totalPendingValue = filteredClaims
    .filter((c) => !['paid', 'rejected'].includes(c.status))
    .reduce((sum, c) => sum + c.amount_requested, 0);
  const overSLACount = filteredClaims.filter((c) => {
    const days = Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24));
    return days > 7 && !['paid', 'rejected'].includes(c.status);
  }).length;

  // Type breakdown
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    claims.filter((c) => !['paid', 'rejected'].includes(c.status)).forEach((c) => {
      const t = c.claim_type || 'consulta';
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [claims]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">Funil de Reembolso</h1>
          <Badge variant="secondary" className="text-xs">
            {filteredClaims.length} solicitações
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          {/* Type filter */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTypeFilter('all')}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                typeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Todos
            </button>
            {Object.entries(CLAIM_TYPES).map(([key, info]) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  typeFilter === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {info.emoji} {info.label}
              </button>
            ))}
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar tutor, pet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-4 gap-3 p-4 border-b border-border">
        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-xl font-bold text-foreground">{pendingCount}</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <div className="rounded-md bg-green-500/10 p-2">
            <DollarSign className="w-4 h-4 text-green-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Valor Pendente</p>
            <p className="text-xl font-bold text-foreground">
              R$ {totalPendingValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <div className="rounded-md bg-red-500/10 p-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fora do SLA (&gt;7 dias)</p>
            <p className="text-xl font-bold text-foreground">{overSLACount}</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1">Por Tipo</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(typeCounts).map(([type, count]) => {
              const info = CLAIM_TYPES[type] || CLAIM_TYPES.outro;
              return (
                <span key={type} className={`text-[10px] px-1.5 py-0.5 rounded ${info.color} ${info.textColor} font-medium`}>
                  {info.emoji} {count}
                </span>
              );
            })}
            {Object.keys(typeCounts).length === 0 && (
              <span className="text-[10px] text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Kanban */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-4">
            {STAGES.map((s) => (
              <div key={s.key} className="w-[280px] h-[400px] rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-3 h-full min-w-max">
            {STAGES.map((stage) => (
              <FunnelColumn
                key={stage.key}
                stage={stage}
                claims={claimsByStage[stage.key] || []}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReimbursementFunnel;
