// ============= Legacy Types (for backward compatibility) =============
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  VIDEO = 'video'
}

export enum MessageDirection {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing'
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: 'agent' | 'admin';
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'agent';
  status: 'active' | 'invited' | 'disabled';
  avatar: string;
  lastActive?: string;
  team_id?: string | null;
  function_id?: string | null;
  weight?: number;
  api4com_extension?: string | null;
  team?: Team;
  function?: TeamFunction;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamFunction {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  content: string;
  timestamp: string;
  direction: MessageDirection;
  type: MessageType;
  status: 'sent' | 'delivered' | 'read';
}

export interface Conversation {
  id: string;
  contactName: string;
  contactPhone: string;
  contactAvatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  tags: string[];
  messages: Message[];
}

export interface Contact {
  id: string;
  name: string;
  call_name?: string;
  phone: string;
  email: string;
  company?: string;
  cnpj?: string;
  status: 'new' | 'lead' | 'qualified' | 'customer' | 'churned';
  lastContact: string;
  lead_source?: 'inbound' | 'outbound' | 'facebook' | 'google';
}

export interface StatMetric {
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
}

export interface Appointment {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  type: 'demo' | 'meeting' | 'support' | 'followup';
  description?: string;
  attendees?: string[];
}



export interface TagDefinition {
  id: string;
  key: string;
  label: string;
  color: string;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============= Database Types (Real Supabase Schema) =============
export type ConversationStatus = 'nina' | 'human' | 'paused' | 'closed';
export type MessageFromType = 'user' | 'nina' | 'human';
export type DBMessageStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'processing';
export type DBMessageType = 'text' | 'audio' | 'image' | 'document' | 'video';

export interface ClientMemory {
  last_updated: string | null;
  lead_profile: {
    interests: string[];
    lead_stage: string;
    objections: string[];
    products_discussed: string[];
    communication_style: string;
    qualification_score: number;
  };
  sales_intelligence: {
    pain_points: string[];
    next_best_action: string;
    budget_indication: string;
    decision_timeline: string;
  };
  interaction_summary: {
    response_pattern: string;
    last_contact_reason: string;
    total_conversations: number;
    preferred_contact_time: string;
  };
  conversation_history: Array<{
    timestamp: string;
    user_summary: string;
    ai_action: string;
  }>;
}

export interface DBContact {
  id: string;
  phone_number: string;
  whatsapp_id: string | null;
  name: string | null;
  call_name: string | null;
  email: string | null;
  cnpj: string | null;
  company: string | null;
  profile_picture_url: string | null;
  tags: string[];
  notes: string | null;
  is_business: boolean;
  is_blocked: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
  client_memory: ClientMemory;
  first_contact_date: string;
  last_activity: string;
  created_at: string;
  updated_at: string;
}

export interface DBConversation {
  id: string;
  contact_id: string;
  status: ConversationStatus;
  is_active: boolean;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_team: string | null;
  current_agent_id: string | null;
  tags: string[];
  metadata: Record<string, any>;
  nina_context: Record<string, any>;
  started_at: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  whatsapp_window_start: string | null;
  // Joined data
  contact?: DBContact;
  messages?: DBMessage[];
  agent?: { id: string; name: string; slug: string } | null;
  // Assigned user name (extracted from email)
  assignedUserName?: string | null;
}

export interface DBMessage {
  id: string;
  conversation_id: string;
  whatsapp_message_id: string | null;
  content: string | null;
  type: DBMessageType;
  from_type: MessageFromType;
  status: DBMessageStatus;
  media_url: string | null;
  media_type: string | null;
  reply_to_id: string | null;
  processed_by_nina: boolean;
  nina_response_time: number | null;
  metadata: Record<string, any>;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

// ============= Transformed Types for UI =============
export type CollectionStatus = 'none' | 'sent' | 'responded' | 'no_response';

export interface UIConversation {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactAvatar: string;
  contactEmail: string | null;
  contactCnpj: string | null;
  contactCompany: string | null;
  status: ConversationStatus;
  isActive: boolean;
  assignedTeam: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageAt: string; // ISO timestamp for waiting time calculation
  lastMessageFromUser: boolean; // Whether last message was from client
  unreadCount: number;
  tags: string[];
  messages: UIMessage[];
  clientMemory: ClientMemory;
  ninaContext: Record<string, any> | null; // Qualification answers and AI context
  notes: string | null;
  agentId: string | null;
  agentName: string | null;
  agentSlug: string | null;
  // WhatsApp 24h window fields
  whatsappWindowStart: string | null;
  isWhatsAppWindowOpen: boolean;
  windowHoursRemaining: number | null;
  // Collection template indicator
  hasCollectionTemplate: boolean;
  collectionTemplateName: string | null;
  // Collection status for lead tracking
  collectionStatus: CollectionStatus;
  collectionSentAt: string | null;
}

export interface UIMessage {
  id: string;
  content: string;
  timestamp: string;
  sentAt: string; // ISO date string for accurate date comparison
  direction: MessageDirection;
  type: MessageType;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'processing';
  fromType: MessageFromType;
  mediaUrl: string | null;
  senderName: string | null;
  metadata: Record<string, any> | null;
}

// ============= Utility Functions =============
export function transformDBToUIConversation(
  conv: DBConversation,
  messages: DBMessage[]
): UIConversation {
  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
  );

  const lastMsg = sortedMessages[sortedMessages.length - 1];
  const unreadCount = messages.filter(
    m => m.from_type === 'user' && m.status !== 'read'
  ).length;
  
  // Determine if last message was from user (client)
  const lastMessageFromUser = lastMsg?.from_type === 'user';

  // Calculate WhatsApp window status
  const windowStart = conv.whatsapp_window_start ? new Date(conv.whatsapp_window_start) : null;
  const now = new Date();
  const windowEndTime = windowStart ? new Date(windowStart.getTime() + 24 * 60 * 60 * 1000) : null;
  const isWindowOpen = windowStart !== null && windowEndTime !== null && now < windowEndTime;
  const msRemaining = isWindowOpen && windowEndTime ? windowEndTime.getTime() - now.getTime() : null;
  const hoursRemaining = msRemaining !== null ? Math.max(0, msRemaining / (1000 * 60 * 60)) : null;

  // Check if last outbound message was a collection template
  const lastOutboundMsg = [...sortedMessages]
    .reverse()
    .find(m => m.from_type === 'nina' || m.from_type === 'human');
  
  const templateName = (lastOutboundMsg?.metadata as Record<string, any>)?.template_name as string | undefined;
  const isTemplate = (lastOutboundMsg?.metadata as Record<string, any>)?.is_template === true;
  const isCollectionTemplate = isTemplate && templateName && 
    (templateName.toLowerCase().includes('cobranca') || templateName.toLowerCase().includes('cobrança'));

  // Calculate collection status
  let collectionStatus: CollectionStatus = 'none';
  let collectionSentAt: string | null = null;

  if (isCollectionTemplate && lastOutboundMsg) {
    collectionSentAt = lastOutboundMsg.sent_at;
    const templateSentTime = new Date(lastOutboundMsg.sent_at).getTime();
    
    // Find last user message after template was sent
    const lastUserMessageAfterTemplate = [...sortedMessages]
      .reverse()
      .find(m => m.from_type === 'user' && new Date(m.sent_at).getTime() > templateSentTime);
    
    if (lastUserMessageAfterTemplate) {
      collectionStatus = 'responded';
    } else {
      const hoursSinceSent = (Date.now() - templateSentTime) / (1000 * 60 * 60);
      collectionStatus = hoursSinceSent > 24 ? 'no_response' : 'sent';
    }
  }

  return {
    id: conv.id,
    contactId: conv.contact_id,
    contactName: conv.contact?.name || conv.contact?.call_name || conv.contact?.phone_number || 'Desconhecido',
    contactPhone: conv.contact?.phone_number || '',
    contactAvatar: conv.contact?.profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.contact?.name || 'U')}&background=0ea5e9&color=fff`,
    contactEmail: conv.contact?.email || null,
    status: conv.status,
    isActive: conv.is_active,
    assignedTeam: conv.assigned_team,
    assignedUserId: conv.assigned_user_id,
    assignedUserName: conv.assignedUserName || null,
    lastMessage: lastMsg?.content || '',
    lastMessageTime: formatRelativeTime(conv.last_message_at),
    lastMessageAt: conv.last_message_at,
    lastMessageFromUser,
    unreadCount,
    tags: [...(conv.tags || []), ...(conv.contact?.tags || [])],
    messages: sortedMessages.map(transformDBToUIMessage),
    clientMemory: conv.contact?.client_memory || getDefaultClientMemory(),
    ninaContext: conv.nina_context || null,
    notes: conv.contact?.notes || null,
    // Use linked company data as fallback if contact fields are null
    contactCpf: conv.contact?.cpf || null,
    contactPetName: (conv.contact as any)?.pet_name || null,
    agentId: conv.agent?.id || null,
    agentName: conv.agent?.name || null,
    agentSlug: conv.agent?.slug || null,
    // WhatsApp 24h window
    whatsappWindowStart: conv.whatsapp_window_start || null,
    isWhatsAppWindowOpen: isWindowOpen,
    windowHoursRemaining: hoursRemaining,
    // Collection template
    hasCollectionTemplate: isCollectionTemplate || false,
    collectionTemplateName: isCollectionTemplate ? templateName : null,
    // Collection status for lead tracking
    collectionStatus,
    collectionSentAt
  };
}

export function transformDBToUIMessage(msg: DBMessage): UIMessage {
  // Extract sender_name from metadata if present
  const metadata = msg.metadata as Record<string, any> | null;
  const senderName = metadata?.sender_name || null;
  
  return {
    id: msg.id,
    content: msg.content || '',
    timestamp: formatMessageTime(msg.sent_at),
    sentAt: msg.sent_at,
    direction: msg.from_type === 'user' ? MessageDirection.INCOMING : MessageDirection.OUTGOING,
    type: mapDBMessageType(msg.type),
    status: mapDBMessageStatus(msg.status),
    fromType: msg.from_type,
    mediaUrl: msg.media_url,
    senderName,
    metadata
  };
}

function mapDBMessageType(type: DBMessageType): MessageType {
  switch (type) {
    case 'image': return MessageType.IMAGE;
    case 'audio': return MessageType.AUDIO;
    case 'document': return MessageType.DOCUMENT;
    case 'video': return MessageType.VIDEO;
    default: return MessageType.TEXT;
  }
}

function mapDBMessageStatus(status: DBMessageStatus): 'sent' | 'delivered' | 'read' | 'failed' | 'processing' {
  switch (status) {
    case 'read': return 'read';
    case 'delivered': return 'delivered';
    case 'failed': return 'failed';
    case 'processing': return 'processing';
    default: return 'sent';
  }
}

// Fuso horário padrão do sistema
const SYSTEM_TIMEZONE = 'America/Sao_Paulo';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays}d`;
  
  return date.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit',
    timeZone: SYSTEM_TIMEZONE 
  });
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('pt-BR', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: SYSTEM_TIMEZONE 
  });
}

function getDefaultClientMemory(): ClientMemory {
  return {
    last_updated: null,
    lead_profile: {
      interests: [],
      lead_stage: 'new',
      objections: [],
      products_discussed: [],
      communication_style: 'unknown',
      qualification_score: 0
    },
    sales_intelligence: {
      pain_points: [],
      next_best_action: 'qualify',
      budget_indication: 'unknown',
      decision_timeline: 'unknown'
    },
    interaction_summary: {
      response_pattern: 'unknown',
      last_contact_reason: '',
      total_conversations: 0,
      preferred_contact_time: 'unknown'
    },
    conversation_history: []
  };
}