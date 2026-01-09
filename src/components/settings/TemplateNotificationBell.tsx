import React, { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCircle2, XCircle, AlertTriangle, Flag, Info, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TemplateNotification {
  id: string;
  template_name: string;
  template_language: string | null;
  new_status: string;
  event_type: string;
  reason: string | null;
  rejection_reason: string | null;
  rejection_recommendation: string | null;
  created_at: string;
  read_at: string | null;
}

const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.log('Could not play notification sound');
  }
};

const showToastForNewNotification = (notification: any) => {
  const templates: Record<string, { title: string; description: string; type: 'success' | 'error' | 'warning' | 'info' }> = {
    'APPROVED': {
      title: '✅ Template Aprovado!',
      description: `O template "${notification.template_name}" foi aprovado pela Meta.`,
      type: 'success'
    },
    'REJECTED': {
      title: '❌ Template Rejeitado',
      description: `O template "${notification.template_name}" foi rejeitado. ${notification.rejection_reason || ''}`,
      type: 'error'
    },
    'DISABLED': {
      title: '⚠️ Template Desativado',
      description: `O template "${notification.template_name}" foi desativado pela Meta.`,
      type: 'warning'
    },
    'FLAGGED': {
      title: '🚩 Template Sinalizado',
      description: `O template "${notification.template_name}" foi sinalizado para revisão.`,
      type: 'warning'
    },
    'PENDING_DELETION': {
      title: '🗑️ Template para Exclusão',
      description: `O template "${notification.template_name}" está agendado para exclusão.`,
      type: 'warning'
    }
  };

  const config = templates[notification.event_type] || {
    title: 'Atualização de Template',
    description: `Status do template "${notification.template_name}" alterado para ${notification.event_type}`,
    type: 'info' as const
  };

  if (config.type === 'success') {
    toast.success(config.title, { description: config.description });
  } else if (config.type === 'error') {
    toast.error(config.title, { description: config.description });
  } else if (config.type === 'warning') {
    toast.warning(config.title, { description: config.description });
  } else {
    toast.info(config.title, { description: config.description });
  }
};

const getStatusConfig = (event: string) => {
  switch (event) {
    case 'APPROVED':
      return { 
        icon: CheckCircle2, 
        color: 'text-emerald-400', 
        bgColor: 'bg-emerald-500/10',
        label: 'Aprovado' 
      };
    case 'REJECTED':
      return { 
        icon: XCircle, 
        color: 'text-red-400', 
        bgColor: 'bg-red-500/10',
        label: 'Rejeitado' 
      };
    case 'DISABLED':
      return { 
        icon: AlertTriangle, 
        color: 'text-amber-400', 
        bgColor: 'bg-amber-500/10',
        label: 'Desativado' 
      };
    case 'FLAGGED':
      return { 
        icon: Flag, 
        color: 'text-orange-400', 
        bgColor: 'bg-orange-500/10',
        label: 'Sinalizado' 
      };
    case 'PENDING_DELETION':
      return { 
        icon: AlertTriangle, 
        color: 'text-red-400', 
        bgColor: 'bg-red-500/10',
        label: 'Exclusão Pendente' 
      };
    default:
      return { 
        icon: Info, 
        color: 'text-slate-400', 
        bgColor: 'bg-slate-500/10',
        label: event 
      };
  }
};

function NotificationItem({ 
  notification, 
  onMarkRead 
}: { 
  notification: TemplateNotification; 
  onMarkRead: () => void;
}) {
  const config = getStatusConfig(notification.event_type);
  const Icon = config.icon;
  const isUnread = !notification.read_at;

  return (
    <div 
      className={`p-3 rounded-lg mb-2 cursor-pointer transition-colors
        ${isUnread ? config.bgColor : 'bg-slate-700/30'} 
        hover:bg-slate-700/50`}
      onClick={onMarkRead}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 ${config.color} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white truncate">
              {notification.template_name}
            </span>
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-cyan-500 shrink-0" />
            )}
          </div>
          <p className="text-sm text-slate-400">
            Template {config.label.toLowerCase()}
          </p>
          {notification.rejection_reason && (
            <p className="text-xs text-red-400 mt-1">
              Motivo: {notification.rejection_reason}
            </p>
          )}
          {notification.rejection_recommendation && (
            <p className="text-xs text-slate-500 mt-1">
              Recomendação: {notification.rejection_recommendation}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-1">
            {formatDistanceToNow(new Date(notification.created_at), { 
              addSuffix: true, 
              locale: ptBR 
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TemplateNotificationBell() {
  const [notifications, setNotifications] = useState<TemplateNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('template_status_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const typedData = (data || []) as unknown as TemplateNotification[];
      setNotifications(typedData);
      setUnreadCount(typedData.filter(n => !n.read_at).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    
    // Realtime subscription
    const channel = supabase
      .channel('template-notifications-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'template_status_notifications'
      }, (payload) => {
        console.log('[Notifications] New template status update:', payload);
        playNotificationSound();
        fetchNotifications();
        showToastForNewNotification(payload.new);
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('template_status_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('template_status_notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);

      if (error) throw error;
      
      setNotifications(prev => 
        prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
      toast.success('Todas as notificações marcadas como lidas');
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error('Erro ao marcar notificações');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0">
          <Bell className="w-5 h-5 text-slate-400" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center bg-red-500 text-white text-xs border-0"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        align="end"
        sideOffset={8}
      >
        <div className="p-3 border-b border-slate-700">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-white text-sm">
              Atualizações de Templates
            </h4>
            {unreadCount > 0 && (
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={markAllAsRead}
                className="h-7 text-xs text-cyan-400 hover:text-cyan-300"
              >
                <Check className="w-3 h-3 mr-1" />
                Marcar lidas
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="h-[320px] p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="w-10 h-10 text-slate-600 mb-2" />
              <p className="text-sm text-slate-400">Nenhuma notificação</p>
              <p className="text-xs text-slate-500 mt-1">
                Atualizações de templates aparecerão aqui
              </p>
            </div>
          ) : (
            notifications.map(notification => (
              <NotificationItem 
                key={notification.id}
                notification={notification}
                onMarkRead={() => markAsRead(notification.id)}
              />
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
