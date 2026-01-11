import React, { useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Send, Play, Pause, Eye, Clock, CheckCircle, XCircle, MessageSquare, Sparkles, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { CollectionEmailCampaign } from './CollectionEmailCampaign';
import { SendCollectionTemplateModal } from './SendCollectionTemplateModal';

interface CollectionBatch {
  id: string;
  name: string;
  description: string | null;
  channel: string;
  template_name: string | null;
  total_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  replied_count: number;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  completed_at: string | null;
}

const COLLECTION_TEMPLATES = [
  { 
    id: 'friendly', 
    name: 'Lembrete Amigável', 
    description: 'Primeiro contato, tom amigável',
    message: 'Olá {{nome}}! 👋\n\nIdentificamos que a parcela {{parcela}} da sua apólice {{apolice}} está pendente desde {{vencimento}}.\n\nO valor é de {{valor}}. Posso te ajudar a regularizar? 😊'
  },
  { 
    id: 'reminder', 
    name: 'Lembrete', 
    description: 'Segundo contato, mais direto',
    message: 'Olá {{nome}}!\n\nSua parcela {{parcela}} no valor de {{valor}} está com {{dias}} dias de atraso.\n\nEvite transtornos! Entre em contato para regularizar. 📞'
  },
  { 
    id: 'urgent', 
    name: 'Urgente', 
    description: 'Terceiro contato, senso de urgência',
    message: '⚠️ {{nome}}, sua apólice {{apolice}} está em risco!\n\nA parcela {{parcela}} ({{valor}}) está com {{dias}} dias de atraso.\n\nRegularize agora para evitar o cancelamento do seu seguro!'
  },
  { 
    id: 'final', 
    name: 'Aviso Final', 
    description: 'Último contato antes do cancelamento',
    message: '🚨 AVISO IMPORTANTE - {{nome}}\n\nSua apólice {{apolice}} será CANCELADA em breve por falta de pagamento.\n\nParcela em atraso: {{parcela}} - {{valor}}\nDias de atraso: {{dias}}\n\nEste é nosso último contato antes do cancelamento. Entre em contato URGENTE!'
  }
];

export const CollectionCampaigns: React.FC = () => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showEmailCampaign, setShowEmailCampaign] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CollectionBatch | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState<string | undefined>();
  const [selectedRangeFilter, setSelectedRangeFilter] = useState('all');
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    channel: 'whatsapp',
    template: '',
    rangeFilter: 'all',
    minDays: 0,
    maxDays: 0
  });
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['collection-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_batches')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as CollectionBatch[];
    }
  });

  const { data: targetCount } = useQuery({
    queryKey: ['target-installments-count', newCampaign.rangeFilter],
    queryFn: async () => {
      let query = supabase
        .from('installments')
        .select('id', { count: 'exact' })
        .in('status', ['overdue', 'negotiating']);

      if (newCampaign.rangeFilter !== 'all') {
        switch (newCampaign.rangeFilter) {
          case '1-30':
            query = query.gte('days_overdue', 1).lte('days_overdue', 30);
            break;
          case '31-60':
            query = query.gte('days_overdue', 31).lte('days_overdue', 60);
            break;
          case '61-90':
            query = query.gte('days_overdue', 61).lte('days_overdue', 90);
            break;
          case '90+':
            query = query.gt('days_overdue', 90);
            break;
        }
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: isCreateOpen
  });

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('collection_batches')
        .insert({
          name: newCampaign.name,
          description: newCampaign.description,
          channel: newCampaign.channel,
          template_name: newCampaign.template,
          filters: { range: newCampaign.rangeFilter },
          total_count: targetCount || 0,
          status: 'draft'
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-batches'] });
      setIsCreateOpen(false);
      setNewCampaign({
        name: '',
        description: '',
        channel: 'whatsapp',
        template: '',
        rangeFilter: 'all',
        minDays: 0,
        maxDays: 0
      });
      toast.success('Campanha criada com sucesso');
    },
    onError: () => {
      toast.error('Erro ao criar campanha');
    }
  });

  const startCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('collection_batches')
        .update({ 
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (error) throw error;
      
      // TODO: Trigger the actual sending process
      toast.info('Disparo de cobrança iniciado. Os envios serão processados em breve.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-batches'] });
    }
  });

  const pauseCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('collection_batches')
        .update({ status: 'paused' })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-batches'] });
      toast.success('Campanha pausada');
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">Rascunho</Badge>;
      case 'scheduled':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Agendada</Badge>;
      case 'processing':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Em Execução</Badge>;
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Concluída</Badge>;
      case 'paused':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Pausada</Badge>;
      case 'cancelled':
        return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">Cancelada</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const selectedTemplate = COLLECTION_TEMPLATES.find(t => t.id === newCampaign.template);

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Campanhas de Cobrança</h2>
          <p className="text-sm text-slate-400">Gerencie disparos em massa de cobrança</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-600 hover:bg-amber-700 gap-2">
              <Plus className="w-4 h-4" />
              Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-slate-900 border-white/10">
            <DialogHeader>
              <DialogTitle>Criar Campanha de Cobrança</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Campanha</Label>
                  <Input 
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Cobrança Janeiro 2025"
                    className="bg-slate-800/50 border-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Canal</Label>
                  <Select 
                    value={newCampaign.channel}
                    onValueChange={(v) => setNewCampaign(prev => ({ ...prev, channel: v }))}
                  >
                    <SelectTrigger className="bg-slate-800/50 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea 
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrição opcional da campanha"
                  className="bg-slate-800/50 border-white/10"
                />
              </div>

              <div className="space-y-2">
                <Label>Faixa de Atraso</Label>
                <Select 
                  value={newCampaign.rangeFilter}
                  onValueChange={(v) => setNewCampaign(prev => ({ ...prev, rangeFilter: v }))}
                >
                  <SelectTrigger className="bg-slate-800/50 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as parcelas vencidas</SelectItem>
                    <SelectItem value="1-30">1-30 dias de atraso</SelectItem>
                    <SelectItem value="31-60">31-60 dias de atraso</SelectItem>
                    <SelectItem value="61-90">61-90 dias de atraso</SelectItem>
                    <SelectItem value="90+">90+ dias de atraso</SelectItem>
                  </SelectContent>
                </Select>
                {targetCount !== undefined && (
                  <p className="text-sm text-amber-400 mt-1">
                    {targetCount} parcelas serão incluídas nesta campanha
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Template de Mensagem</Label>
                <Select 
                  value={newCampaign.template}
                  onValueChange={(v) => setNewCampaign(prev => ({ ...prev, template: v }))}
                >
                  <SelectTrigger className="bg-slate-800/50 border-white/10">
                    <SelectValue placeholder="Selecione um template" />
                  </SelectTrigger>
                  <SelectContent>
                    {COLLECTION_TEMPLATES.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} - {t.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-white/5">
                  <Label className="text-sm text-slate-400 mb-2 block">Preview da Mensagem:</Label>
                  <p className="text-slate-300 whitespace-pre-line text-sm">
                    {selectedTemplate.message}
                  </p>
                </div>
              )}

              {/* Show AI Email button for email channel */}
              {newCampaign.channel === 'email' && (
                <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-purple-500/20">
                      <Sparkles className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-purple-200">Email com Inteligência Artificial</p>
                      <p className="text-xs text-slate-400">
                        A IA irá gerar emails personalizados para cada segurado, agrupando todas as parcelas
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => {
                      setIsCreateOpen(false);
                      setShowEmailCampaign(true);
                    }}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Gerar Emails com IA
                  </Button>
                </div>
              )}

              {/* Show WhatsApp Template button for whatsapp channel */}
              {newCampaign.channel === 'whatsapp' && (
                <div className="p-4 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-green-500/20">
                      <MessageSquare className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-200">Template do Meta WhatsApp</p>
                      <p className="text-xs text-slate-400">
                        Use templates aprovados pelo Meta para enviar cobranças em massa
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => {
                      setSelectedRangeFilter(newCampaign.rangeFilter);
                      setIsCreateOpen(false);
                      setShowWhatsAppModal(true);
                    }}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Enviar via WhatsApp Template
                  </Button>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsCreateOpen(false)}
                  className="border-white/10"
                >
                  Cancelar
                </Button>
                {newCampaign.channel !== 'email' && (
                  <Button 
                    onClick={() => createCampaignMutation.mutate()}
                    disabled={!newCampaign.name || !newCampaign.template || createCampaignMutation.isPending}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    Criar Campanha
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campaigns List */}
      <Card className="bg-slate-900/50 border-white/5">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : campaigns && campaigns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead>Campanha</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Enviados</TableHead>
                  <TableHead className="text-center">Respostas</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Data</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id} className="border-white/5 hover:bg-white/[0.02]">
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-200">{campaign.name}</p>
                        {campaign.description && (
                          <p className="text-sm text-slate-500 truncate max-w-[200px]">
                            {campaign.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-white/10">
                        {campaign.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-slate-300">
                      {campaign.total_count}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-green-400">{campaign.sent_count}</span>
                      {campaign.failed_count > 0 && (
                        <span className="text-rose-400 ml-1">/ {campaign.failed_count} ✕</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-blue-400">
                      {campaign.replied_count}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(campaign.status)}
                    </TableCell>
                    <TableCell className="text-center text-slate-400 text-sm">
                      {format(new Date(campaign.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {campaign.status === 'draft' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 hover:bg-green-500/20 hover:text-green-400"
                            onClick={() => startCampaignMutation.mutate(campaign.id)}
                            title="Iniciar campanha"
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                        {campaign.status === 'processing' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 hover:bg-orange-500/20 hover:text-orange-400"
                            onClick={() => pauseCampaignMutation.mutate(campaign.id)}
                            title="Pausar campanha"
                          >
                            <Pause className="w-4 h-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 hover:bg-blue-500/20 hover:text-blue-400"
                          title="Ver detalhes"
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setIsDetailsOpen(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-400 mb-2">Nenhuma campanha criada</h3>
              <p className="text-sm text-slate-500 mb-4">
                Crie sua primeira campanha de cobrança em massa
              </p>
              <Button 
                onClick={() => setIsCreateOpen(true)}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Criar Campanha
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Campaign Sheet */}
      <CollectionEmailCampaign
        open={showEmailCampaign}
        onOpenChange={setShowEmailCampaign}
        filters={{ range: newCampaign.rangeFilter }}
        batchId={currentBatchId}
      />

      {/* WhatsApp Template Modal */}
      <SendCollectionTemplateModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        rangeFilter={selectedRangeFilter}
        onSent={() => {
          queryClient.invalidateQueries({ queryKey: ['collection-batches'] });
        }}
      />

      {/* Campaign Details Modal */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedCampaign?.name}</DialogTitle>
            {selectedCampaign?.description && (
              <p className="text-slate-400 text-sm">{selectedCampaign.description}</p>
            )}
          </DialogHeader>
          
          {selectedCampaign && (
            <div className="space-y-6 mt-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-slate-800/50 border border-white/5 text-center">
                  <p className="text-2xl font-bold text-slate-200">{selectedCampaign.total_count}</p>
                  <p className="text-xs text-slate-400">Total</p>
                </div>
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                  <p className="text-2xl font-bold text-green-400">{selectedCampaign.sent_count}</p>
                  <p className="text-xs text-slate-400">Enviados</p>
                </div>
                <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">
                  <p className="text-2xl font-bold text-rose-400">{selectedCampaign.failed_count}</p>
                  <p className="text-xs text-slate-400">Falhas</p>
                </div>
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
                  <p className="text-2xl font-bold text-blue-400">{selectedCampaign.replied_count}</p>
                  <p className="text-xs text-slate-400">Respostas</p>
                </div>
              </div>

              {/* Success Rate */}
              {selectedCampaign.total_count > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Taxa de Sucesso</span>
                    <span className="text-slate-200 font-medium">
                      {Math.round((selectedCampaign.sent_count / selectedCampaign.total_count) * 100)}%
                    </span>
                  </div>
                  <Progress 
                    value={(selectedCampaign.sent_count / selectedCampaign.total_count) * 100} 
                    className="h-2 bg-slate-800"
                  />
                </div>
              )}

              {/* Campaign Info */}
              <div className="space-y-3 p-4 rounded-lg bg-slate-800/30 border border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Canal</span>
                  <Badge variant="outline" className="border-white/10">
                    {selectedCampaign.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                  </Badge>
                </div>
                {selectedCampaign.template_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Template</span>
                    <span className="text-sm text-slate-200">{selectedCampaign.template_name}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Status</span>
                  {getStatusBadge(selectedCampaign.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Criado em</span>
                  <span className="text-sm text-slate-200">
                    {format(new Date(selectedCampaign.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
                {selectedCampaign.scheduled_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Agendado para</span>
                    <span className="text-sm text-slate-200">
                      {format(new Date(selectedCampaign.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
                {selectedCampaign.completed_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Concluído em</span>
                    <span className="text-sm text-slate-200">
                      {format(new Date(selectedCampaign.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
              </div>

              {/* Delivered Stats */}
              {selectedCampaign.delivered_count > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-300">
                    {selectedCampaign.delivered_count} mensagens entregues
                  </span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
