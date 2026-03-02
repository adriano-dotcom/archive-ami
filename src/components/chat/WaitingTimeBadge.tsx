import React, { useState, useEffect } from 'react';
import { Hourglass, Timer, BellRing } from 'lucide-react';

interface WaitingTimeBadgeProps {
  lastMessageAt: string;
  lastMessageFromUser: boolean;
  compact?: boolean;
}

export const WaitingTimeBadge: React.FC<WaitingTimeBadgeProps> = ({ 
  lastMessageAt, 
  lastMessageFromUser,
  compact = false 
}) => {
  const [waitingMinutes, setWaitingMinutes] = useState(0);

  useEffect(() => {
    const calculateWaiting = () => {
      if (!lastMessageFromUser) return 0;
      const lastMsgTime = new Date(lastMessageAt);
      const now = new Date();
      const diffMs = now.getTime() - lastMsgTime.getTime();
      return Math.floor(diffMs / (1000 * 60));
    };

    setWaitingMinutes(calculateWaiting());

    const interval = setInterval(() => {
      setWaitingMinutes(calculateWaiting());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [lastMessageAt, lastMessageFromUser]);

  // Don't show if not waiting for response (last message was from agent)
  if (!lastMessageFromUser || waitingMinutes < 1) {
    return null;
  }

  // iOS 18 style urgency configuration
  const getUrgencyStyle = () => {
    if (waitingMinutes >= 30) {
      return {
        gradient: 'bg-gradient-to-r from-red-500/25 to-rose-500/25',
        iconColor: 'text-red-400',
        textColor: 'text-red-300',
        borderColor: 'border-red-500/40',
        glow: 'shadow-lg shadow-red-500/20',
        pulse: true,
        icon: BellRing
      };
    }
    if (waitingMinutes >= 10) {
      return {
        gradient: 'bg-gradient-to-r from-amber-500/25 to-orange-500/25',
        iconColor: 'text-amber-400',
        textColor: 'text-amber-300',
        borderColor: 'border-amber-500/40',
        glow: 'shadow-lg shadow-amber-500/20',
        pulse: false,
        icon: Timer
      };
    }
    return {
      gradient: 'bg-gradient-to-r from-muted/25 to-muted/15',
      iconColor: 'text-muted-foreground',
      textColor: 'text-muted-foreground',
      borderColor: 'border-border',
      glow: '',
      pulse: false,
      icon: Hourglass
    };
  };

  const formatWaitingTime = () => {
    if (waitingMinutes >= 60) {
      const hours = Math.floor(waitingMinutes / 60);
      const mins = waitingMinutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${waitingMinutes}m`;
  };

  const urgency = getUrgencyStyle();
  const Icon = urgency.icon;

  if (compact) {
    return (
      <span 
        className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium flex items-center gap-1 border backdrop-blur-sm ${urgency.gradient} ${urgency.borderColor} ${urgency.pulse ? 'animate-pulse' : ''}`}
        title={`Aguardando resposta há ${formatWaitingTime()}`}
      >
        <Icon className={`w-2.5 h-2.5 ${urgency.iconColor}`} />
        <span className={urgency.textColor}>{formatWaitingTime()}</span>
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border backdrop-blur-sm ${urgency.gradient} ${urgency.borderColor} ${urgency.glow} ${urgency.pulse ? 'animate-pulse' : ''}`}>
      <Icon className={`w-4 h-4 ${urgency.iconColor}`} />
      <div className="flex flex-col">
        <span className={`text-xs font-medium ${urgency.textColor}`}>Aguardando</span>
        <span className="text-[10px] text-muted-foreground">{formatWaitingTime()}</span>
      </div>
    </div>
  );
};
