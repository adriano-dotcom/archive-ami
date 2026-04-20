import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Users, GripVertical, Phone, Clock, MessageSquare, Tag, BarChart3, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';
import { LeadScoreBadge } from '@/components/chat/LeadScoreBadge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import FunnelMetricsPanel from '@/components/funnel/FunnelMetricsPanel';

// ─── Stage definitions ───────────────────────────────────────────
interface Stage {
  key: string;
  label: string;
  color: string;       // tailwind bg class
  textColor: string;    // tailwind text class
  borderColor: string;  // tailwind border class
  dotColor: string;     // tailwind bg class for dot
}

const STAGES: Stage[] = [
  { key: 'new',         label: 'Novo Lead',    color: 'bg-blue-500/10',   textColor: 'text-blue-600',   borderColor: 'border-blue-500/30',   dotColor: 'bg-blue-500' },
  { key: 'qualified',   label: 'Qualificado',  color: 'bg-yellow-500/10', textColor: 'text-yellow-600', borderColor: 'border-yellow-500/30', dotColor: 'bg-yellow-500' },
  { key: 'proposal',    label: 'Proposta',     color: 'bg-orange-500/10', textColor: 'text-orange-600', borderColor: 'border-orange-500/30', dotColor: 'bg-orange-500' },
  { key: 'negotiation', label: 'Negociação',   color: 'bg-purple-500/10', textColor: 'text-purple-600', borderColor: 'border-purple-500/30', dotColor: 'bg-purple-500' },
  { key: 'customer',    label: 'Vendido',      color: 'bg-green-500/10',  textColor: 'text-green-600',  borderColor: 'border-green-500/30',  dotColor: 'bg-green-500' },
  { key: 'churned',     label: 'Perdido',      color: 'bg-red-500/10',    textColor: 'text-red-600',    borderColor: 'border-red-500/30',    dotColor: 'bg-red-500' },
];

// ─── Types ───────────────────────────────────────────────────────
interface FunnelContact {
  id: string;
  name: string | null;
  call_name: string | null;
  phone_number: string;
  email: string | null;
  lead_status: string | null;
  last_activity: string;
  client_memory: any;
  profile_picture_url: string | null;
  tags: string[] | null;
  pet_name: string | null;
}

// ─── Data fetching ───────────────────────────────────────────────
const fetchFunnelContacts = async (): Promise<FunnelContact[]> => {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, call_name, phone_number, email, lead_status, last_activity, client_memory, profile_picture_url, tags, pet_name')
    .order('last_activity', { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data || []) as FunnelContact[];
};

// ─── FunnelCard ──────────────────────────────────────────────────
const FunnelCard: React.FC<{
  contact: FunnelContact;
  onDragStart: (e: React.DragEvent, id: string) => void;
}> = React.memo(({ contact, onDragStart }) => {
  const navigate = useNavigate();
  const displayName = contact.name || contact.call_name || contact.phone_number;
  const initials = (displayName || '?').slice(0, 2).toUpperCase();
  const clientMemory = contact.client_memory as any;
  const products = clientMemory?.lead_profile?.products_discussed || [];
  const subscription = clientMemory?.subscription;
  const paymentLabels: Record<string, string> = {
    cartao: 'Cartão',
    cartao_credito: 'Cartão',
    pix_mensal: 'PIX mensal',
    pix_anual: 'PIX anual',
    pix: 'PIX',
  };
  const startedAtTooltip = subscription?.started_at
    ? `Cliente desde ${new Date(subscription.started_at).toLocaleDateString('pt-BR')}`
    : undefined;
  const timeAgo = formatDistanceToNow(new Date(contact.last_activity), { addSuffix: true, locale: ptBR });

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, contact.id)}
      onClick={() => navigate(`/chat?contact=${contact.id}`)}
      className="group bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-primary/30 transition-all duration-200 space-y-2"
    >
      {/* Header: Avatar + Name */}
      <div className="flex items-center gap-2">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        {contact.profile_picture_url ? (
          <img src={contact.profile_picture_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
          {contact.pet_name && (
            <p className="text-[11px] text-muted-foreground truncate">🐾 {contact.pet_name}</p>
          )}
        </div>
      </div>

      {/* Info row */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Phone className="w-3 h-3" />
          {contact.phone_number.replace(/^55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {timeAgo}
        </span>
      </div>

      {/* Subscription badge (Vendido) */}
      {subscription?.plan_name && (
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-green-500/10 border border-green-500/30"
          title={startedAtTooltip}
        >
          <Sparkles className="w-3 h-3 text-green-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-green-600 truncate">
              {subscription.plan_name}
            </p>
            <p className="text-[10px] text-green-600/80 truncate">
              {subscription.monthly_amount_formatted ||
                (typeof subscription.monthly_amount === 'number'
                  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subscription.monthly_amount)
                  : '—')}
              {' / mês'}
              {subscription.payment_method && ` • ${paymentLabels[subscription.payment_method] ?? subscription.payment_method}`}
            </p>
          </div>
        </div>
      )}

      {/* Lead score + products */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {clientMemory && (
          <LeadScoreBadge clientMemory={clientMemory} compact />
        )}
        {products.slice(0, 2).map((p: string) => (
          <Badge key={p} variant="secondary" className="text-[9px] px-1.5 py-0">
            {p}
          </Badge>
        ))}
      </div>

      {/* Tags */}
      {contact.tags && contact.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {contact.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
FunnelCard.displayName = 'FunnelCard';

// ─── FunnelColumn ────────────────────────────────────────────────
const FunnelColumn: React.FC<{
  stage: Stage;
  contacts: FunnelContact[];
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, stageKey: string) => void;
}> = React.memo(({ stage, contacts, onDragStart, onDrop }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={`flex flex-col min-w-[280px] w-[280px] shrink-0 rounded-xl border transition-all duration-200 ${
        isDragOver ? `${stage.borderColor} ${stage.color} shadow-lg` : 'border-border bg-muted/30'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop(e, stage.key); }}
    >
      {/* Column header */}
      <div className={`flex items-center justify-between p-3 border-b ${stage.borderColor}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${stage.dotColor}`} />
          <span className={`text-sm font-semibold ${stage.textColor}`}>{stage.label}</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.color} ${stage.textColor}`}>
          {contacts.length}
        </span>
      </div>

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-200px)]">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-xs">Nenhum lead</p>
          </div>
        ) : (
          contacts.map((contact) => (
            <FunnelCard key={contact.id} contact={contact} onDragStart={onDragStart} />
          ))
        )}
      </div>
    </div>
  );
});
FunnelColumn.displayName = 'FunnelColumn';

// ─── Main Component ──────────────────────────────────────────────
const SalesFunnel: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['funnel-contacts'],
    queryFn: fetchFunnelContacts,
    staleTime: 5 * 60 * 1000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('contacts')
        .update({ lead_status: status })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['funnel-contacts'] });
      const prev = queryClient.getQueryData<FunnelContact[]>(['funnel-contacts']);
      queryClient.setQueryData<FunnelContact[]>(['funnel-contacts'], (old) =>
        (old || []).map((c) => (c.id === id ? { ...c, lead_status: status } : c))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['funnel-contacts'], ctx?.prev);
      toast.error('Erro ao mover lead');
    },
    onSuccess: () => {
      toast.success('Lead movido com sucesso');
      queryClient.invalidateQueries({ queryKey: ['contacts-infinite'] });
    },
  });

  const filteredContacts = useMemo(() => {
    if (!debouncedSearch) return contacts;
    const q = debouncedSearch.toLowerCase();
    return contacts.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.call_name || '').toLowerCase().includes(q) ||
        c.phone_number.includes(q) ||
        (c.pet_name || '').toLowerCase().includes(q)
    );
  }, [contacts, debouncedSearch]);

  const contactsByStage = useMemo(() => {
    const map: Record<string, FunnelContact[]> = {};
    STAGES.forEach((s) => (map[s.key] = []));
    filteredContacts.forEach((c) => {
      const key = c.lead_status || 'new';
      if (map[key]) map[key].push(c);
      else map['new'].push(c);
    });
    return map;
  }, [filteredContacts]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, stageKey: string) => {
      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;
      const contact = contacts.find((c) => c.id === id);
      if (contact && contact.lead_status !== stageKey) {
        updateStatusMutation.mutate({ id, status: stageKey });
      }
      setDraggedId(null);
    },
    [contacts, updateStatusMutation]
  );

  const totalLeads = filteredContacts.length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">Funil de Vendas</h1>
          <Badge variant="secondary" className="text-xs">
            {totalLeads} leads
          </Badge>
          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              showMetrics
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Métricas
          </button>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Metrics panel */}
      {showMetrics && !isLoading && (
        <FunnelMetricsPanel
          contactsByStage={contactsByStage}
          stages={STAGES}
          totalLeads={totalLeads}
        />
      )}

      {/* Kanban board */}
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
                contacts={contactsByStage[stage.key] || []}
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

export default SalesFunnel;
