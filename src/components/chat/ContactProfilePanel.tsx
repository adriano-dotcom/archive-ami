import React from 'react';
import {
  Phone, Mail, MapPin, User, Brain, Plus, FileText, Save, Pencil,
  Briefcase, PhoneCall, Loader2, X, Send, CheckCircle2, MessageSquare,
  Building2, Truck
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Input } from '../ui/input';
import { Pin } from 'lucide-react';
import { Button } from '../Button';
import { TagSelector } from '../TagSelector';
import { CallHistoryPanel } from '../CallHistoryPanel';
import WhatsAppCallHistoryPanel from '../WhatsAppCallHistoryPanel';
import { HandoffSummaryCard, ConversationSummaryNotes } from './index';
import { PhoneInput } from '../ui/phone-input';
import { UIConversation, TagDefinition } from '../../types';
import { formatRegionFromPhone } from '@/utils/dddRegionMapper';

interface ContactProfilePanelProps {
  activeChat: UIConversation;
  sdrName: string;
  // Edit state
  isEditingContact: boolean;
  setIsEditingContact: (v: boolean) => void;
  editName: string;
  setEditName: (v: string) => void;
  editEmail: string;
  setEditEmail: (v: string) => void;
  editCpf: string;
  setEditCpf: (v: string) => void;
  editPetName: string;
  setEditPetName: (v: string) => void;
  editPhone: string;
  setEditPhone: (v: string) => void;
  isSavingContact: boolean;
  handleSaveContactData: () => void;
  // Tags
  availableTags: TagDefinition[];
  isTagSelectorOpen: boolean;
  setIsTagSelectorOpen: (v: boolean) => void;
  handleToggleTag: (key: string) => void;
  handleCreateTag: (tag: { key: string; label: string; color: string; category: string }) => void;
  // Panel state
  isPinnedProfileInfo: boolean;
  setIsPinnedProfileInfo: (v: boolean) => void;
  onClose: () => void;
  // Call history
  callHistory: any[];
  callHistoryLoading: boolean;
  whatsappCallHistory: any[];
  whatsappCallsLoading: boolean;
  // Assignment
  teamMembers: any[];
  assignConversation: (conversationId: string, userId: string | null) => void;
  // Email
  emailsSentCount?: number;
  onOpenEmailModal: () => void;
}

const formatCpf = (cpf: string) => {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
};

const ContactProfilePanel: React.FC<ContactProfilePanelProps> = ({
  activeChat,
  sdrName,
  isEditingContact,
  setIsEditingContact,
  editName,
  setEditName,
  editEmail,
  setEditEmail,
  editCpf,
  setEditCpf,
  editPetName,
  setEditPetName,
  editPhone,
  setEditPhone,
  isSavingContact,
  handleSaveContactData,
  availableTags,
  isTagSelectorOpen,
  setIsTagSelectorOpen,
  handleToggleTag,
  handleCreateTag,
  isPinnedProfileInfo,
  setIsPinnedProfileInfo,
  onClose,
  callHistory,
  callHistoryLoading,
  whatsappCallHistory,
  whatsappCallsLoading,
  teamMembers,
  assignConversation,
  emailsSentCount,
  onOpenEmailModal,
}) => {
  return (
    <div className="w-80 border-l border-border bg-card/50 backdrop-blur-md flex flex-col flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-border flex-shrink-0">
        <span className="font-semibold text-foreground">Informações do Lead</span>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => {
              const newValue = !isPinnedProfileInfo;
              setIsPinnedProfileInfo(newValue);
              localStorage.setItem('pinnedProfileInfo', String(newValue));
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              isPinnedProfileInfo 
                ? 'bg-primary/20 text-primary' 
                : 'hover:bg-accent text-muted-foreground hover:text-foreground'
            }`}
            title={isPinnedProfileInfo ? 'Desafixar painel' : 'Fixar painel'}
          >
            <Pin className="w-4 h-4" />
          </button>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        {/* Identity */}
        <div className="flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-cyan-500 to-teal-600 shadow-xl mb-4">
            <img src={activeChat.contactAvatar} alt={activeChat.contactName} className="w-full h-full rounded-full object-cover border-2 border-slate-900" />
          </div>
          {isEditingContact ? (
            <Input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nome do lead"
              className="text-xl font-bold text-center bg-slate-950/50 border-slate-700 mb-1 max-w-[200px]"
            />
          ) : (
            <h3 className="text-xl font-bold text-white mb-1">{activeChat.contactName}</h3>
          )}
          <p className="text-sm text-slate-400 mb-4">
            {activeChat.clientMemory.lead_profile.lead_stage === 'new' ? 'Novo Lead' : 
             activeChat.clientMemory.lead_profile.lead_stage === 'qualified' ? 'Lead Qualificado' :
             activeChat.clientMemory.lead_profile.lead_stage}
          </p>
        </div>

        {/* Details List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dados do Transportador</h4>
            <button 
              onClick={() => setIsEditingContact(!isEditingContact)}
              className="text-cyan-500 hover:text-cyan-400 transition-colors p-1"
              title={isEditingContact ? "Cancelar edição" : "Editar dados"}
            >
              {isEditingContact ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
          </div>
          
          {/* Phone */}
          <div className="flex items-center gap-3 text-sm">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
              <Phone className="w-4 h-4" />
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-xs text-slate-500">Telefone</span>
              {isEditingContact ? (
                <PhoneInput
                  value={editPhone}
                  onChange={setEditPhone}
                  placeholder="+55 (00) 00000-0000"
                  className="h-8 text-sm bg-slate-950/50 border-slate-700"
                />
              ) : (
                <span className="text-slate-200 font-medium">{activeChat.contactPhone}</span>
              )}
            </div>
          </div>

          {/* Region */}
          {formatRegionFromPhone(activeChat.contactPhone) && (
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-xs text-slate-500">Região</span>
                <span className="text-slate-200 font-medium">{formatRegionFromPhone(activeChat.contactPhone)}</span>
              </div>
            </div>
          )}

          {/* Email */}
          <div className="flex items-center gap-3 text-sm">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
              <Mail className="w-4 h-4" />
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-xs text-slate-500">Email</span>
              {isEditingContact ? (
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className="h-8 text-sm bg-slate-950/50 border-slate-700"
                />
              ) : activeChat.contactEmail ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-cyan-400 font-medium">{activeChat.contactEmail}</span>
                  <button
                    onClick={onOpenEmailModal}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/40 rounded-md text-cyan-400 text-xs font-medium hover:from-cyan-500/30 hover:to-blue-500/30 hover:border-cyan-400/60 transition-all"
                    title="Enviar email"
                  >
                    <Send className="w-3 h-3" />
                    Enviar
                  </button>
                  {emailsSentCount !== undefined && emailsSentCount > 0 && (
                    <span 
                      className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-xs"
                      title={`${emailsSentCount} email(s) já enviado(s)`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {emailsSentCount}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-slate-500 italic">Não informado</span>
              )}
            </div>
          </div>

          {/* CPF */}
          <div className="flex items-center gap-3 text-sm">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-xs text-slate-500">CPF</span>
              {isEditingContact ? (
                <Input
                  type="text"
                  value={editCpf}
                  onChange={(e) => setEditCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="h-8 text-sm bg-slate-950/50 border-slate-700"
                />
              ) : (
                <span className="text-slate-200 font-medium">
                  {activeChat.contactCpf ? formatCpf(activeChat.contactCpf) : <span className="text-slate-500 italic">Não informado</span>}
                </span>
              )}
            </div>
          </div>

          {/* Tipo de Carga */}
          <div className="flex items-center gap-3 text-sm">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
              📦
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-xs text-slate-500">Tipo de Carga</span>
              {isEditingContact ? (
                <Input
                  type="text"
                  value={editPetName}
                  onChange={(e) => setEditPetName(e.target.value)}
                  placeholder="Ex.: carga geral, frigorificada, granel"
                  className="h-8 text-sm bg-slate-950/50 border-slate-700"
                />
              ) : (
                <span className="text-slate-200 font-medium">
                  {activeChat.contactPetName || <span className="text-slate-500 italic">Não informado</span>}
                </span>
              )}
            </div>
          </div>

          {/* Save Button */}
          {isEditingContact && (
            <Button
              onClick={handleSaveContactData}
              disabled={isSavingContact}
              className="w-full bg-cyan-600 hover:bg-cyan-700"
            >
              {isSavingContact ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar Alterações
            </Button>
          )}
        </div>

        <div className="h-px bg-slate-800/50 w-full"></div>

        {/* Call History */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <PhoneCall className="w-4 h-4" />
            Histórico de Ligações
          </h4>
          <CallHistoryPanel 
            calls={callHistory} 
            loading={callHistoryLoading}
            contactId={activeChat.contactId}
            contactName={activeChat.contactName}
            onNotesUpdate={(notes) => {
              console.log('Notas atualizadas via ligação:', notes.length, 'chars');
            }}
          />
        </div>

        {/* WhatsApp Call History */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Chamadas WhatsApp
          </h4>
          <WhatsAppCallHistoryPanel 
            calls={whatsappCallHistory} 
            loading={whatsappCallsLoading}
          />
        </div>

        <div className="h-px bg-slate-800/50 w-full"></div>

        {/* Handoff Summary */}
        <HandoffSummaryCard 
          ninaContext={activeChat.ninaContext} 
          agentSlug={activeChat.agentSlug}
          contactId={activeChat.contactId}
          contactEmail={activeChat.contactEmail}
          onOpenEmailModal={onOpenEmailModal}
        />

        <div className="h-px bg-slate-800/50 w-full"></div>

        {/* AI Memory Section */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Memória do(a) {sdrName}
          </h4>
          
          {activeChat.clientMemory.lead_profile.interests.length > 0 && (
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <span className="text-xs text-slate-400">Interesses</span>
              <p className="text-sm text-slate-200 mt-1">
                {activeChat.clientMemory.lead_profile.interests.join(', ')}
              </p>
            </div>
          )}

          {activeChat.clientMemory.sales_intelligence.pain_points.length > 0 && (
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <span className="text-xs text-slate-400">Dores Identificadas</span>
              <p className="text-sm text-slate-200 mt-1">
                {activeChat.clientMemory.sales_intelligence.pain_points.join(', ')}
              </p>
            </div>
          )}

          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <span className="text-xs text-slate-400">Próxima Ação Sugerida</span>
            <p className="text-sm text-slate-200 mt-1">
              {activeChat.clientMemory.sales_intelligence.next_best_action === 'qualify' ? 'Qualificar lead' :
               activeChat.clientMemory.sales_intelligence.next_best_action === 'demo' ? 'Agendar demonstração' :
               activeChat.clientMemory.sales_intelligence.next_best_action}
            </p>
          </div>

          <div className="text-xs text-slate-500 text-center">
            Total de conversas: {activeChat.clientMemory.interaction_summary.total_conversations}
          </div>
        </div>

        <div className="h-px bg-slate-800/50 w-full"></div>

        {/* Assigned User */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4" />
            Responsável
          </h4>
          <select
            value={activeChat.assignedUserId || ''}
            onChange={(e) => {
              const userId = e.target.value || null;
              assignConversation(activeChat.id, userId);
            }}
            className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all"
          >
            <option value="">Não atribuído</option>
            {teamMembers.map(member => (
              <option key={member.id} value={member.id}>
                {member.name} ({member.role})
              </option>
            ))}
          </select>
        </div>

        <div className="h-px bg-slate-800/50 w-full"></div>

        {/* Tags */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            Tags
            <Popover open={isTagSelectorOpen} onOpenChange={setIsTagSelectorOpen}>
              <PopoverTrigger asChild>
                <button className="text-cyan-500 hover:text-cyan-400 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0 bg-slate-900 border-slate-700" align="end">
                <TagSelector 
                  availableTags={availableTags}
                  selectedTags={activeChat.tags || []}
                  onToggleTag={handleToggleTag}
                  onCreateTag={handleCreateTag}
                />
              </PopoverContent>
            </Popover>
          </h4>
          <div className="flex flex-wrap gap-2">
            {activeChat.tags && activeChat.tags.length > 0 ? (
              activeChat.tags.map(tagKey => {
                const tagDef = availableTags.find(t => t.key === tagKey);
                return (
                  <span 
                    key={tagKey}
                    style={{ 
                      backgroundColor: tagDef?.color ? `${tagDef.color}20` : 'rgba(59, 130, 246, 0.2)',
                      borderColor: tagDef?.color || '#3b82f6'
                    }}
                    className="px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5 group hover:brightness-110 transition-all"
                  >
                    <span className="text-slate-200">{tagDef?.label || tagKey}</span>
                    <button
                      onClick={() => handleToggleTag(tagKey)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-slate-400 hover:text-slate-200" />
                    </button>
                  </span>
                );
              })
            ) : (
              <p className="text-xs text-slate-500 italic">Nenhuma tag adicionada</p>
            )}
          </div>
        </div>

        {/* Notes Area with AI Summary */}
        <ConversationSummaryNotes
          conversationId={activeChat.id}
          contactId={activeChat.contactId}
          messages={activeChat.messages}
          callHistory={callHistory}
          initialNotes={activeChat.notes}
          contactName={activeChat.contactName}
          agentName={activeChat.agentName || 'Adri'}
        />
      </div>
    </div>
  );
};

export default ContactProfilePanel;
