import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { User, Building2, MapPin, Phone, Mail, FileText, Calendar, Edit, MessageSquare, Target, Pencil, Check, X, Loader2 } from 'lucide-react';
import { displayPhoneInternational } from '@/utils/phoneFormatter';
import { CallHistoryPanel } from './CallHistoryPanel';
import { useContactCallHistory } from '@/hooks/useContactCallHistory';
import { api } from '@/services/api';
import { toast } from 'sonner';

interface ContactData {
  id: string;
  name: string;
  phone: string;
  email: string;
  pet_name?: string;
  cpf?: string;
  fleet_size?: number;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
  lastContact?: string;
  status?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

interface ContactDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactData | null;
  onEdit?: () => void;
  onConverse?: () => void;
  onContactUpdate?: (updatedContact: ContactData) => void;
}

const formatCPF = (cpf: string | undefined) => {
  if (!cpf) return '-';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9,11)}`;
};

const formatCEP = (cep: string | undefined) => {
  if (!cep) return '-';
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return cep;
  return `${digits.slice(0,5)}-${digits.slice(5,8)}`;
};

const ContactDetailsDrawer: React.FC<ContactDetailsDrawerProps> = ({ open, onOpenChange, contact, onEdit, onConverse, onContactUpdate }) => {
  const { callHistory, loading: callsLoading } = useContactCallHistory(contact?.id || null);
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Reset editing state when contact changes or drawer closes
  useEffect(() => {
    if (!open) {
      setIsEditingName(false);
      setEditedName('');
    }
  }, [open, contact?.id]);

  const handleStartEditing = () => {
    setEditedName(contact?.name || '');
    setIsEditingName(true);
  };

  const handleCancelEditing = () => {
    setIsEditingName(false);
    setEditedName('');
  };

  const handleSaveName = async () => {
    if (!editedName.trim() || !contact?.id) return;
    if (editedName.trim() === contact.name) {
      handleCancelEditing();
      return;
    }
    
    setIsSaving(true);
    try {
      await api.updateContact(contact.id, { name: editedName.trim() });
      toast.success('Nome atualizado com sucesso!');
      setIsEditingName(false);
      onContactUpdate?.({ ...contact, name: editedName.trim() });
    } catch (error) {
      console.error('Error updating name:', error);
      toast.error('Erro ao atualizar nome');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveName();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEditing();
    }
  };

  if (!contact) return null;

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'customer': return { label: 'Cliente Ativo', gradient: 'from-emerald-500/20 to-green-500/20', text: 'text-emerald-300', border: 'border-emerald-400/30', glow: 'shadow-emerald-500/20' };
      case 'lead': return { label: 'Lead', gradient: 'from-cyan-500/20 to-teal-500/20', text: 'text-cyan-300', border: 'border-cyan-400/30', glow: 'shadow-cyan-500/20' };
      default: return { label: 'Novo Lead', gradient: 'from-muted/20 to-muted/10', text: 'text-muted-foreground', border: 'border-border', glow: 'shadow-muted/20' };
    }
  };

  const statusBadge = getStatusBadge(contact.status);

  const hasAddress = contact.street || contact.city || contact.state;

  // Section header component with iOS 26 style
  const SectionHeader = ({ icon: Icon, title }: { icon: React.ElementType; title: string }) => (
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
      <span className="p-1.5 rounded-lg bg-gradient-to-br from-muted/80 to-card/80 border border-border">
        <Icon className="w-3.5 h-3.5 text-primary" />
      </span>
      {title}
    </h3>
  );

  // Info row component with iOS 26 style
  const InfoRow = ({ icon: Icon, label, value, isLink }: { icon: React.ElementType; label: string; value: string; isLink?: boolean }) => (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-card/[0.02] hover:bg-card/[0.04] border border-border/30 hover:border-primary/20 transition-all duration-300 group">
      <div className="p-2 rounded-lg bg-gradient-to-br from-muted/80 to-card/80 border border-border group-hover:border-primary/20 transition-all">
        <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground block">{label}</span>
        <p className={`font-medium truncate ${isLink ? 'text-primary hover:text-primary/80' : 'text-foreground'}`}>
          {value || '-'}
        </p>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg bg-gradient-to-b from-background/98 via-card/95 to-background/98 backdrop-blur-2xl border-l border-border overflow-y-auto shadow-2xl">
        {/* Header with glassmorphism */}
        <SheetHeader className="pb-6">
          {/* Avatar section with glow */}
          <div className="flex flex-col items-center text-center pt-4 pb-6">
            <div className="relative mb-4">
              {/* Glow effect behind avatar */}
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/30 to-teal-500/30 blur-2xl rounded-full scale-150 animate-pulse" />
              {/* Avatar ring */}
                <div className="relative w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-primary via-teal-400 to-primary shadow-lg shadow-primary/30">
                <div className="w-full h-full rounded-full bg-gradient-to-br from-muted to-card flex items-center justify-center text-3xl font-bold text-primary/80 shadow-inner">
                  {contact.name?.substring(0, 2).toUpperCase() || '??'}
                </div>
              </div>
            </div>
            
            {isEditingName ? (
              <div className="flex items-center gap-2 w-full max-w-xs">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  disabled={isSaving}
                  className="text-center text-lg font-bold bg-card/5 border-primary/30 text-foreground focus:border-primary"
                  placeholder="Nome do lead"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSaveName}
                  disabled={isSaving || !editedName.trim()}
                  className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCancelEditing}
                  disabled={isSaving}
                  className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <SheetTitle className="text-2xl font-bold bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
                <span
                  className="inline-flex items-center gap-2 cursor-pointer group"
                  onClick={handleStartEditing}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleStartEditing()}
                >
                  {contact.name}
                  <Pencil className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              </SheetTitle>
            )}
            
            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border mt-2 bg-gradient-to-r ${statusBadge.gradient} ${statusBadge.text} ${statusBadge.border} shadow-lg ${statusBadge.glow} backdrop-blur-sm`}>
              {statusBadge.label}
            </span>
          </div>

          {/* Action buttons with iOS 26 style */}
          <div className="flex gap-3">
            <Button 
              onClick={onEdit} 
              className="flex-1 bg-gradient-to-r from-primary to-teal-500 hover:from-primary/90 hover:to-teal-400 text-primary-foreground shadow-lg shadow-primary/30 border-0 transition-all duration-300 hover:scale-[1.02]"
            >
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
            <Button 
              onClick={onConverse} 
              variant="outline" 
              className="flex-1 bg-card/[0.03] border-border hover:bg-card/[0.06] hover:border-primary/30 text-foreground transition-all duration-300 hover:scale-[1.02]"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Conversar
            </Button>
          </div>
        </SheetHeader>

        {/* Gradient divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-6" />

        <div className="space-y-6 pb-6">
          {/* Dados de Contato */}
          <section>
            <SectionHeader icon={User} title="Dados de Contato" />
            <div className="space-y-2">
              <InfoRow icon={Phone} label="Telefone" value={displayPhoneInternational(contact.phone)} />
              {(contact.city || contact.state) && (
                <InfoRow icon={MapPin} label="Região" value={[contact.city, contact.state].filter(Boolean).join(' - ')} />
              )}
              <InfoRow icon={Mail} label="Email" value={contact.email || '-'} isLink={!!contact.email} />
              {contact.cnpj && (
                <InfoRow icon={FileText} label="CNPJ" value={formatCNPJ(contact.cnpj)} />
              )}
              {contact.company && (
                <InfoRow icon={Building2} label="Empresa" value={contact.company} />
              )}
            </div>
          </section>

          {/* Gradient divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Histórico de Chamadas */}
          <section>
            <SectionHeader icon={Phone} title="Histórico de Ligações" />
            <div className="bg-card/[0.02] rounded-xl border border-border/30 p-3">
              <CallHistoryPanel 
                calls={callHistory} 
                loading={callsLoading} 
                compact
                contactId={contact?.id}
                contactName={contact?.name}
              />
            </div>
          </section>

          {/* Dados da Empresa - se houver mais dados */}
          {contact.fleet_size && (
            <>
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <section>
                <SectionHeader icon={Building2} title="Dados da Frota" />
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-400/30">
                      <Target className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                       <span className="text-xs text-muted-foreground block">Tamanho da Frota</span>
                       <p className="text-xl font-bold text-emerald-300">{contact.fleet_size} veículos</p>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* Endereço Completo */}
          {hasAddress && contact.street && (
            <>
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <section>
                <SectionHeader icon={MapPin} title="Endereço Completo" />
                <div className="p-4 rounded-xl bg-card/[0.02] border border-border/30 space-y-2">
                  {contact.cep && (
                    <p className="text-xs text-muted-foreground">CEP: <span className="text-muted-foreground font-mono">{formatCEP(contact.cep)}</span></p>
                  )}
                  <p className="text-foreground">
                    {contact.street}
                    {contact.number && `, ${contact.number}`}
                    {contact.complement && ` - ${contact.complement}`}
                  </p>
                  {contact.neighborhood && <p className="text-muted-foreground">{contact.neighborhood}</p>}
                </div>
              </section>
            </>
          )}

          {/* Notas */}
          {contact.notes && (
            <>
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <section>
                <SectionHeader icon={FileText} title="Notas" />
                <p className="text-muted-foreground text-sm whitespace-pre-wrap bg-card/[0.02] p-4 rounded-xl border border-border/30">
                  {contact.notes}
                </p>
              </section>
            </>
          )}

          {/* Origem da Campanha (UTMs) */}
          {(contact.utm_source || contact.utm_campaign || contact.utm_content || contact.utm_term) && (
            <>
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <section>
                <SectionHeader icon={Target} title="Origem da Campanha" />
                <div className="space-y-2 text-sm bg-card/[0.02] p-4 rounded-xl border border-border/30">
                  {contact.utm_source && (
                    <div className="flex justify-between items-center p-2 rounded-lg hover:bg-card/[0.02] transition-colors">
                      <span className="text-muted-foreground">Fonte</span>
                      <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md">{contact.utm_source}</span>
                    </div>
                  )}
                  {contact.utm_campaign && (
                    <div className="flex justify-between items-center p-2 rounded-lg hover:bg-card/[0.02] transition-colors">
                      <span className="text-muted-foreground">Campanha</span>
                      <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md">{contact.utm_campaign}</span>
                    </div>
                  )}
                  {contact.utm_content && (
                    <div className="flex justify-between items-center p-2 rounded-lg hover:bg-card/[0.02] transition-colors">
                      <span className="text-muted-foreground">Conteúdo</span>
                      <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md">{contact.utm_content}</span>
                    </div>
                  )}
                  {contact.utm_term && (
                    <div className="flex justify-between items-center p-2 rounded-lg hover:bg-card/[0.02] transition-colors">
                      <span className="text-muted-foreground">Termo</span>
                      <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md">{contact.utm_term}</span>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {/* Última Interação */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <section>
            <SectionHeader icon={Calendar} title="Estágio do Negócio" />
            <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-transparent border border-violet-500/20 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-400/30">
                  <Calendar className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Última interação</span>
                  <p className="font-medium text-violet-300">{contact.lastContact || 'Qualificação IA'}</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ContactDetailsDrawer;
