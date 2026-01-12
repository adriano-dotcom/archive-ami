import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Search, MoreVertical, Phone, Paperclip, Send, Check, CheckCheck, 
  Smile, Loader2, Mic, MessageSquare, Info, X, Mail, MapPin, 
  Tag, User, Pause, Brain, Plus, Building2, FileText, Save, Pencil, FileType,
  Briefcase, ExternalLink, Inbox, Archive, ArchiveRestore, PhoneCall, Clock, AlertTriangle,
  ArrowLeft, Keyboard, XCircle, PlayCircle, Pin, Sparkles, UserCheck, PauseCircle, Bot, AlertCircle, Download, Eye, CheckCircle2
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { 
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { MessageDirection, MessageType, UIConversation, UIMessage, ConversationStatus, TagDefinition } from '../types';
import { Button } from './Button';
import { Button as ShadcnButton } from './ui/button';
import { useConversations } from '../hooks/useConversations';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { api } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import { TagSelector } from './TagSelector';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { CallConfirmationModal } from './CallConfirmationModal';
import { useActiveCall } from '@/hooks/useActiveCall';
import { ActiveCallIndicator } from './ActiveCallIndicator';
import { CallHistoryPanel } from './CallHistoryPanel';
import CallTimelineCard from './CallTimelineCard';
import { useNinaProcessingStatus } from '@/hooks/useNinaProcessingStatus';
import { TypingIndicator } from './TypingIndicator';
import { SendWhatsAppTemplateModal } from './SendWhatsAppTemplateModal';
import { AudioPlayer } from './AudioPlayer';
import { QuickQuestionsDropdown } from './QuickQuestionsDropdown';
import { formatRegionFromPhone } from '@/utils/dddRegionMapper';
import { LeadScoreBadge, WaitingTimeBadge, HandoffSummaryCard, MessageToneAssistant, ConversationSummaryNotes, PDFPreviewModal, VideoThumbnailPreview } from './chat';
import { EmailComposeModal } from './EmailComposeModal';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface AgentQuestion {
  order: number;
  question: string;
}

const ChatInterface: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { conversations, loading, sendMessage, updateStatus, markAsRead, assignConversation, archiveConversation, unarchiveConversation, fetchArchivedConversations, refetch } = useConversations();
  const { user } = useAuth();
  const { sdrName, companyName } = useCompanySettings();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const [isPinnedProfileInfo, setIsPinnedProfileInfo] = useState(() => {
    const saved = localStorage.getItem('pinnedProfileInfo');
    return saved === 'true';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([]);
  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  
  // Mobile navigation state
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  
  const [viewingArchived, setViewingArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  
  // Status filter state - includes agent slugs as special values
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<ConversationStatus | string | null>(null);
  const [showClosedConversations, setShowClosedConversations] = useState(false);
  
  // Agents for filter (fetched from DB)
  const [filterAgents, setFilterAgents] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  
  // Owner filter state
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string | null>(null);
  
  // Editable contact fields
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCnpj, setEditCnpj] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [isLookingUpCnpj, setIsLookingUpCnpj] = useState(false);
  
  
  // Call modal state
  const [showCallModal, setShowCallModal] = useState(false);
  const [defaultExtension, setDefaultExtension] = useState('1000');
  
  // WhatsApp template modal state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  
  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  
  // Keyboard shortcuts help state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  
  // Quick questions state (for / command)
  const [agentQuestions, setAgentQuestions] = useState<AgentQuestion[]>([]);
  const [showQuickQuestions, setShowQuickQuestions] = useState(false);
  const [quickQuestionsFilter, setQuickQuestionsFilter] = useState('');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  
  // Agent selector state
  const [availableAgents, setAvailableAgents] = useState<{id: string; name: string; slug: string}[]>([]);
  const [isChangingAgent, setIsChangingAgent] = useState(false);
  
  // Close conversation state
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [isClosingConversation, setIsClosingConversation] = useState(false);
  const [isReopeningConversation, setIsReopeningConversation] = useState(false);
  
  // PDF preview state
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  
  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // Input refs for keyboard shortcuts
  const searchInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  
  // WhatsApp window real-time timer state
  const [windowTimeRemaining, setWindowTimeRemaining] = useState<{ isOpen: boolean; hoursRemaining: number | null }>({ isOpen: false, hoursRemaining: null });
  
  // Navigate to chat view on mobile when selecting a chat
  useEffect(() => {
    if (isMobile && selectedChatId) {
      setMobileView('chat');
    }
  }, [selectedChatId, isMobile]);

  // Handle back button on mobile
  const handleMobileBack = () => {
    setMobileView('list');
    setSelectedChatId(null);
  };

  // Swipe gesture for mobile back navigation
  const dragX = useMotionValue(0);
  const chatOpacity = useTransform(dragX, [0, 150], [1, 0.5]);
  
  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x > 100) {
      handleMobileBack();
    }
  };

  const activeChat = conversations.find(c => c.id === selectedChatId);
  const queryClient = useQueryClient();
  
  // Query for emails sent count
  const { data: emailsSentCount } = useQuery({
    queryKey: ['contact-emails-count', activeChat?.contactId],
    queryFn: async () => {
      if (!activeChat?.contactId) return 0;
      
      const { count, error } = await supabase
        .from('collection_email_logs')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', activeChat.contactId)
        .eq('status', 'sent');
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!activeChat?.contactId,
  });
  
  // Nina processing status for typing indicator
  const { isAggregating, isProcessing, agentName } = useNinaProcessingStatus(selectedChatId);
  
  // Load agent qualification questions when agent changes
  useEffect(() => {
    const loadAgentQuestions = async () => {
      if (activeChat?.agentId) {
        const { data: agent } = await supabase
          .from('agents')
          .select('qualification_questions')
          .eq('id', activeChat.agentId)
          .maybeSingle();
        
        if (agent?.qualification_questions && Array.isArray(agent.qualification_questions)) {
          const normalized = agent.qualification_questions.map((q: any, idx: number) => ({
            order: q.order || idx + 1,
            question: typeof q === 'string' ? q : q.question
          }));
          setAgentQuestions(normalized);
        } else {
          setAgentQuestions([]);
        }
      } else {
        setAgentQuestions([]);
      }
    };
    loadAgentQuestions();
  }, [activeChat?.agentId]);
  
  // Handle input change with / command detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputText(value);
    
    // Detect / command for quick questions (only when human is in control)
    if (activeChat?.status === 'human' && (value === '/' || value.startsWith('/'))) {
      setShowQuickQuestions(true);
      setQuickQuestionsFilter(value.slice(1));
      setSelectedQuestionIndex(0);
    } else {
      setShowQuickQuestions(false);
      setQuickQuestionsFilter('');
    }
  };
  
  // Handle quick question selection
  const handleQuickQuestionSelect = (question: string) => {
    setInputText(question);
    setShowQuickQuestions(false);
    setQuickQuestionsFilter('');
    messageInputRef.current?.focus();
  };
  
  // Handle keyboard navigation in quick questions
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showQuickQuestions) {
      const filteredQuestions = agentQuestions.filter(q => 
        q.question.toLowerCase().includes(quickQuestionsFilter.toLowerCase())
      );
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedQuestionIndex(prev => Math.min(prev + 1, filteredQuestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedQuestionIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && filteredQuestions.length > 0) {
        e.preventDefault();
        handleQuickQuestionSelect(filteredQuestions[selectedQuestionIndex].question);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowQuickQuestions(false);
        setInputText('');
        return;
      }
    }
    
    // Normal Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Calculate WhatsApp window remaining time
  const calculateWindowRemaining = (windowStart: string | null): { isOpen: boolean; hoursRemaining: number | null } => {
    if (!windowStart) return { isOpen: false, hoursRemaining: null };
    const start = new Date(windowStart);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const msRemaining = end.getTime() - now.getTime();
    if (msRemaining <= 0) return { isOpen: false, hoursRemaining: 0 };
    return { 
      isOpen: true, 
      hoursRemaining: msRemaining / (1000 * 60 * 60) 
    };
  };
  
  // Real-time timer for WhatsApp window countdown
  useEffect(() => {
    if (!activeChat?.whatsappWindowStart) {
      setWindowTimeRemaining({ isOpen: false, hoursRemaining: null });
      return;
    }
    
    // Calculate immediately
    setWindowTimeRemaining(calculateWindowRemaining(activeChat.whatsappWindowStart));
    
    // Update every minute
    const interval = setInterval(() => {
      setWindowTimeRemaining(calculateWindowRemaining(activeChat.whatsappWindowStart));
    }, 60000);
    
    return () => clearInterval(interval);
  }, [activeChat?.id, activeChat?.whatsappWindowStart]);
  
  // Get badge color based on remaining time
  const getWindowBadgeStyle = () => {
    const hours = windowTimeRemaining.hoursRemaining;
    if (hours === null || !windowTimeRemaining.isOpen) {
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    }
    if (hours > 6) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (hours > 1) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (hours > 0.25) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse';
  };
  
  // Format remaining time for display
  const formatWindowTime = () => {
    const hours = windowTimeRemaining.hoursRemaining;
    if (hours === null) return 'Janela aberta';
    if (hours >= 1) {
      const h = Math.floor(hours);
      const m = Math.floor((hours - h) * 60);
      return m > 0 ? `${h}h ${m}min` : `${h}h restantes`;
    }
    return `${Math.max(1, Math.floor(hours * 60))}min restantes`;
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Active call state
  const { activeCall, callHistory, loading: callHistoryLoading, dismissActiveCall } = useActiveCall(selectedChatId);


  // ===== PRESENCE HEARTBEAT =====
  // Update last_active every 60 seconds to indicate operator is online
  useEffect(() => {
    if (!user?.email) return;
    
    const updatePresence = async () => {
      try {
        await supabase
          .from('team_members')
          .update({ last_active: new Date().toISOString() })
          .eq('email', user.email);
      } catch (err) {
        console.error('[Presence] Error updating last_active:', err);
      }
    };
    
    // Update immediately on mount
    updatePresence();
    
    // Update every 60 seconds
    const interval = setInterval(updatePresence, 60000);
    
    return () => clearInterval(interval);
  }, [user?.email]);
  // ===== END PRESENCE HEARTBEAT =====

  // Load tag definitions, team members, and pipelines
  useEffect(() => {
    api.fetchTagDefinitions().then(setAvailableTags).catch(err => {
      console.error('Error loading tags:', err);
      toast.error('Erro ao carregar tags');
    });

    api.fetchTeam().then(setTeamMembers).catch(err => {
      console.error('Error loading team members:', err);
    });

    // Pipelines removed - system now focused on collections and claims

    // Fetch archived conversations count
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', false)
      .then(({ count }) => {
        setArchivedCount(count || 0);
      });

    // Fetch extension for calls - operator's personal extension or global fallback
    const loadExtension = async () => {
      // 1. Try operator's personal extension
      if (user?.email) {
        const { data: teamMember } = await supabase
          .from('team_members')
          .select('api4com_extension')
          .eq('email', user.email)
          .maybeSingle();
        
        if (teamMember?.api4com_extension) {
          setDefaultExtension(teamMember.api4com_extension);
          return;
        }
      }
      
      // 2. Fallback to global default
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('api4com_default_extension')
        .maybeSingle();
      
      if (settings?.api4com_default_extension) {
        setDefaultExtension(settings.api4com_default_extension);
      }
    };
    loadExtension();

    // Fetch available agents (for both agent selector and status filters)
    supabase
      .from('agents')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) {
          setAvailableAgents(data);
          setFilterAgents(data);
        }
      });
  }, []);

  // Auto-select first conversation or from URL param (only on initial load)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const conversationParam = urlParams.get('conversation');
    const phoneParam = urlParams.get('phone');
    
    // Function to fetch a specific conversation not in cache
    const fetchAndSelectConversation = async (conversationId: string) => {
      try {
        // Refetch conversations including the specific one
        await refetch(conversationId);
        setSelectedChatId(conversationId);
        window.history.replaceState({}, '', window.location.pathname);
      } catch (error) {
        console.error('[ChatInterface] Erro ao buscar conversa:', error);
        if (conversations.length > 0 && !isMobile) {
          setSelectedChatId(conversations[0].id);
        }
      }
    };
    
    // Only use URL param if no chat is selected yet
    if (!selectedChatId && !loading) {
      if (conversationParam) {
        // Check if conversation is in cache
        if (conversations.some(c => c.id === conversationParam)) {
          setSelectedChatId(conversationParam);
          window.history.replaceState({}, '', window.location.pathname);
        } else {
          // Conversation not in cache, fetch it directly
          fetchAndSelectConversation(conversationParam);
        }
      } else if (phoneParam) {
        // Find conversation by phone number
        const cleanPhone = phoneParam.replace(/\D/g, '');
        const matchingConv = conversations.find(c => 
          c.contactPhone.replace(/\D/g, '').includes(cleanPhone) ||
          cleanPhone.includes(c.contactPhone.replace(/\D/g, ''))
        );
        if (matchingConv) {
          setSelectedChatId(matchingConv.id);
          // Clear URL param after selection
          window.history.replaceState({}, '', window.location.pathname);
        }
      } else if (conversations.length > 0 && !isMobile) {
        // Only auto-select first conversation on desktop, not mobile
        setSelectedChatId(conversations[0].id);
      }
    }
  }, [conversations, selectedChatId, loading, refetch, isMobile]);


  useEffect(() => {
    if (activeChat) {
      setEditName(activeChat.contactName || '');
      setEditEmail(activeChat.contactEmail || '');
      setEditCnpj(activeChat.contactCnpj || '');
      setEditCompany(activeChat.contactCompany || '');
      setIsEditingContact(false);
    }
  }, [activeChat?.id, activeChat?.contactName, activeChat?.contactEmail, activeChat?.contactCnpj, activeChat?.contactCompany]);

  // Deal/pipeline logic removed - system now focused on collections and claims

  // Handle agent change
  const handleChangeAgent = async (agentId: string) => {
    if (!activeChat || isChangingAgent || agentId === activeChat.agentId) return;
    setIsChangingAgent(true);
    
    try {
      const selectedAgent = availableAgents.find(a => a.id === agentId);
      
      // Update conversation with new agent
      const { error } = await supabase
        .from('conversations')
        .update({ current_agent_id: agentId })
        .eq('id', activeChat.id);
      
      if (error) throw error;
      
      toast.success(`Agente alterado para ${selectedAgent?.name}`);
      refetch();
    } catch (error) {
      console.error('Error changing agent:', error);
      toast.error('Erro ao alterar agente');
    } finally {
      setIsChangingAgent(false);
    }
  };

  // Handle close conversation
  const handleCloseConversation = async () => {
    if (!activeChat || isClosingConversation) return;
    setIsClosingConversation(true);
    
    try {
      // Mark conversation as closed and inactive
      const { error: convError } = await supabase
        .from('conversations')
        .update({ 
          status: 'closed' as any,
          is_active: false
        })
        .eq('id', activeChat.id);
      
      if (convError) throw convError;
      
      toast.success('Atendimento encerrado', {
        description: 'Conversa encerrada'
      });
      
      setShowCloseModal(false);
      setCloseReason('');
      setSelectedChatId(null);
      refetch();
    } catch (error) {
      console.error('Error closing conversation:', error);
      toast.error('Erro ao encerrar atendimento');
    } finally {
      setIsClosingConversation(false);
    }
  };

  // Handle reopen conversation (bring back from closed)
  const handleReopenConversation = async () => {
    if (!activeChat || isReopeningConversation) return;
    
    // Check if 24-hour WhatsApp window is expired
    const windowStart = activeChat.whatsappWindowStart 
      ? new Date(activeChat.whatsappWindowStart) 
      : null;
    const now = new Date();
    const windowExpired = !windowStart || 
      (now.getTime() - windowStart.getTime() > 24 * 60 * 60 * 1000);
    
    if (windowExpired) {
      // Window expired - need to use Meta template
      setShowTemplateModal(true);
      toast.info('Janela de 24h expirada. Selecione um template para reabrir o contato.');
      return;
    }
    
    // Window still open - can reactivate directly
    setIsReopeningConversation(true);
    try {
      // Reactivate conversation
      const { error: convError } = await supabase
        .from('conversations')
        .update({ 
          status: 'nina' as any,
          is_active: true
        })
        .eq('id', activeChat.id);
      
      if (convError) throw convError;
      
      toast.success('Atendimento reaberto - conversa voltou para IA');
      await refetch();
    } catch (error) {
      console.error('Error reopening conversation:', error);
      toast.error('Erro ao reabrir atendimento');
    } finally {
      setIsReopeningConversation(false);
    }
  };

  // Handle file selection for attachment upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;
    
    // Validate file size (max 16MB for WhatsApp)
    if (file.size > 16 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 16MB para WhatsApp.');
      e.target.value = '';
      return;
    }
    
    setUploadingFile(true);
    try {
      const operatorName = user?.email 
        ? teamMembers.find(m => m.email === user.email)?.name 
        : undefined;
      
      await api.sendMediaMessage(
        activeChat.id, 
        file, 
        operatorName
      );
      toast.success('Anexo enviado!');
    } catch (err) {
      console.error('Erro ao enviar anexo:', err);
      toast.error('Erro ao enviar anexo');
    } finally {
      setUploadingFile(false);
      // Reset input to allow selecting same file again
      e.target.value = '';
    }
  };

  // Mark as read when selecting conversation
  useEffect(() => {
    if (selectedChatId && activeChat?.unreadCount > 0) {
      markAsRead(selectedChatId);
    }
  }, [selectedChatId, activeChat?.unreadCount, markAsRead]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeChat) {
      scrollToBottom();
    }
  }, [activeChat?.id, selectedChatId]); 

  useEffect(() => {
    scrollToBottom();
  }, [activeChat?.messages]);

  // Scroll to bottom when typing indicator appears
  useEffect(() => {
    if (isAggregating || isProcessing) {
      scrollToBottom();
    }
  }, [isAggregating, isProcessing]);

  const handleToggleTag = async (tagKey: string) => {
    if (!activeChat) return;
    
    const currentTags = activeChat.tags || [];
    const newTags = currentTags.includes(tagKey)
      ? currentTags.filter(t => t !== tagKey)
      : [...currentTags, tagKey];
    
    try {
      await api.updateContactTags(activeChat.contactId, newTags);
      toast.success('Tag atualizada');
    } catch (error) {
      console.error('Error updating tag:', error);
      toast.error('Erro ao atualizar tag');
    }
  };

  const handleCreateTag = async (tag: { key: string; label: string; color: string; category: string }) => {
    try {
      const newTag = await api.createTagDefinition(tag);
      setAvailableTags(prev => [...prev, newTag]);
      toast.success('Tag criada com sucesso');
      
      // Adicionar a tag ao contato automaticamente
      if (activeChat) {
        await handleToggleTag(tag.key);
      }
    } catch (error) {
      console.error('Error creating tag:', error);
      toast.error('Erro ao criar tag');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !activeChat) return;

    // Check if WhatsApp window is closed (using real-time state)
    if (!windowTimeRemaining.isOpen) {
      toast.error('Janela de 24h expirou. Use um template para reabrir a conversa.');
      return;
    }

    const content = inputText.trim();
    setInputText('');
    
    // Extract operator name from email (e.g., "adriano.jacometo@email.com" -> "Adriano Jacometo")
    const operatorName = user?.email 
      ? user.email.split('@')[0]
          .split(/[._-]/)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ')
      : undefined;
    
    await sendMessage(activeChat.id, content, operatorName);
  };

  const handleStatusChange = async (status: ConversationStatus) => {
    if (!activeChat) return;
    // Extract display name from user email
    const userName = user?.email ? 
      user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1) : 
      undefined;
    await updateStatus(activeChat.id, status, user?.id, userName);
  };

  // CNPJ Lookup via BrasilAPI
  const handleCnpjLookup = async () => {
    const cleanCnpj = editCnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      toast.error('CNPJ inválido. Digite 14 dígitos.');
      return;
    }

    setIsLookingUpCnpj(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      if (!response.ok) {
        throw new Error('CNPJ não encontrado');
      }
      const data = await response.json();
      
      // Auto-fill company name
      const companyName = data.nome_fantasia || data.razao_social || '';
      setEditCompany(companyName);
      
      // Auto-save CNPJ and company after lookup
      if (activeChat) {
        await api.updateContact(activeChat.contactId, {
          cnpj: cleanCnpj,
          company: companyName || null
        });
        // Refresh conversations to update UI with saved data
        await refetch();
        toast.success(`Empresa encontrada e salva: ${companyName}`);
      }
    } catch (error) {
      console.error('CNPJ lookup error:', error);
      toast.error('CNPJ não encontrado na Receita Federal');
    } finally {
      setIsLookingUpCnpj(false);
    }
  };

  // Save contact data
  const handleSaveContactData = async () => {
    if (!activeChat) return;
    
    setIsSavingContact(true);
    try {
      await api.updateContact(activeChat.contactId, {
        name: editName.trim() || null,
        email: editEmail.trim() || null,
        cnpj: editCnpj.replace(/\D/g, '') || null,
        company: editCompany.trim() || null
      });
      
      // Refresh conversations to update UI with saved data
      await refetch();
      toast.success('Dados do contato atualizados');
      setIsEditingContact(false);
    } catch (error) {
      console.error('Error saving contact:', error);
      toast.error('Erro ao salvar dados');
    } finally {
      setIsSavingContact(false);
    }
  };

  // Deal/pipeline functionality removed - system focused on collections and claims

  // Format CNPJ for display
  const formatCnpj = (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return cnpj;
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  // Calculate conversation counts for filters
  const conversationCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: conversations.length,
    };
    return counts;
  }, [conversations]);

  // Calculate status counts for filters
  const statusCounts = useMemo(() => {
    const baseConversations = conversations;
    
    // Calculate counts per agent dynamically
    const agentCounts: Record<string, number> = {};
    filterAgents.forEach(agent => {
      agentCounts[agent.slug] = baseConversations.filter(
        c => c.status === 'nina' && c.agentSlug === agent.slug
      ).length;
    });
    
    return {
      agents: agentCounts,
      human: baseConversations.filter(c => c.status === 'human').length,
      paused: baseConversations.filter(c => c.status === 'paused').length,
    };
  }, [conversations, filterAgents]);

  // Calculate available owners for filter
  const availableOwners = useMemo(() => {
    let baseConversations = conversations;
    
    if (selectedStatusFilter) {
      baseConversations = baseConversations.filter(c => c.status === selectedStatusFilter);
    }
    
    const ownersMap = new Map<string, { id: string; name: string; count: number }>();
    baseConversations.forEach(c => {
      if (c.assignedUserId && c.assignedUserName) {
        const existing = ownersMap.get(c.assignedUserId);
        if (existing) {
          existing.count++;
        } else {
          ownersMap.set(c.assignedUserId, { id: c.assignedUserId, name: c.assignedUserName, count: 1 });
        }
      }
    });
    return Array.from(ownersMap.values());
  }, [conversations, selectedStatusFilter]);

  const filteredConversations = conversations
    .filter(chat => {
      // Hide closed conversations by default (unless toggle is on)
      if (!showClosedConversations && chat.status === 'closed') {
        return false;
      }
      
      // Status filter - handle agent slugs as special case
      const agentSlugs = filterAgents.map(a => a.slug);
      if (selectedStatusFilter && agentSlugs.includes(selectedStatusFilter)) {
        // Filter by specific agent
        if (chat.status !== 'nina' || chat.agentSlug !== selectedStatusFilter) return false;
      } else if (selectedStatusFilter && (selectedStatusFilter === 'human' || selectedStatusFilter === 'paused' || selectedStatusFilter === 'closed')) {
        // Standard status filter
        if (chat.status !== selectedStatusFilter) return false;
      }
      
      // Owner filter
      if (selectedOwnerFilter && chat.assignedUserId !== selectedOwnerFilter) {
        return false;
      }
      
      // Text search filter
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        chat.contactName.toLowerCase().includes(query) ||
        chat.contactPhone.includes(query) ||
        chat.lastMessage.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      // Sort by unread first
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      
      // Then by last message time (most recent first)
      const timeA = a.messages.length > 0 ? new Date(a.messages[a.messages.length - 1].timestamp).getTime() : 0;
      const timeB = b.messages.length > 0 ? new Date(b.messages[b.messages.length - 1].timestamp).getTime() : 0;
      return timeB - timeA;
    });

  // Keyboard shortcuts handlers
  const handleNextConversation = useCallback(() => {
    const currentIndex = filteredConversations.findIndex(c => c.id === selectedChatId);
    const nextIndex = Math.min(currentIndex + 1, filteredConversations.length - 1);
    if (nextIndex !== currentIndex && nextIndex >= 0) {
      setSelectedChatId(filteredConversations[nextIndex].id);
    }
  }, [filteredConversations, selectedChatId]);

  const handlePrevConversation = useCallback(() => {
    const currentIndex = filteredConversations.findIndex(c => c.id === selectedChatId);
    const prevIndex = Math.max(currentIndex - 1, 0);
    if (prevIndex !== currentIndex && currentIndex > 0) {
      setSelectedChatId(filteredConversations[prevIndex].id);
    }
  }, [filteredConversations, selectedChatId]);

  // Keyboard shortcuts integration
  useKeyboardShortcuts({
    onNextConversation: handleNextConversation,
    onPrevConversation: handlePrevConversation,
    onFocusSearch: () => searchInputRef.current?.focus(),
    onFocusMessage: () => messageInputRef.current?.focus(),
    onSetStatusNina: () => activeChat && handleStatusChange('nina'),
    onSetStatusHuman: () => activeChat && handleStatusChange('human'),
    onSetStatusPaused: () => activeChat && handleStatusChange('paused'),
    onToggleInfo: () => setShowProfileInfo(prev => !prev),
    onCall: () => activeChat && setShowCallModal(true),
    onTemplate: () => activeChat && setShowTemplateModal(true),
    onArchive: () => activeChat && archiveConversation(activeChat.id),
    onShowHelp: () => setShowShortcutsHelp(prev => !prev),
  }, !showCallModal && !showTemplateModal && !showShortcutsHelp);

  const renderStatusBadge = (status: ConversationStatus, operatorName?: string | null) => {
    // iOS 18 style status badges with gradients and glow
    const config: Record<string, { label: string; icon: typeof Sparkles; gradient: string; iconColor: string; borderColor: string; glow?: string }> = {
      nina: { 
        label: sdrName, 
        icon: Sparkles, 
        gradient: 'bg-gradient-to-r from-violet-500/25 to-purple-500/25',
        iconColor: 'text-violet-400',
        borderColor: 'border-violet-500/40',
        glow: 'shadow-lg shadow-violet-500/15'
      },
      human: { 
        label: operatorName || 'Humano', 
        icon: UserCheck, 
        gradient: 'bg-gradient-to-r from-emerald-500/25 to-teal-500/25',
        iconColor: 'text-emerald-400',
        borderColor: 'border-emerald-500/40',
        glow: 'shadow-lg shadow-emerald-500/15'
      },
      paused: { 
        label: 'Pausado', 
        icon: PauseCircle, 
        gradient: 'bg-gradient-to-r from-amber-500/25 to-orange-500/25',
        iconColor: 'text-amber-400',
        borderColor: 'border-amber-500/40',
        glow: 'shadow-lg shadow-amber-500/15'
      },
      closed: { 
        label: 'Encerrado', 
        icon: XCircle, 
        gradient: 'bg-gradient-to-r from-slate-600/25 to-slate-500/25',
        iconColor: 'text-slate-400',
        borderColor: 'border-slate-500/40'
      }
    };
    const statusConfig = config[status];
    if (!statusConfig) return null;
    const { label, icon: Icon, gradient, iconColor, borderColor, glow } = statusConfig;
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border backdrop-blur-sm flex items-center gap-1 ${gradient} ${borderColor} ${glow || ''}`}>
        <Icon className={`w-3 h-3 ${iconColor}`} />
        <span className={iconColor}>{label}</span>
      </span>
    );
  };

  const renderMessageContent = (msg: UIMessage) => {
    if (msg.type === MessageType.IMAGE) {
      return (
        <div className="mb-1 group relative">
          <img 
            src={msg.mediaUrl || msg.content} 
            alt="Anexo" 
            className="rounded-lg max-w-full h-auto max-h-72 object-cover border border-slate-700/50 shadow-lg"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://placehold.co/300x200/1e293b/cbd5e1?text=Erro+Imagem';
            }}
          />
        </div>
      );
    }

    // Detect audio by type OR by media URL extension (fallback)
    const isAudioMessage = msg.type === MessageType.AUDIO || 
      (msg.mediaUrl && /\.(ogg|opus|mp3|wav|m4a|oga|aac|webm)(\?|$)/i.test(msg.mediaUrl));
    
    if (isAudioMessage) {
      return (
        <AudioPlayer
          messageId={msg.id}
          mediaUrl={msg.mediaUrl}
          transcription={msg.content}
          isOutgoing={msg.direction === MessageDirection.OUTGOING}
        />
      );
    }

    // Video message
    if (msg.type === MessageType.VIDEO) {
      const caption = msg.content || '';
      const hasVideoUrl = msg.mediaUrl && msg.mediaUrl.length > 0;
      
      return (
        <div className="max-w-xs">
          {hasVideoUrl ? (
            <div className="rounded-lg overflow-hidden bg-slate-800/50 border border-slate-700/50">
              <video 
                className="w-full max-h-64 object-contain bg-black"
                controls
                preload="metadata"
                playsInline
              >
                <source src={msg.mediaUrl!} type="video/mp4" />
                Seu navegador não suporta vídeo.
              </video>
              {caption && caption !== '[vídeo]' && (
                <p className="p-2 text-sm text-white">{caption}</p>
              )}
              <div className="flex items-center gap-2 p-2 border-t border-slate-700/30">
                <a 
                  href={msg.mediaUrl!} 
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Baixar vídeo
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <div className="bg-purple-500/20 p-2.5 rounded-lg shrink-0">
                <PlayCircle className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Vídeo</p>
                <span className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" />
                  Vídeo não disponível
                </span>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Document message (PDF, DOC, etc.)
    if (msg.type === MessageType.DOCUMENT) {
      const filename = msg.content || 'documento';
      const hasDownloadUrl = msg.mediaUrl && msg.mediaUrl.length > 0;
      const isPDF = msg.mediaUrl?.toLowerCase().includes('.pdf');
      
      return (
        <div className="flex items-center gap-3 bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 max-w-xs">
          <div className={`${isPDF ? 'bg-red-500/20' : 'bg-blue-500/20'} p-2.5 rounded-lg shrink-0`}>
            <FileText className={`w-5 h-5 ${isPDF ? 'text-red-400' : 'text-blue-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate" title={filename}>{filename}</p>
            {hasDownloadUrl ? (
              <div className="flex items-center gap-2 mt-1.5">
                {isPDF && (
                  <button
                    onClick={() => setPdfPreview({ url: msg.mediaUrl!, filename })}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    Visualizar
                  </button>
                )}
                <a 
                  href={msg.mediaUrl!} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Baixar
                </a>
              </div>
            ) : (
              <span className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" />
                Arquivo não disponível
              </span>
            )}
          </div>
        </div>
      );
    }

    return <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>;
  };

  if (loading) {
    return (
      <div className="flex h-full bg-slate-950 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
          <p className="text-sm text-slate-500">Sincronizando conversas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-slate-950 md:rounded-tl-2xl overflow-hidden md:border-t md:border-l border-slate-800/50 shadow-2xl">
      
      {/* Left Sidebar: Chat List */}
      <div className={`${isMobile ? (mobileView === 'list' ? 'w-full' : 'hidden') : 'w-80 lg:w-96'} border-r border-slate-800 flex flex-col bg-slate-900/50 backdrop-blur-md z-20 flex-shrink-0`}>
        {/* Search Header */}
        <div className="p-4 border-b border-slate-800/50">
          <h2 className="text-lg font-bold text-white mb-3 px-1">
            {viewingArchived ? '📦 Arquivados' : 'Chats Ativos'}
          </h2>
          
          {/* Filter Pills - iOS 26 Style */}
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedStatusFilter(null)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-all duration-300 ${
                !viewingArchived && selectedStatusFilter === null
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-500/30 scale-[1.02] border-transparent'
                  : 'bg-slate-800/40 backdrop-blur-xl text-slate-300 border border-white/10 hover:bg-slate-700/50 hover:border-white/20 hover:scale-[1.02]'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Todos
              <span className="text-[10px] opacity-60">({conversationCounts.all})</span>
            </button>
            {/* Arquivados */}
            <button
              onClick={async () => {
                const newViewingArchived = !viewingArchived;
                setViewingArchived(newViewingArchived);
                setSelectedChatId(null);
                if (newViewingArchived) {
                  await fetchArchivedConversations();
                } else {
                  await refetch();
                  const { count } = await supabase
                    .from('conversations')
                    .select('id', { count: 'exact', head: true })
                    .eq('is_active', false);
                  setArchivedCount(count || 0);
                }
              }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-all duration-300 ${
                viewingArchived
                  ? 'bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-lg shadow-slate-500/30 scale-[1.02] border-transparent'
                  : 'bg-slate-800/40 backdrop-blur-xl text-slate-300 border border-white/10 hover:bg-slate-700/50 hover:border-white/20 hover:scale-[1.02]'
              }`}
            >
              <Archive className="w-4 h-4" />
              {viewingArchived ? 'Voltar aos Ativos' : 'Arquivados'}
              {!viewingArchived && <span className="text-[10px] opacity-60">({archivedCount})</span>}
            </button>
          </div>
          
          {/* Status Filter Pills - iOS 26 Style */}
          {!viewingArchived && (
            <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
              {/* Todos os Status */}
              <button
                onClick={() => setSelectedStatusFilter(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-all duration-300 ${
                  selectedStatusFilter === null
                    ? 'bg-gradient-to-r from-slate-400 to-slate-500 text-white shadow-lg shadow-slate-500/30 scale-[1.02] border-transparent'
                    : 'bg-slate-800/40 backdrop-blur-xl text-slate-300 border border-white/10 hover:bg-slate-700/50 hover:border-white/20 hover:scale-[1.02]'
                }`}
              >
                Status
              </button>
              
              {/* Agentes IA - renderizado dinamicamente com gradientes vibrantes */}
              {filterAgents.map((agent) => {
                // Gradientes vibrantes por agente
                const agentGradients: Record<string, { gradient: string; shadow: string }> = {
                  'iris': { gradient: 'from-violet-500 to-fuchsia-500', shadow: 'shadow-violet-500/40' },
                  'sofia': { gradient: 'from-purple-500 to-pink-500', shadow: 'shadow-purple-500/40' },
                  'atlas': { gradient: 'from-amber-500 to-yellow-500', shadow: 'shadow-amber-500/40' },
                  'clara': { gradient: 'from-pink-400 to-rose-500', shadow: 'shadow-pink-500/40' },
                };
                const style = agentGradients[agent.slug] || { gradient: 'from-cyan-400 to-teal-500', shadow: 'shadow-cyan-500/40' };
                const isActive = selectedStatusFilter === agent.slug;
                
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedStatusFilter(agent.slug)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-all duration-300 ${
                      isActive
                        ? `bg-gradient-to-r ${style.gradient} text-white shadow-lg ${style.shadow} scale-[1.02] border-transparent`
                        : 'bg-slate-800/40 backdrop-blur-xl text-slate-300 border border-white/10 hover:bg-slate-700/50 hover:border-white/20 hover:scale-[1.02]'
                    }`}
                  >
                    <Bot className="w-4 h-4" />
                    {agent.name}
                    <span className={`text-[10px] ${isActive ? 'text-white/80' : 'opacity-60'}`}>({statusCounts.agents[agent.slug] || 0})</span>
                  </button>
                );
              })}
              
              {/* Humano */}
              <button
                onClick={() => setSelectedStatusFilter('human')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-all duration-300 ${
                  selectedStatusFilter === 'human'
                    ? 'bg-gradient-to-r from-lime-400 to-emerald-500 text-white shadow-lg shadow-emerald-500/40 scale-[1.02] border-transparent'
                    : 'bg-slate-800/40 backdrop-blur-xl text-slate-300 border border-white/10 hover:bg-slate-700/50 hover:border-white/20 hover:scale-[1.02]'
                }`}
              >
                <User className="w-4 h-4" />
                Humano
                <span className={`text-[10px] ${selectedStatusFilter === 'human' ? 'text-white/80' : 'opacity-60'}`}>({statusCounts.human})</span>
              </button>
              
              {/* Pausado */}
              <button
                onClick={() => setSelectedStatusFilter('paused')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-all duration-300 ${
                  selectedStatusFilter === 'paused'
                    ? 'bg-gradient-to-r from-orange-400 to-red-400 text-white shadow-lg shadow-orange-500/40 scale-[1.02] border-transparent'
                    : 'bg-slate-800/40 backdrop-blur-xl text-slate-300 border border-white/10 hover:bg-slate-700/50 hover:border-white/20 hover:scale-[1.02]'
                }`}
              >
                <Pause className="w-4 h-4" />
                Pausado
                <span className={`text-[10px] ${selectedStatusFilter === 'paused' ? 'text-white/80' : 'opacity-60'}`}>({statusCounts.paused})</span>
              </button>
            </div>
          )}
          
          {/* Owner Filter Pills - iOS 26 Style */}
          {!viewingArchived && availableOwners.length > 0 && (
            <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedOwnerFilter(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-all duration-300 ${
                  selectedOwnerFilter === null
                    ? 'bg-gradient-to-r from-slate-400 to-slate-500 text-white shadow-lg shadow-slate-500/30 scale-[1.02] border-transparent'
                    : 'bg-slate-800/40 backdrop-blur-xl text-slate-300 border border-white/10 hover:bg-slate-700/50 hover:border-white/20 hover:scale-[1.02]'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                Todos
              </button>
              {availableOwners.map((owner, index) => {
                // Cores rotativas para owners
                const ownerGradients = [
                  { gradient: 'from-indigo-400 to-blue-500', shadow: 'shadow-indigo-500/40' },
                  { gradient: 'from-teal-400 to-cyan-500', shadow: 'shadow-teal-500/40' },
                  { gradient: 'from-rose-400 to-pink-500', shadow: 'shadow-rose-500/40' },
                  { gradient: 'from-amber-400 to-orange-500', shadow: 'shadow-amber-500/40' },
                ];
                const style = ownerGradients[index % ownerGradients.length];
                const isActive = selectedOwnerFilter === owner.id;
                
                return (
                  <button
                    key={owner.id}
                    onClick={() => setSelectedOwnerFilter(owner.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-all duration-300 ${
                      isActive
                        ? `bg-gradient-to-r ${style.gradient} text-white shadow-lg ${style.shadow} scale-[1.02] border-transparent`
                        : 'bg-slate-800/40 backdrop-blur-xl text-slate-300 border border-white/10 hover:bg-slate-700/50 hover:border-white/20 hover:scale-[1.02]'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    {owner.name.split(' ')[0]}
                    <span className={`text-[10px] ${isActive ? 'text-white/80' : 'opacity-60'}`}>({owner.count})</span>
                  </button>
                );
              })}
            </div>
          )}
          
          {/* Search and closed filter */}
          <div className="flex items-center gap-2">
            <div className="relative group flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="Buscar conversa... (pressione /)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none text-slate-200 placeholder:text-slate-600 transition-all"
              />
            </div>
            {!viewingArchived && (
              <button
                onClick={() => setShowClosedConversations(!showClosedConversations)}
                title={showClosedConversations ? 'Ocultar encerradas' : 'Mostrar encerradas'}
                className={`p-2.5 rounded-xl border transition-all shrink-0 ${
                  showClosedConversations
                    ? 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                    : 'bg-slate-950/50 text-slate-500 border-slate-800 hover:text-slate-400'
                }`}
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
              <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
              <p className="text-xs mt-1 opacity-70">As conversas aparecerão aqui quando receberem mensagens</p>
            </div>
          ) : (
            filteredConversations.map((chat) => {
              // Agent colors for vibrant badges - iOS 26 style
              const agentColors: Record<string, { gradient: string; border: string; text: string; shadow: string }> = {
                'Íris': { gradient: 'from-violet-500/30 to-fuchsia-500/30', border: 'border-violet-400/50', text: 'text-violet-300', shadow: 'shadow-violet-500/25' },
                'Sofia': { gradient: 'from-purple-500/30 to-pink-500/30', border: 'border-purple-400/50', text: 'text-purple-300', shadow: 'shadow-purple-500/25' },
                'Atlas': { gradient: 'from-amber-500/30 to-yellow-500/30', border: 'border-amber-400/50', text: 'text-amber-300', shadow: 'shadow-amber-500/25' },
                'Clara': { gradient: 'from-pink-500/30 to-rose-500/30', border: 'border-pink-400/50', text: 'text-pink-300', shadow: 'shadow-pink-500/25' },
              };
              const agentStyle = chat.agentName ? (agentColors[chat.agentName] || { gradient: 'from-cyan-500/30 to-teal-500/30', border: 'border-cyan-400/50', text: 'text-cyan-300', shadow: 'shadow-cyan-500/25' }) : null;
              
              return (
                <div 
                  key={chat.id}
                  onClick={() => setSelectedChatId(chat.id)}
                  className={`flex items-center p-4 cursor-pointer transition-all duration-300 border-b border-white/5 hover:bg-white/[0.03] hover:backdrop-blur-xl hover:scale-[1.005] ${
                    chat.status === 'closed' ? 'opacity-50' : ''
                  } ${
                    selectedChatId === chat.id 
                      ? 'bg-gradient-to-r from-cyan-500/15 via-teal-500/10 to-transparent backdrop-blur-xl border-l-[3px] border-l-cyan-400 shadow-lg shadow-cyan-500/10' 
                      : chat.unreadCount > 0
                        ? 'bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent border-l-[3px] border-l-cyan-400/70'
                        : chat.status === 'closed'
                          ? 'border-l-[3px] border-l-slate-600/50'
                          : 'border-l-[3px] border-l-transparent'
                  }`}
                >
                  {/* Avatar with vibrant ring */}
                  <div className="relative">
                    <div className={`w-12 h-12 rounded-full p-[2px] transition-all duration-300 ${
                      chat.status === 'closed' 
                        ? 'bg-gradient-to-tr from-slate-500 to-slate-600' 
                        : chat.unreadCount > 0 
                          ? 'bg-gradient-to-tr from-cyan-400 via-teal-400 to-emerald-400 shadow-lg shadow-cyan-500/40 animate-pulse' 
                          : selectedChatId === chat.id
                            ? 'bg-gradient-to-tr from-violet-500 via-fuchsia-500 to-pink-500 shadow-lg shadow-violet-500/30'
                            : 'bg-gradient-to-tr from-slate-600 to-slate-700'
                    }`}>
                      <img 
                        src={chat.contactAvatar} 
                        alt={chat.contactName} 
                        className="w-full h-full rounded-full object-cover border-2 border-slate-900" 
                      />
                    </div>
                    {/* Status indicator with glow */}
                    {chat.status === 'closed' ? (
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-gradient-to-r from-slate-400 to-slate-500 border-2 border-slate-900 rounded-full flex items-center justify-center">
                        <XCircle className="w-2.5 h-2.5 text-slate-900" />
                      </span>
                    ) : chat.unreadCount > 0 ? (
                      <span className="absolute bottom-0 right-0 w-4 h-4 bg-gradient-to-r from-emerald-400 to-green-400 border-2 border-slate-900 rounded-full shadow-lg shadow-emerald-400/60 animate-pulse"></span>
                    ) : (
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-gradient-to-r from-slate-500 to-slate-600 border-2 border-slate-900 rounded-full"></span>
                    )}
                  </div>
                  
                  <div className="ml-3 flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Contact name with glow for unread */}
                        <h3 className={`text-sm truncate transition-all ${
                          chat.unreadCount > 0 
                            ? 'font-bold text-white drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]' 
                            : selectedChatId === chat.id 
                              ? 'font-semibold text-white' 
                              : 'font-semibold text-slate-300'
                        }`}>
                          {chat.contactName}
                        </h3>
                        {/* Agent badge with vibrant colors */}
                        {chat.agentName && agentStyle && (
                          <span className={`px-2 py-0.5 bg-gradient-to-r ${agentStyle.gradient} backdrop-blur-md ${agentStyle.text} border ${agentStyle.border} text-[9px] rounded-full font-semibold flex items-center gap-1 shrink-0 shadow-lg ${agentStyle.shadow}`}>
                            <Sparkles className="w-2.5 h-2.5" />
                            {chat.agentName}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium shrink-0 ml-2">{chat.lastMessageTime}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate flex items-center">
                      {(() => {
                        const lastMsg = chat.messages[chat.messages.length - 1];
                        if (lastMsg?.type === MessageType.VIDEO && lastMsg?.mediaUrl) {
                          return <VideoThumbnailPreview videoUrl={lastMsg.mediaUrl} />;
                        }
                        if (lastMsg?.type === MessageType.VIDEO) return '🎬 Vídeo';
                        if (lastMsg?.type === MessageType.IMAGE) return '📷 Imagem';
                        if (lastMsg?.type === MessageType.AUDIO) return '🎵 Áudio';
                        if (lastMsg?.type === MessageType.DOCUMENT) return '📄 Documento';
                        return chat.lastMessage || 'Sem mensagens';
                      })()}
                    </p>
                    
                    {/* Status badges and tags with glassmorphism */}
                    <div className="flex items-center mt-2 gap-1.5 flex-wrap">
                      {renderStatusBadge(chat.status, chat.assignedUserName)}
                      <LeadScoreBadge clientMemory={chat.clientMemory} compact />
                      <WaitingTimeBadge 
                        lastMessageAt={chat.lastMessageAt} 
                        lastMessageFromUser={chat.lastMessageFromUser} 
                        compact 
                      />
                      {/* Tags with glass effect */}
                      {chat.tags.slice(0, 1).map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-slate-700/40 backdrop-blur-sm border border-white/10 text-slate-300 text-[10px] rounded-lg font-medium hover:bg-slate-600/40 transition-all">
                          {tag}
                        </span>
                      ))}
                      {/* Unread badge with pulsing glow */}
                      {chat.unreadCount > 0 && (
                        <span className="ml-auto bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-900 text-[10px] font-bold px-2 h-5 min-w-[1.25rem] flex items-center justify-center rounded-full shadow-lg shadow-cyan-400/50 animate-pulse ring-2 ring-cyan-400/30">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Area: Chat Window & Profile */}
      {activeChat ? (
        <motion.div 
          className={`flex-1 flex overflow-hidden bg-[#0B0E14] ${isMobile && mobileView === 'list' ? 'hidden' : ''}`}
          drag={isMobile ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.5 }}
          style={isMobile ? { x: dragX, opacity: chatOpacity } : undefined}
          onDragEnd={isMobile ? handleDragEnd : undefined}
        >
          {/* Main Chat Content */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>

            {/* Chat Header */}
            <div className={`${isMobile ? 'h-14 px-3' : 'h-16 px-6'} flex items-center justify-between bg-slate-900/80 backdrop-blur-md border-b border-slate-800 z-10 shrink-0`}>
              <div className="flex items-center gap-2">
                {/* Back button on mobile */}
                {isMobile && (
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={handleMobileBack}
                    className="text-slate-400 hover:text-white -ml-1"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className="flex items-center cursor-pointer hover:bg-slate-800/50 p-1.5 rounded-lg transition-colors pr-3"
                        onClick={() => !isMobile && setShowProfileInfo(!showProfileInfo)}
                      >
                        <div className="relative">
                          <img src={activeChat.contactAvatar} alt={activeChat.contactName} className={`${isMobile ? 'w-8 h-8' : 'w-9 h-9'} rounded-full ring-2 ring-slate-800`} />
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
                        </div>
                        <div className="ml-3">
                          <h2 className={`${isMobile ? 'text-sm' : 'text-sm'} font-bold text-slate-100 flex items-center gap-2 flex-wrap`}>
                            <span className="truncate max-w-[120px] md:max-w-none">{activeChat.contactName}</span>
                            {!isMobile && renderStatusBadge(activeChat.status, activeChat.assignedUserName)}
                            {/* Agent Selector Dropdown */}
                            {!isMobile && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button 
                                    className="px-2.5 py-1 bg-gradient-to-r from-violet-500/20 to-purple-500/20 backdrop-blur-sm text-violet-300 border border-violet-400/30 text-[10px] rounded-full font-medium flex items-center gap-1.5 hover:from-violet-500/30 hover:to-purple-500/30 transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-violet-500/10"
                                    disabled={isChangingAgent}
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    {isChangingAgent ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      activeChat.agentName || 'Sem agente'
                                    )}
                                    <ChevronDown className="w-3 h-3 opacity-60" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="bg-slate-800 border-slate-700">
                                  <DropdownMenuLabel className="text-xs text-slate-400">
                                    Trocar agente
                                  </DropdownMenuLabel>
                                  <DropdownMenuSeparator className="bg-slate-700" />
                                  {availableAgents.map(agent => (
                                    <DropdownMenuItem
                                      key={agent.id}
                                      onClick={() => handleChangeAgent(agent.id)}
                                      className={`cursor-pointer ${
                                        activeChat.agentId === agent.id 
                                          ? 'bg-violet-500/20 text-violet-300' 
                                          : 'text-slate-200'
                                      }`}
                                    >
                                      <Bot className="w-4 h-4 mr-2" />
                                      {agent.name}
                                      {activeChat.agentId === agent.id && (
                                        <Check className="w-4 h-4 ml-auto text-violet-400" />
                                      )}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {/* WhatsApp Window Badge - Real-time (hidden on mobile) */}
                            {!isMobile && windowTimeRemaining.isOpen ? (
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border flex items-center gap-1 ${getWindowBadgeStyle()}`}>
                                <Clock className="w-3 h-3" />
                                {formatWindowTime()}
                              </span>
                            ) : !isMobile && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border flex items-center gap-1 bg-red-500/20 text-red-400 border-red-500/30">
                                <AlertTriangle className="w-3 h-3" />
                                Janela fechada
                              </span>
                            )}
                          </h2>
                          <p className="text-xs text-cyan-500 font-medium">{activeChat.contactPhone}</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    {!isMobile && (
                      <TooltipContent side="bottom" className="bg-slate-800 border-slate-700">
                        <p className="text-xs text-slate-300">Clique para ver informações do contato</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className={`flex items-center ${isMobile ? 'gap-0.5' : 'gap-1'}`}>
                {/* Status control buttons - show fewer on mobile */}
                {!isMobile && (
                  <>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`text-slate-400 hover:text-white ${activeChat.status === 'nina' ? 'bg-violet-500/20 text-violet-400' : ''}`}
                      onClick={() => handleStatusChange('nina')}
                      title={`Ativar ${sdrName} (IA)`}
                    >
                      <Bot className="w-5 h-5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`text-slate-400 hover:text-white ${activeChat.status === 'human' ? 'bg-emerald-500/20 text-emerald-400' : ''}`}
                      onClick={() => handleStatusChange('human')}
                      title="Assumir conversa"
                    >
                      <User className="w-5 h-5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`text-slate-400 hover:text-white ${activeChat.status === 'paused' ? 'bg-amber-500/20 text-amber-400' : ''}`}
                      onClick={() => handleStatusChange('paused')}
                      title="Pausar conversa"
                    >
                      <Pause className="w-5 h-5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-slate-400 hover:text-green-400 hover:bg-green-500/10"
                      onClick={() => {
                        if (!activeChat.contactPhone) {
                          toast.error('Contato sem número de telefone');
                          return;
                        }
                        setShowCallModal(true);
                      }}
                      title="Fazer ligação"
                    >
                      <Phone className="w-5 h-5" />
                    </Button>
                  </>
                )}
                {/* Mobile: compact status toggle */}
                {isMobile && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`text-slate-400 hover:text-white ${activeChat.status === 'human' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-violet-500/20 text-violet-400'}`}
                    onClick={() => handleStatusChange(activeChat.status === 'human' ? 'nina' : 'human')}
                    title={activeChat.status === 'human' ? `Ativar ${sdrName}` : 'Assumir conversa'}
                  >
                    {activeChat.status === 'human' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </Button>
                )}
                {/* Active Call Indicator in Header */}
                {activeCall && (
                  <div className={isMobile ? 'ml-1' : 'ml-2'}>
                    <ActiveCallIndicator call={activeCall} onDismiss={dismissActiveCall} />
                  </div>
                )}
                <div className="h-6 w-px bg-slate-800 mx-1"></div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${showProfileInfo ? 'bg-slate-800 text-cyan-400' : ''}`} 
                  onClick={() => setShowProfileInfo(!showProfileInfo)} 
                  title="Ver Informações"
                >
                  <Info className="w-5 h-5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <ShadcnButton variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                      <MoreVertical className="w-5 h-5" />
                    </ShadcnButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                    {viewingArchived ? (
                      <DropdownMenuItem 
                        onClick={async () => {
                          if (!activeChat) return;
                          try {
                            await unarchiveConversation(activeChat.id);
                            setSelectedChatId(null);
                            setArchivedCount(prev => Math.max(0, prev - 1));
                            toast.success('Conversa restaurada', {
                              description: `${activeChat.contactName} voltou para a fila de atendimento`
                            });
                          } catch (error) {
                            toast.error('Erro ao restaurar conversa');
                          }
                        }}
                        className="text-green-400 hover:text-green-300 hover:bg-green-500/10 cursor-pointer"
                      >
                        <ArchiveRestore className="w-4 h-4 mr-2" />
                        Restaurar conversa
                      </DropdownMenuItem>
                    ) : (
                      <>
                        {activeChat.status === 'closed' ? (
                          <DropdownMenuItem 
                            onClick={handleReopenConversation}
                            disabled={isReopeningConversation}
                            className="text-green-400 hover:text-green-300 hover:bg-green-500/10 cursor-pointer"
                          >
                            <PlayCircle className="w-4 h-4 mr-2" />
                            {isReopeningConversation ? 'Reabrindo...' : 'Reabrir Atendimento'}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem 
                            onClick={() => setShowCloseModal(true)}
                            className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 cursor-pointer"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Encerrar Atendimento
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-slate-700" />
                        <DropdownMenuItem 
                          onClick={async () => {
                            if (!activeChat) return;
                            try {
                              await archiveConversation(activeChat.id);
                              setSelectedChatId(null);
                              setArchivedCount(prev => prev + 1);
                              toast.success('Conversa arquivada', {
                                description: `${activeChat.contactName} foi removido da fila de atendimento`
                              });
                            } catch (error) {
                              toast.error('Erro ao arquivar conversa');
                            }
                          }}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                        >
                          <Archive className="w-4 h-4 mr-2" />
                          Arquivar conversa
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages Area */}
            <div className={`flex-1 overflow-y-auto ${isMobile ? 'p-3 space-y-4' : 'p-6 space-y-6'} custom-scrollbar relative z-0`}>
              {(() => {
                // Create unified timeline with messages and calls
                type TimelineItem = 
                  | { type: 'message'; data: UIMessage; date: Date }
                  | { type: 'call'; data: typeof callHistory[0]; date: Date };

                const timelineItems: TimelineItem[] = [
                  ...activeChat.messages.map(msg => ({
                    type: 'message' as const,
                    data: msg,
                    date: msg.sentAt ? new Date(msg.sentAt) : new Date()
                  })),
                  ...callHistory.map(call => ({
                    type: 'call' as const,
                    data: call,
                    date: new Date(call.started_at)
                  }))
                ].sort((a, b) => a.date.getTime() - b.date.getTime());

                if (timelineItems.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                      <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                      <p className="text-sm">Nenhuma mensagem ainda</p>
                      <p className="text-xs mt-1 opacity-70">Envie uma mensagem para iniciar a conversa</p>
                    </div>
                  );
                }

                // Get date label helper
                const getDateLabel = (date: Date): string => {
                  const today = new Date();
                  const yesterday = new Date(today);
                  yesterday.setDate(yesterday.getDate() - 1);
                  
                  if (date.toDateString() === today.toDateString()) return 'Hoje';
                  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
                  
                  return date.toLocaleDateString('pt-BR', { 
                    day: 'numeric', 
                    month: 'long' 
                  });
                };

                return (
                  <>
                    {timelineItems.map((item, index) => {
                      const prevItem = index > 0 ? timelineItems[index - 1] : null;
                      const showDateSeparator = item.date && (
                        index === 0 || 
                        !prevItem?.date || 
                        item.date.toDateString() !== prevItem.date.toDateString()
                      );

                      if (item.type === 'call') {
                        return (
                          <React.Fragment key={`call-${item.data.id}`}>
                            {showDateSeparator && (
                              <div className="flex justify-center my-6">
                                <span className="px-4 py-1.5 bg-slate-800/80 border border-slate-700 text-slate-400 text-xs font-medium rounded-full shadow-sm backdrop-blur-sm">
                                  {getDateLabel(item.date)}
                                </span>
                              </div>
                            )}
                            <CallTimelineCard call={item.data} />
                          </React.Fragment>
                        );
                      }

                      const msg = item.data;
                      const isOutgoing = msg.direction === MessageDirection.OUTGOING;

                      return (
                        <React.Fragment key={msg.id}>
                          {showDateSeparator && (
                            <div className="flex justify-center my-6">
                              <span className="px-4 py-1.5 bg-slate-800/80 border border-slate-700 text-slate-400 text-xs font-medium rounded-full shadow-sm backdrop-blur-sm">
                                {getDateLabel(item.date)}
                              </span>
                            </div>
                          )}
                          <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                            <div className={`flex flex-col ${isMobile ? 'max-w-[85%]' : 'max-w-[75%]'} ${isOutgoing ? 'items-end' : 'items-start'}`}>
                              <div 
                                className={`${isMobile ? 'px-3 py-2' : 'px-5 py-3'} rounded-2xl shadow-md relative ${isMobile ? 'text-[15px]' : 'text-sm'} leading-relaxed ${
                                  isOutgoing 
                                    ? msg.fromType === 'nina'
                                      ? 'bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-tr-sm shadow-violet-900/20'
                                      : 'bg-gradient-to-br from-cyan-600 to-teal-700 text-white rounded-tr-sm shadow-cyan-900/20'
                                    : 'bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700/50'
                                }`}
                              >
                                {/* Show operator name above message for human messages */}
                                {msg.fromType === 'human' && msg.senderName && (
                                  <div className="text-xs font-bold text-cyan-200/80 mb-1.5 uppercase tracking-wide">
                                    {msg.senderName}:
                                  </div>
                                )}
                                {renderMessageContent(msg)}
                              </div>
                              
                              <div className="flex items-center mt-1.5 gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity px-1">
                                {isOutgoing && msg.fromType === 'nina' && (
                                  <Bot className="w-3 h-3 text-violet-400" />
                                )}
                                {isOutgoing && msg.fromType === 'human' && (
                                  <User className="w-3 h-3 text-cyan-400" />
                                )}
                                <span className="text-[10px] text-slate-500 font-medium">{msg.timestamp}</span>
                                {isOutgoing && (
                                  msg.status === 'failed' ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="flex items-center cursor-help">
                                            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-xs">
                                          <div className="text-xs">
                                            <p className="font-semibold text-red-400">Mensagem não entregue</p>
                                            {msg.metadata?.whatsapp_error ? (
                                              <>
                                                <p className="text-slate-300 mt-1">
                                                  Código: {msg.metadata.whatsapp_error.code}
                                                </p>
                                                <p className="text-slate-400 mt-0.5 break-words">
                                                  {msg.metadata.whatsapp_error.title || msg.metadata.whatsapp_error.message}
                                                </p>
                                              </>
                                            ) : (
                                              <p className="text-slate-400 mt-1">Erro desconhecido</p>
                                            )}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) :
                                  msg.status === 'processing' ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="flex items-center cursor-help">
                                            <Clock className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          <span className="text-xs">Processando...</span>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) :
                                  msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-cyan-500" /> : 
                                  msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-slate-500" /> :
                                  <Check className="w-3.5 h-3.5 text-slate-500" />
                                )}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </>
                );
              })()}
              
              {/* Typing Indicator - shows when AI is aggregating or processing */}
              {(isAggregating || isProcessing) && (
                <TypingIndicator 
                  agentName={agentName || 'Adri'} 
                  isAggregating={isAggregating}
                />
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className={`${isMobile ? 'p-2' : 'p-4'} bg-slate-900/90 border-t border-slate-800 backdrop-blur-sm z-10`}>
              {/* Window closed banner - uses real-time state */}
              {!windowTimeRemaining.isOpen && (
                <div className={`mb-2 md:mb-3 ${isMobile ? 'p-2' : 'p-3'} bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 md:gap-3`}>
                  <AlertTriangle className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-red-400 flex-shrink-0`} />
                  <div className="flex-1">
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-red-300 font-medium`}>Janela de 24h expirou</p>
                    {!isMobile && <p className="text-xs text-red-400/80">Envie um template aprovado para reabrir a conversa.</p>}
                  </div>
                  <Button 
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setShowTemplateModal(true)}
                  >
                    <FileType className="w-4 h-4 mr-1.5" />
                    Enviar Template
                  </Button>
                </div>
              )}
              
              <form onSubmit={handleSendMessage} className="flex items-end gap-2 md:gap-3 max-w-4xl mx-auto">
                {/* Hidden file input for attachments */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                
                <div className={`flex items-center ${isMobile ? 'gap-0.5' : 'gap-1'}`}>
                  {!isMobile && (
                    <>
                      <Button type="button" variant="ghost" size="icon" className="text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-full transition-colors" disabled={!windowTimeRemaining.isOpen}>
                        <Smile className="w-5 h-5" />
                      </Button>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        className="text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-full transition-colors" 
                        disabled={!windowTimeRemaining.isOpen || uploadingFile}
                        onClick={() => fileInputRef.current?.click()}
                        title="Enviar anexo"
                      >
                        {uploadingFile ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Paperclip className="w-5 h-5" />
                        )}
                      </Button>
                    </>
                  )}
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className={`rounded-full transition-colors ${!windowTimeRemaining.isOpen 
                      ? 'text-green-400 bg-green-500/20 hover:bg-green-500/30 animate-pulse' 
                      : 'text-slate-400 hover:text-green-400 hover:bg-green-500/10'
                    }`}
                    onClick={() => setShowTemplateModal(true)}
                    title="Enviar template WhatsApp"
                  >
                    <FileType className="w-5 h-5" />
                  </Button>
                  {/* Message Tone Assistant - Only visible when human is in control and there's text */}
                  {activeChat.status === 'human' && !isMobile && (
                    <MessageToneAssistant
                      originalMessage={inputText}
                      onApplySuggestion={setInputText}
                      contactName={activeChat.contactName}
                      lastMessages={activeChat.messages?.slice(-5).map(m => `${m.direction === 'outgoing' ? 'Atendente' : activeChat.contactName}: ${m.content}`)}
                      disabled={!windowTimeRemaining.isOpen}
                    />
                  )}
                </div>
                
                {/* Quick Questions Dropdown */}
                {showQuickQuestions && agentQuestions.length > 0 && activeChat.status === 'human' && (
                  <QuickQuestionsDropdown
                    questions={agentQuestions}
                    filter={quickQuestionsFilter}
                    selectedIndex={selectedQuestionIndex}
                    agentName={activeChat.agentName || 'Qualificação'}
                    onSelect={handleQuickQuestionSelect}
                    onClose={() => setShowQuickQuestions(false)}
                  />
                )}
                
                <div className={`flex-1 bg-slate-950 rounded-2xl border ${
                  !windowTimeRemaining.isOpen 
                    ? 'border-red-500/30 opacity-50' 
                    : 'border-slate-800 focus-within:ring-2 focus-within:ring-cyan-500/30 focus-within:border-cyan-500/50'
                } transition-all shadow-inner relative`}>
                  <textarea
                    ref={messageInputRef}
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    placeholder={
                      !windowTimeRemaining.isOpen 
                        ? 'Janela expirada - use template' 
                        : activeChat.status === 'nina' 
                          ? `${sdrName} respondendo...` 
                          : activeChat.status === 'human'
                            ? 'Digite / para perguntas rápidas...'
                            : 'Digite sua mensagem...'
                    }
                    className={`w-full bg-transparent border-none ${isMobile ? 'p-3 min-h-[44px] text-base' : 'p-3.5 min-h-[48px] text-sm'} max-h-32 text-slate-200 focus:ring-0 resize-none outline-none placeholder:text-slate-600 disabled:cursor-not-allowed`}
                    rows={1}
                    disabled={!windowTimeRemaining.isOpen}
                  />
                </div>

                {inputText.trim() && windowTimeRemaining.isOpen ? (
                  <Button type="submit" className={`rounded-full ${isMobile ? 'w-11 h-11' : 'w-12 h-12'} p-0 shadow-lg shadow-cyan-500/20 hover:scale-105 active:scale-95 transition-all`}>
                    <Send className="w-5 h-5 ml-0.5" />
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" className={`rounded-full ${isMobile ? 'w-11 h-11' : 'w-12 h-12'} p-0 bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700`} disabled={!windowTimeRemaining.isOpen}>
                    <Mic className="w-5 h-5" />
                  </Button>
                )}
              </form>
            </div>
          </div>

          {/* Right Profile Sidebar (CRM View) - Hidden on mobile */}
          {!isMobile && (
          <div 
            className={`${showProfileInfo ? 'w-80 border-l border-slate-800 opacity-100' : 'w-0 opacity-0 border-none'} transition-all duration-300 ease-in-out bg-slate-900/95 flex-shrink-0 flex flex-col overflow-hidden`}
          >
            <div className="w-80 h-full flex flex-col">
              {/* Header */}
              <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 flex-shrink-0">
                <span className="font-semibold text-white">Informações do Lead</span>
                <div className="flex items-center gap-1">
                  {/* Botão de Fixar */}
                  <button 
                    onClick={() => {
                      const newValue = !isPinnedProfileInfo;
                      setIsPinnedProfileInfo(newValue);
                      localStorage.setItem('pinnedProfileInfo', String(newValue));
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isPinnedProfileInfo 
                        ? 'bg-cyan-500/20 text-cyan-400' 
                        : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                    title={isPinnedProfileInfo ? 'Desafixar painel' : 'Fixar painel'}
                  >
                    <Pin className="w-4 h-4" />
                  </button>
                  
                  {/* Botão de Fechar */}
                  <button 
                    onClick={() => setShowProfileInfo(false)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
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
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dados de Contato</h4>
                    <button 
                      onClick={() => setIsEditingContact(!isEditingContact)}
                      className="text-cyan-500 hover:text-cyan-400 transition-colors p-1"
                      title={isEditingContact ? "Cancelar edição" : "Editar dados"}
                    >
                      {isEditingContact ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  {/* Phone (always read-only) */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-xs text-slate-500">Telefone</span>
                      <span className="text-slate-200 font-medium">{activeChat.contactPhone}</span>
                    </div>
                  </div>

                  {/* Region (derived from DDD) */}
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
                          placeholder="email@empresa.com"
                          className="h-8 text-sm bg-slate-950/50 border-slate-700"
                        />
                      ) : activeChat.contactEmail ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-cyan-400 font-medium">{activeChat.contactEmail}</span>
                          <button
                            onClick={() => setShowEmailModal(true)}
                            className="flex items-center gap-1.5 px-2.5 py-1 
                                       bg-gradient-to-r from-cyan-500/20 to-blue-500/20 
                                       border border-cyan-500/40 rounded-md
                                       text-cyan-400 text-xs font-medium
                                       hover:from-cyan-500/30 hover:to-blue-500/30 
                                       hover:border-cyan-400/60 transition-all"
                            title="Enviar email"
                          >
                            <Send className="w-3 h-3" />
                            Enviar
                          </button>
                          {emailsSentCount !== undefined && emailsSentCount > 0 && (
                            <span 
                              className="flex items-center gap-1 px-2 py-0.5 
                                         bg-emerald-500/20 border border-emerald-500/30 
                                         rounded-full text-emerald-400 text-xs"
                              title={`${emailsSentCount} email(s) já enviado(s) para este contato`}
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

                  {/* CNPJ */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-xs text-slate-500">CNPJ</span>
                      {isEditingContact ? (
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={editCnpj}
                            onChange={(e) => setEditCnpj(e.target.value)}
                            placeholder="00.000.000/0000-00"
                            className="h-8 text-sm bg-slate-950/50 border-slate-700 flex-1"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCnpjLookup}
                            disabled={isLookingUpCnpj || editCnpj.replace(/\D/g, '').length < 14}
                            className="h-8 px-2"
                            title="Buscar empresa pelo CNPJ"
                          >
                            {isLookingUpCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-slate-200 font-medium">
                          {activeChat.contactCnpj ? formatCnpj(activeChat.contactCnpj) : <span className="text-slate-500 italic">Não informado</span>}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Company */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-xs text-slate-500">Empresa</span>
                      {isEditingContact ? (
                        <Input
                          type="text"
                          value={editCompany}
                          onChange={(e) => setEditCompany(e.target.value)}
                          placeholder="Nome da empresa"
                          className="h-8 text-sm bg-slate-950/50 border-slate-700"
                        />
                      ) : (
                        <span className="text-slate-200 font-medium">
                          {activeChat.contactCompany || <span className="text-slate-500 italic">Não informado</span>}
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

                {/* Deal/Pipeline functionality removed - system focused on collections and claims */}

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* Handoff Summary Card - Resumo do Contato */}
                <HandoffSummaryCard 
                  ninaContext={activeChat.ninaContext} 
                  agentSlug={activeChat.agentSlug}
                  contactId={activeChat.contactId}
                  contactEmail={activeChat.contactEmail}
                  onOpenEmailModal={() => setShowEmailModal(true)}
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
                      toast.success('Conversa atribuída com sucesso!');
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
          </div>
          )}

        </motion.div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0B0E14] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 to-transparent"></div>
          <div className="relative z-10 flex flex-col items-center p-8 text-center max-w-md">
            <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-2xl border border-slate-800 relative group">
              <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl group-hover:bg-cyan-500/30 transition-all duration-1000"></div>
              <MessageSquare className="w-10 h-10 text-cyan-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{companyName} Workspace</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              {conversations.length === 0 
                ? 'Aguardando novas conversas. Configure o webhook do WhatsApp para começar a receber mensagens.'
                : 'Selecione uma conversa ao lado para iniciar o atendimento inteligente.'}
            </p>
            <div className="mt-8 flex gap-3 text-xs text-slate-500 font-mono bg-slate-900/50 px-4 py-2 rounded-lg border border-slate-800/50">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {sdrName} Online
              </span>
              <span className="w-px h-4 bg-slate-800"></span>
              <span>{conversations.length} conversas</span>
            </div>
          </div>
        </div>
      )}

      {/* Call Confirmation Modal */}
      {activeChat && (
        <CallConfirmationModal
          isOpen={showCallModal}
          onClose={() => setShowCallModal(false)}
          contact={{
            id: activeChat.contactId,
            name: activeChat.contactName,
            phone: activeChat.contactPhone,
            avatar: activeChat.contactAvatar,
            company: activeChat.contactCompany,
            tags: activeChat.tags,
          }}
          conversationId={activeChat.id}
          defaultExtension={defaultExtension}
          onCallInitiated={() => setShowCallModal(false)}
        />
      )}

      {/* WhatsApp Template Modal */}
      {activeChat && (
        <SendWhatsAppTemplateModal
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          contactId={activeChat.contactId}
          conversationId={activeChat.id}
          contactName={activeChat.contactName}
          contactCompany={activeChat.contactCompany}
          onSent={() => setShowTemplateModal(false)}
        />
      )}

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={!!pdfPreview}
        onClose={() => setPdfPreview(null)}
        pdfUrl={pdfPreview?.url || ''}
        filename={pdfPreview?.filename || ''}
      />

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsHelp 
        isOpen={showShortcutsHelp} 
        onClose={() => setShowShortcutsHelp(false)} 
      />

      {/* Close Conversation Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <X className="w-5 h-5 text-orange-400" />
                Encerrar Atendimento
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                {closeReason === 'Enviado ao Pipedrive' 
                  ? 'O lead será movido para "Enviado Pipedrive" e o atendimento continuará por lá.'
                  : 'O lead será marcado como "Perdido" e não receberá mais automações.'
                }
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">
                  Motivo do encerramento
                </label>
                <select
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 outline-none"
                >
                  <option value="">Selecione um motivo...</option>
                  <option value="Lead desqualificado">Lead desqualificado</option>
                  <option value="Fora do perfil">Fora do perfil</option>
                  <option value="Não tem interesse">Não tem interesse</option>
                  <option value="Número errado/inválido">Número errado/inválido</option>
                  <option value="Já tem corretor">Já tem corretor</option>
                  <option value="Sem resposta">Sem resposta</option>
                  <option value="Enviado ao Pipedrive">Enviado ao Pipedrive</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              {closeReason === 'Outro' && (
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-2 block">
                    Especifique o motivo
                  </label>
                  <input
                    type="text"
                    value=""
                    onChange={(e) => setCloseReason(e.target.value)}
                    placeholder="Descreva o motivo..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 outline-none"
                  />
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-700 flex gap-3 justify-end">
              <ShadcnButton
                variant="ghost"
                onClick={() => {
                  setShowCloseModal(false);
                  setCloseReason('');
                }}
                className="text-slate-400 hover:text-white"
              >
                Cancelar
              </ShadcnButton>
              <ShadcnButton
                onClick={handleCloseConversation}
                disabled={isClosingConversation}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {isClosingConversation ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <X className="w-4 h-4 mr-2" />
                )}
                Encerrar
              </ShadcnButton>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Hint Button */}
      {!isMobile && (
        <button
          onClick={() => setShowShortcutsHelp(true)}
          className="fixed bottom-4 right-4 p-2.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-all shadow-lg backdrop-blur-sm z-40"
          title="Atalhos de teclado (?)"
        >
          <Keyboard className="w-4 h-4" />
        </button>
      )}

      {/* Email Compose Modal */}
      {activeChat && showEmailModal && (
        <EmailComposeModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          
          contactEmail={activeChat.contactEmail || ''}
          contactName={activeChat.contactName}
          company={activeChat.contactCompany || ''}
          value={0}
          ninaContext={activeChat.ninaContext as Record<string, any> | null}
          clientMemory={activeChat.clientMemory}
          agentSlug={activeChat.agentSlug}
          contactPhone={activeChat.contactPhone}
          contactCnpj={activeChat.contactCnpj}
          conversationHistory={activeChat.messages?.slice(-10).map(m => 
            `${m.direction === 'incoming' ? 'Lead' : 'Agente'}: ${m.content}`
          ).join('\n')}
          onEmailSent={() => {
            toast.success('Email enviado com sucesso!');
            queryClient.invalidateQueries({ queryKey: ['contact-emails-count', activeChat?.contactId] });
            setShowEmailModal(false);
          }}
        />
      )}
    </div>
  );
};

export default ChatInterface;
