import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, GitMerge, Building2, Users, MessageSquare, Loader2, CheckCircle, ChevronDown, ChevronUp, Check, Trash2, Copy, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { displayPhoneInternational } from '@/utils/phoneFormatter';

interface ContactForDuplicate {
  id: string;
  name: string | null;
  phone_number: string;
  whatsapp_id: string | null;
  email: string | null;
  company: string | null;
  company_id: string | null;
  created_at: string;
  conversations_count: number;
  policies_count: number;
  installments_count: number;
}

interface DuplicateContactGroup {
  id: string;
  normalizedPhone: string;
  contacts: ContactForDuplicate[];
}

interface GroupSelection {
  destinationId: string | null;
  sourceIds: Set<string>;
}

interface DuplicateContactsReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/**
 * Normaliza o telefone para apenas dígitos
 */
const normalizePhone = (phone: string | null | undefined): string => {
  return phone?.replace(/\D/g, '') || '';
};

/**
 * Cria variações do número (com/sem 9º dígito) para agrupamento
 */
const getPhoneVariations = (phone: string): Set<string> => {
  const digits = normalizePhone(phone);
  const variations = new Set<string>();
  
  if (!digits) return variations;
  
  variations.add(digits);
  
  // Se 13 dígitos (55 + DDD + 9 + 8 dígitos), criar versão sem o 9º dígito
  if (digits.length === 13) {
    variations.add(digits.slice(0, 4) + digits.slice(5));
  }
  // Se 12 dígitos (55 + DDD + 8 dígitos formato antigo), criar versão com 9º dígito
  else if (digits.length === 12) {
    variations.add(digits.slice(0, 4) + '9' + digits.slice(4));
  }
  // Sem código do país
  else if (digits.length === 11) {
    variations.add('55' + digits);
    variations.add(digits.slice(0, 2) + digits.slice(3)); // sem 9
  }
  else if (digits.length === 10) {
    variations.add('55' + digits.slice(0, 2) + '9' + digits.slice(2)); // com 9
    variations.add('55' + digits);
  }
  
  return variations;
};

/**
 * Gera uma chave canônica para o número (menor variação ordenada)
 */
const getCanonicalPhone = (phone: string): string => {
  const variations = getPhoneVariations(phone);
  return Array.from(variations).sort()[0] || normalizePhone(phone);
};

export const DuplicateContactsReportModal: React.FC<DuplicateContactsReportModalProps> = ({
  open,
  onOpenChange,
  onSuccess
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [contacts, setContacts] = useState<ContactForDuplicate[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupSelections, setGroupSelections] = useState<Map<string, GroupSelection>>(new Map());
  const [merging, setMerging] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState<{ groupId: string; group: DuplicateContactGroup } | null>(null);

  // Buscar contatos quando modal abre
  React.useEffect(() => {
    if (open) {
      fetchContacts();
    }
  }, [open]);

  const fetchContacts = async () => {
    setAnalyzing(true);
    try {
      // Buscar todos os contatos com suas contagens
      const { data: contactsData, error } = await supabase
        .from('contacts')
        .select(`
          id,
          name,
          phone_number,
          whatsapp_id,
          email,
          company,
          company_id,
          created_at
        `)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Buscar contagens em paralelo
      const contactIds = contactsData?.map(c => c.id) || [];
      
      const [conversationsResult, policiesResult, installmentsResult] = await Promise.all([
        supabase
          .from('conversations')
          .select('contact_id')
          .in('contact_id', contactIds),
        supabase
          .from('policies')
          .select('contact_id')
          .in('contact_id', contactIds),
        supabase
          .from('installments')
          .select('contact_id')
          .in('contact_id', contactIds)
      ]);

      // Criar mapa de contagens
      const conversationCounts = new Map<string, number>();
      const policyCounts = new Map<string, number>();
      const installmentCounts = new Map<string, number>();

      conversationsResult.data?.forEach(c => {
        conversationCounts.set(c.contact_id, (conversationCounts.get(c.contact_id) || 0) + 1);
      });
      policiesResult.data?.forEach(p => {
        policyCounts.set(p.contact_id!, (policyCounts.get(p.contact_id!) || 0) + 1);
      });
      installmentsResult.data?.forEach(i => {
        installmentCounts.set(i.contact_id!, (installmentCounts.get(i.contact_id!) || 0) + 1);
      });

      // Enriquecer contatos
      const enrichedContacts: ContactForDuplicate[] = (contactsData || []).map(c => ({
        ...c,
        conversations_count: conversationCounts.get(c.id) || 0,
        policies_count: policyCounts.get(c.id) || 0,
        installments_count: installmentCounts.get(c.id) || 0
      }));

      setContacts(enrichedContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      toast.error('Erro ao buscar contatos');
    } finally {
      setAnalyzing(false);
    }
  };

  const findDuplicateGroups = useCallback((): DuplicateContactGroup[] => {
    // Agrupar contatos por telefone normalizado (considerando variações)
    const phoneMap = new Map<string, ContactForDuplicate[]>();
    
    contacts.forEach(contact => {
      const phoneDigits = normalizePhone(contact.phone_number);
      const whatsappDigits = normalizePhone(contact.whatsapp_id);
      
      // Usar a chave canônica para agrupar
      const canonicalPhone = getCanonicalPhone(phoneDigits || whatsappDigits);
      
      if (!canonicalPhone) return;
      
      if (!phoneMap.has(canonicalPhone)) {
        phoneMap.set(canonicalPhone, []);
      }
      phoneMap.get(canonicalPhone)!.push(contact);
    });
    
    // Converter para grupos apenas onde há duplicatas (>1 contato)
    const groups: DuplicateContactGroup[] = [];
    let groupIndex = 0;
    
    phoneMap.forEach((contactsWithSamePhone, phone) => {
      if (contactsWithSamePhone.length > 1) {
        groups.push({
          id: `group-${groupIndex++}`,
          normalizedPhone: phone,
          contacts: contactsWithSamePhone.sort((a, b) => {
            // Priorizar: com conversas > com empresa > mais antigo
            if (b.conversations_count !== a.conversations_count) {
              return b.conversations_count - a.conversations_count;
            }
            if (b.company_id && !a.company_id) return 1;
            if (a.company_id && !b.company_id) return -1;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })
        });
      }
    });
    
    // Ordenar por quantidade de contatos duplicados
    return groups.sort((a, b) => b.contacts.length - a.contacts.length);
  }, [contacts]);

  const duplicateGroups = useMemo(() => {
    if (!open || contacts.length < 2) return [];
    
    const groups = findDuplicateGroups();
    
    // Initialize selections with first contact as destination
    const initialSelections = new Map<string, GroupSelection>();
    groups.forEach(group => {
      initialSelections.set(group.id, {
        destinationId: group.contacts[0].id,
        sourceIds: new Set(group.contacts.slice(1).map(c => c.id))
      });
    });
    setGroupSelections(initialSelections);
    
    // Auto-expand first 3 groups
    setExpandedGroups(new Set(groups.slice(0, 3).map(g => g.id)));
    
    return groups;
  }, [contacts, findDuplicateGroups, open]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleDestinationChange = (groupId: string, contactId: string) => {
    setGroupSelections(prev => {
      const next = new Map(prev);
      const current = next.get(groupId) || { destinationId: null, sourceIds: new Set() };
      
      const newSources = new Set(current.sourceIds);
      newSources.delete(contactId);
      
      if (current.destinationId && current.destinationId !== contactId) {
        newSources.add(current.destinationId);
      }
      
      next.set(groupId, {
        destinationId: contactId,
        sourceIds: newSources
      });
      return next;
    });
  };

  const handleSourceToggle = (groupId: string, contactId: string) => {
    setGroupSelections(prev => {
      const next = new Map(prev);
      const current = next.get(groupId) || { destinationId: null, sourceIds: new Set() };
      
      if (current.destinationId === contactId) return prev;
      
      const newSources = new Set(current.sourceIds);
      if (newSources.has(contactId)) {
        newSources.delete(contactId);
      } else {
        newSources.add(contactId);
      }
      
      next.set(groupId, {
        ...current,
        sourceIds: newSources
      });
      return next;
    });
  };

  const handleMergeClick = (group: DuplicateContactGroup) => {
    const selection = groupSelections.get(group.id);
    if (!selection?.destinationId || selection.sourceIds.size === 0) {
      toast.error('Selecione o contato principal e pelo menos um contato para mesclar');
      return;
    }
    setConfirmMerge({ groupId: group.id, group });
  };

  const executeMerge = async () => {
    if (!confirmMerge) return;
    
    const { groupId, group } = confirmMerge;
    const selection = groupSelections.get(groupId);
    if (!selection?.destinationId) return;
    
    setMerging(true);
    try {
      const destinationId = selection.destinationId;
      const sourceIds = Array.from(selection.sourceIds);
      
      // Buscar whatsapp_id de algum source para atualizar o destination se necessário
      const sourcesWithWhatsapp = group.contacts.filter(c => 
        sourceIds.includes(c.id) && c.whatsapp_id
      );
      
      for (const sourceId of sourceIds) {
        // Mover conversas
        const { error: conversationsError } = await supabase
          .from('conversations')
          .update({ contact_id: destinationId })
          .eq('contact_id', sourceId);
        
        if (conversationsError) throw conversationsError;
        
        // Mover políticas
        const { error: policiesError } = await supabase
          .from('policies')
          .update({ contact_id: destinationId })
          .eq('contact_id', sourceId);
        
        if (policiesError) throw policiesError;
        
        // Mover parcelas
        const { error: installmentsError } = await supabase
          .from('installments')
          .update({ contact_id: destinationId })
          .eq('contact_id', sourceId);
        
        if (installmentsError) throw installmentsError;
        
        // Mover call_logs
        const { error: callLogsError } = await supabase
          .from('call_logs')
          .update({ contact_id: destinationId })
          .eq('contact_id', sourceId);
        
        if (callLogsError) throw callLogsError;
        
        // Mover appointments
        const { error: appointmentsError } = await supabase
          .from('appointments')
          .update({ contact_id: destinationId })
          .eq('contact_id', sourceId);
        
        if (appointmentsError) throw appointmentsError;
        
        // Deletar contato source
        const { error: deleteError } = await supabase
          .from('contacts')
          .delete()
          .eq('id', sourceId);
        
        if (deleteError) throw deleteError;
      }
      
      // Atualizar whatsapp_id do destination se algum source tinha
      if (sourcesWithWhatsapp.length > 0) {
        const destinationContact = group.contacts.find(c => c.id === destinationId);
        if (!destinationContact?.whatsapp_id) {
          const { error: updateError } = await supabase
            .from('contacts')
            .update({ whatsapp_id: sourcesWithWhatsapp[0].whatsapp_id })
            .eq('id', destinationId);
          
          if (updateError) console.error('Error updating whatsapp_id:', updateError);
        }
      }
      
      toast.success(`${sourceIds.length} contato(s) mesclado(s) com sucesso!`);
      setConfirmMerge(null);
      
      // Atualizar lista
      await fetchContacts();
      onSuccess();
    } catch (error) {
      console.error('Error merging contacts:', error);
      toast.error('Erro ao mesclar contatos');
    } finally {
      setMerging(false);
    }
  };

  const getSelectionStats = (groupId: string, group: DuplicateContactGroup) => {
    const selection = groupSelections.get(groupId);
    if (!selection) return { sourcesCount: 0, conversationsToMove: 0, policiesToMove: 0, destination: null };
    
    const sourcesCount = selection.sourceIds.size;
    const sources = group.contacts.filter(c => selection.sourceIds.has(c.id));
    const conversationsToMove = sources.reduce((sum, c) => sum + c.conversations_count, 0);
    const policiesToMove = sources.reduce((sum, c) => sum + c.policies_count, 0);
    const destination = group.contacts.find(c => c.id === selection.destinationId);
    
    return { sourcesCount, conversationsToMove, policiesToMove, destination };
  };

  const formatPhoneDisplay = (phone: string): string => {
    const digits = normalizePhone(phone);
    if (digits.length === 13) {
      return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 5)} ${digits.slice(5, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 12) {
      return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
    }
    return displayPhoneInternational(phone);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              <Copy className="w-5 h-5 text-amber-400" />
              Relatório de Telefones Duplicados
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Contatos com o mesmo número de telefone cadastrados múltiplas vezes. Selecione qual manter e quais excluir.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {analyzing ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                <p className="text-slate-400">Analisando contatos...</p>
              </div>
            ) : duplicateGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <CheckCircle className="w-12 h-12 text-emerald-400" />
                <p className="text-slate-300 font-medium">Nenhum telefone duplicado encontrado!</p>
                <p className="text-slate-500 text-sm">
                  Todos os {contacts.length} contatos possuem telefone único.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-slate-300">
                    Encontrados <span className="text-amber-400 font-semibold">{duplicateGroups.length}</span> telefone(s) 
                    com cadastros duplicados
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedGroups(new Set(duplicateGroups.map(g => g.id)))}
                    className="gap-2 border-slate-600 text-slate-300"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Expandir Todos
                  </Button>
                </div>

                <ScrollArea className="h-[55vh] pr-4">
                  <div className="space-y-4">
                    {duplicateGroups.map((group, index) => {
                      const isExpanded = expandedGroups.has(group.id);
                      const selection = groupSelections.get(group.id);
                      const { sourcesCount, conversationsToMove, policiesToMove, destination } = getSelectionStats(group.id, group);
                      const canMerge = selection?.destinationId && sourcesCount > 0;
                      
                      return (
                        <Card 
                          key={group.id} 
                          className="bg-slate-800/50 border-slate-700/50 overflow-hidden"
                        >
                          {/* Group Header */}
                          <div 
                            className="p-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                            onClick={() => toggleGroup(group.id)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-slate-500 text-sm font-medium">
                                  #{index + 1}
                                </span>
                                <Badge className="text-amber-400 bg-amber-500/20 border-0">
                                  <Phone className="w-3 h-3 mr-1" />
                                  Telefone Duplicado
                                </Badge>
                                <span className="text-slate-300 font-mono text-sm">
                                  {formatPhoneDisplay(group.normalizedPhone)}
                                </span>
                                <span className="text-slate-400 text-sm">
                                  {group.contacts.length} cadastros
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                            </div>
                            
                            {!isExpanded && (
                              <div className="mt-2 text-sm text-slate-400 truncate">
                                {group.contacts.map(c => c.name || 'Sem nome').join(' • ')}
                              </div>
                            )}
                          </div>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="border-t border-slate-700/50">
                              {/* Instructions */}
                              <div className="px-4 pt-3 pb-2">
                                <p className="text-xs text-slate-500 flex items-center gap-2">
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  Clique no contato que deseja MANTER como principal
                                </p>
                              </div>
                              
                              <div className="px-4 pb-4 space-y-2">
                                {group.contacts.map((contact) => {
                                  const isDestination = selection?.destinationId === contact.id;
                                  const isSource = selection?.sourceIds.has(contact.id) || false;
                                  
                                  return (
                                    <div 
                                      key={contact.id}
                                      onClick={() => handleDestinationChange(group.id, contact.id)}
                                      className={`relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                                        isDestination 
                                          ? 'bg-emerald-500/10 border-2 border-emerald-500/50 ring-1 ring-emerald-500/20' 
                                          : isSource
                                            ? 'bg-red-500/10 border border-red-500/30'
                                            : 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600'
                                      }`}
                                    >
                                      {/* Selection indicator */}
                                      <div className="flex flex-col items-center gap-2 pt-1">
                                        {isDestination ? (
                                          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                            <Check className="w-3 h-3 text-white" />
                                          </div>
                                        ) : (
                                          <Checkbox
                                            checked={isSource}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSourceToggle(group.id, contact.id);
                                            }}
                                            className="border-slate-500 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                                          />
                                        )}
                                      </div>
                                      
                                      {/* Contact info */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Users className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                          <span className={`font-medium truncate ${isDestination ? 'text-emerald-300' : 'text-slate-200'}`}>
                                            {contact.name || 'Sem nome'}
                                          </span>
                                          {isDestination && (
                                            <Badge className="bg-emerald-500/20 text-emerald-400 text-xs border-0">
                                              MANTER
                                            </Badge>
                                          )}
                                          {isSource && (
                                            <Badge className="bg-red-500/20 text-red-400 text-xs border-0 flex items-center gap-1">
                                              <Trash2 className="w-3 h-3" />
                                              EXCLUIR
                                            </Badge>
                                          )}
                                        </div>
                                        
                                        {contact.email && (
                                          <p className="text-xs text-slate-500 mt-1">
                                            📧 {contact.email}
                                          </p>
                                        )}
                                        
                                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                                          {contact.company_id && (
                                            <span className="flex items-center gap-1">
                                              <Building2 className="w-3 h-3" />
                                              {contact.company || 'Empresa vinculada'}
                                            </span>
                                          )}
                                          {contact.conversations_count > 0 && (
                                            <span className="flex items-center gap-1 text-blue-400">
                                              <MessageSquare className="w-3 h-3" />
                                              {contact.conversations_count} conversa(s)
                                            </span>
                                          )}
                                          {contact.policies_count > 0 && (
                                            <span className="flex items-center gap-1 text-purple-400">
                                              📋 {contact.policies_count} apólice(s)
                                            </span>
                                          )}
                                        </div>
                                        
                                        <p className="text-[10px] text-slate-600 mt-1">
                                          Criado em {new Date(contact.created_at).toLocaleDateString('pt-BR')}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              
                              {/* Merge Summary & Action */}
                              {canMerge && (
                                <div className="px-4 pb-4 pt-2 border-t border-slate-700/50 flex items-center justify-between">
                                  <div className="text-sm text-slate-400">
                                    <span className="text-amber-400 font-medium">{sourcesCount}</span> contato(s) será(ão) excluído(s)
                                    {conversationsToMove > 0 && (
                                      <span className="ml-2">
                                        • <span className="text-blue-400">{conversationsToMove}</span> conversa(s) transferida(s)
                                      </span>
                                    )}
                                    {policiesToMove > 0 && (
                                      <span className="ml-2">
                                        • <span className="text-purple-400">{policiesToMove}</span> apólice(s) transferida(s)
                                      </span>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMergeClick(group);
                                    }}
                                    className="gap-2 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30"
                                    variant="outline"
                                  >
                                    <GitMerge className="w-4 h-4" />
                                    Mesclar
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-600 text-slate-300"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Merge Dialog */}
      <AlertDialog open={!!confirmMerge} onOpenChange={() => setConfirmMerge(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-100">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Confirmar Mesclagem
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {confirmMerge && (
                <>
                  Você está prestes a mesclar {groupSelections.get(confirmMerge.groupId)?.sourceIds.size} contato(s).
                  <br /><br />
                  <strong className="text-slate-300">Contato principal (será mantido):</strong>
                  <br />
                  {confirmMerge.group.contacts.find(c => c.id === groupSelections.get(confirmMerge.groupId)?.destinationId)?.name || 'Sem nome'}
                  <br /><br />
                  Todas as conversas, apólices e parcelas dos contatos excluídos serão transferidas para o contato principal.
                  <br /><br />
                  <strong className="text-red-400">Esta ação não pode ser desfeita.</strong>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeMerge}
              disabled={merging}
              className="bg-amber-500 hover:bg-amber-600 text-slate-900"
            >
              {merging ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Mesclando...
                </>
              ) : (
                <>
                  <GitMerge className="w-4 h-4 mr-2" />
                  Confirmar Mesclagem
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
