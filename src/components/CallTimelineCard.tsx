import React, { useState, useRef } from 'react';
import { Phone, PhoneOff, PhoneMissed, Clock, Play, Pause, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { CallLog } from '@/hooks/useContactCallHistory';

interface CallTimelineCardProps {
  call: CallLog;
}

const SimpleAudioPlayer: React.FC<{ src: string }> = ({ src }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onEnded={() => setIsPlaying(false)}
      />
      <button
        onClick={togglePlay}
        className="w-8 h-8 flex items-center justify-center bg-emerald-500/20 hover:bg-emerald-500/30 rounded-full transition-colors"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 text-emerald-400" />
        ) : (
          <Play className="w-4 h-4 text-emerald-400 ml-0.5" />
        )}
      </button>
      <div className="flex-1">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-400 transition-all"
            style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatTime(progress)} / {formatTime(duration)}
      </span>
    </div>
  );
};

const CallTimelineCard: React.FC<CallTimelineCardProps> = ({ call }) => {
  const [showTranscription, setShowTranscription] = useState(false);

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string): string => {
    return new Date(dateStr).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          icon: Phone,
          label: 'Ligação Concluída',
          bgColor: 'bg-emerald-500/10',
          borderColor: 'border-emerald-500/30',
          textColor: 'text-emerald-400',
          iconBg: 'bg-emerald-500/20'
        };
      case 'no_answer':
        return {
          icon: PhoneMissed,
          label: 'Não Atendeu',
          bgColor: 'bg-amber-500/10',
          borderColor: 'border-amber-500/30',
          textColor: 'text-amber-400',
          iconBg: 'bg-amber-500/20'
        };
      case 'busy':
        return {
          icon: PhoneOff,
          label: 'Ocupado',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30',
          textColor: 'text-red-400',
          iconBg: 'bg-red-500/20'
        };
      case 'failed':
        return {
          icon: PhoneOff,
          label: 'Falha na Ligação',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30',
          textColor: 'text-red-400',
          iconBg: 'bg-red-500/20'
        };
      case 'initiated':
      case 'ringing':
        return {
          icon: Phone,
          label: status === 'initiated' ? 'Iniciada' : 'Chamando',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/30',
          textColor: 'text-blue-400',
          iconBg: 'bg-blue-500/20'
        };
      default:
        return {
          icon: Phone,
          label: 'Ligação',
          bgColor: 'bg-muted/50',
          borderColor: 'border-border',
          textColor: 'text-muted-foreground',
          iconBg: 'bg-muted'
        };
    }
  };

  const config = getStatusConfig(call.status);
  const StatusIcon = config.icon;

  return (
    <div className="flex justify-center my-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className={`w-full max-w-md ${config.bgColor} ${config.borderColor} border rounded-xl p-4 shadow-lg backdrop-blur-sm`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${config.iconBg} rounded-full flex items-center justify-center`}>
              <StatusIcon className={`w-5 h-5 ${config.textColor}`} />
            </div>
            <div>
              <p className={`font-semibold ${config.textColor}`}>{config.label}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{formatTime(call.started_at)}</span>
                {call.duration_seconds && call.duration_seconds > 0 && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span>{formatDuration(call.duration_seconds)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Audio Player */}
        {call.record_url && (
          <div className="mt-3 bg-muted/50 rounded-lg p-3">
            <SimpleAudioPlayer src={call.record_url} />
          </div>
        )}

        {/* Transcription Toggle */}
        {call.transcription && (
          <div className="mt-3">
            <button
              onClick={() => setShowTranscription(!showTranscription)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Ver transcrição</span>
              {showTranscription ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            
            {showTranscription && (
              <div className="mt-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground leading-relaxed max-h-40 overflow-y-auto custom-scrollbar">
                {call.transcription}
              </div>
            )}
          </div>
        )}

        {/* Transcription Status */}
        {call.transcription_status === 'processing' && !call.transcription && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
            <span>Transcrevendo...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CallTimelineCard;
