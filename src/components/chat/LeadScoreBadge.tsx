import React from 'react';
import { Flame, Sun, Snowflake } from 'lucide-react';
import { ClientMemory } from '@/types';

interface LeadScoreBadgeProps {
  clientMemory: ClientMemory;
  compact?: boolean;
}

export const LeadScoreBadge: React.FC<LeadScoreBadgeProps> = ({ clientMemory, compact = false }) => {
  const score = clientMemory?.lead_profile?.qualification_score || 0;
  
  // Determine lead temperature based on score - iOS 18 style
  const getLeadTemperature = () => {
    if (score >= 70) {
      return {
        label: 'Hot',
        icon: Flame,
        gradient: 'bg-gradient-to-r from-orange-500/25 to-red-500/25',
        iconColor: 'text-orange-400',
        borderColor: 'border-orange-500/40',
        glow: 'shadow-lg shadow-orange-500/20',
        pulse: true
      };
    }
    if (score >= 40) {
      return {
        label: 'Warm',
        icon: Sun,
        gradient: 'bg-gradient-to-r from-yellow-500/25 to-amber-500/25',
        iconColor: 'text-yellow-400',
        borderColor: 'border-yellow-500/40',
        glow: 'shadow-lg shadow-yellow-500/20',
        pulse: false
      };
    }
    return {
      label: 'Cold',
      icon: Snowflake,
      gradient: 'bg-gradient-to-r from-cyan-500/25 to-blue-500/25',
      iconColor: 'text-cyan-400',
      borderColor: 'border-cyan-500/40',
      glow: 'shadow-lg shadow-cyan-500/20',
      pulse: false
    };
  };

  const temp = getLeadTemperature();
  const Icon = temp.icon;

  if (compact) {
    return (
      <span 
        className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1 border backdrop-blur-sm ${temp.gradient} ${temp.borderColor} ${temp.pulse ? 'animate-pulse' : ''}`}
        title={`Lead Score: ${score}%`}
      >
        <Icon className={`w-2.5 h-2.5 ${temp.iconColor}`} />
        {score > 0 && <span className={temp.iconColor}>{score}</span>}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border backdrop-blur-sm ${temp.gradient} ${temp.borderColor} ${temp.glow} ${temp.pulse ? 'animate-pulse' : ''}`}>
      <Icon className={`w-4 h-4 ${temp.iconColor}`} />
      <div className="flex flex-col">
        <span className={`text-xs font-bold ${temp.iconColor}`}>{temp.label} Lead</span>
        <span className="text-[10px] text-muted-foreground">Score: {score}%</span>
      </div>
    </div>
  );
};
