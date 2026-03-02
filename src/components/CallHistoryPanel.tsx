import React, { useState, useRef } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, Play, Pause, Volume2, Loader2, FileText, ChevronDown, ChevronUp, NotebookPen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CallLog {
  id: string;
  status: string;
  started_at: string;
  duration_seconds: number | null;
  record_url: string | null;
  transcription?: string | null;
  transcription_status?: string | null;
}

interface CallHistoryPanelProps {
  calls: CallLog[];
  loading?: boolean;
  compact?: boolean;
  onTranscriptionUpdate?: (callId: string, transcription: string) => void;
  contactId?: string;
  contactName?: string;
  onNotesUpdate?: (notes: string) => void;
}

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Hoje';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Ontem';
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'completed':
      return { icon: PhoneOutgoing, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Concluída' };
    case 'answered':
      return { icon: Phone, color: 'text-primary', bg: 'bg-primary/10', label: 'Em andamento' };
    case 'ringing':
      return { icon: PhoneIncoming, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Tocando' };
    case 'dialing':
      return { icon: Phone, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Discando' };
    case 'no_answer':
      return { icon: PhoneMissed, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Não atendeu' };
    case 'busy':
      return { icon: PhoneMissed, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Ocupado' };
    case 'failed':
      return { icon: PhoneMissed, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Falhou' };
    case 'cancelled':
      return { icon: PhoneMissed, color: 'text-muted-foreground', bg: 'bg-muted/50', label: 'Cancelada' };
    case 'timeout':
      return { icon: PhoneMissed, color: 'text-muted-foreground', bg: 'bg-muted/50', label: 'Timeout' };
    default:
      return { icon: Phone, color: 'text-muted-foreground', bg: 'bg-muted/50', label: status };
  }
};

// Inline Audio Player Component
const AudioPlayer: React.FC<{ url: string }> = ({ url }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const togglePlay = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Error playing audio:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatAudioTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-2 bg-card/50 rounded-lg border border-border">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />
      
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-primary hover:bg-primary/80 transition-colors"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4 text-primary-foreground" />
          ) : (
            <Play className="w-4 h-4 text-primary-foreground ml-0.5" />
          )}
        </button>

        <div className="flex-1 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          />
          <span className="text-xs text-muted-foreground font-mono min-w-[70px] text-right">
            {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
          </span>
        </div>

        <Volume2 className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
};

// Transcription Section Component
const TranscriptionSection: React.FC<{
  callId: string;
  callDate: string;
  transcription?: string | null;
  transcriptionStatus?: string | null;
  hasRecording: boolean;
  onTranscriptionUpdate?: (callId: string, transcription: string) => void;
  contactId?: string;
  contactName?: string;
  onNotesUpdate?: (notes: string) => void;
}> = ({ callId, callDate, transcription, transcriptionStatus, hasRecording, onTranscriptionUpdate, contactId, contactName, onNotesUpdate }) => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localTranscription, setLocalTranscription] = useState(transcription);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const handleTranscribe = async () => {
    setIsTranscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-call-recording', {
        body: { call_log_id: callId }
      });

      if (error) throw error;

      if (data?.transcription) {
        setLocalTranscription(data.transcription);
        onTranscriptionUpdate?.(callId, data.transcription);
        toast.success('Transcrição concluída!');
      }
    } catch (error) {
      console.error('Erro na transcrição:', error);
      toast.error('Erro ao transcrever gravação');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSummarizeToNotes = async () => {
    const transcriptionText = localTranscription || transcription;
    if (!transcriptionText || !contactId) {
      toast.error('Transcrição ou contato não disponível');
      return;
    }

    setIsSummarizing(true);
    try {
      const { data: summaryData, error: summaryError } = await supabase.functions.invoke('summarize-transcription', {
        body: { 
          transcription: transcriptionText,
          callDate,
          contactName
        }
      });

      if (summaryError) throw summaryError;

      if (!summaryData?.summary) {
        throw new Error('Resumo não gerado');
      }

      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .select('notes')
        .eq('id', contactId)
        .single();

      if (contactError) throw contactError;

      const existingNotes = contact?.notes || '';
      const separator = existingNotes.trim() ? '\n\n---\n\n' : '';
      const newNotes = existingNotes + separator + summaryData.summary;

      const { error: updateError } = await supabase
        .from('contacts')
        .update({ notes: newNotes })
        .eq('id', contactId);

      if (updateError) throw updateError;

      onNotesUpdate?.(newNotes);
      
      toast.success('Resumo adicionado às notas!');
    } catch (error) {
      console.error('Erro ao resumir para notas:', error);
      toast.error('Erro ao gerar resumo da ligação');
    } finally {
      setIsSummarizing(false);
    }
  };

  const displayTranscription = localTranscription || transcription;
  const isProcessing = isTranscribing || transcriptionStatus === 'processing';

  if (!hasRecording) return null;

  if (displayTranscription) {
    return (
      <div className="mt-2 space-y-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors w-full"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Transcrição</span>
          {isExpanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
        </button>
        
        {isExpanded && (
          <>
            <div className="p-3 bg-card/70 rounded-lg border border-border max-h-40 overflow-y-auto">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {displayTranscription}
              </p>
            </div>
            
            {contactId && (
              <button
                onClick={handleSummarizeToNotes}
                disabled={isSummarizing}
                className="flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSummarizing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Gerando resumo...</span>
                  </>
                ) : (
                  <>
                    <NotebookPen className="w-3.5 h-3.5" />
                    <span>Resumir para Notas</span>
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={handleTranscribe}
        disabled={isProcessing}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Transcrevendo...</span>
          </>
        ) : (
          <>
            <FileText className="w-3.5 h-3.5" />
            <span>Transcrever gravação</span>
          </>
        )}
      </button>
    </div>
  );
};

export const CallHistoryPanel: React.FC<CallHistoryPanelProps> = ({ 
  calls, 
  loading, 
  compact = false,
  onTranscriptionUpdate,
  contactId,
  contactName,
  onNotesUpdate
}) => {
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="text-center py-6">
        <Phone className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Nenhuma ligação registrada</p>
      </div>
    );
  }

  const displayCalls = compact ? calls.slice(0, 5) : calls;

  return (
    <div className="space-y-2">
      {displayCalls.map((call) => {
        const config = getStatusConfig(call.status);
        const Icon = config.icon;
        const isActive = ['dialing', 'ringing', 'answered'].includes(call.status);
        const isExpanded = expandedCallId === call.id;
        const hasRecording = !!call.record_url;

        return (
          <div
            key={call.id}
            className={`rounded-lg border transition-colors ${
              isActive 
                ? 'bg-primary/10 border-primary/30 animate-pulse' 
                : 'bg-muted/50 border-border hover:bg-muted'
            }`}
          >
            <div 
              className={`flex items-center gap-3 p-3 ${hasRecording ? 'cursor-pointer' : ''}`}
              onClick={() => hasRecording && setExpandedCallId(isExpanded ? null : call.id)}
            >
              <div className={`w-8 h-8 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${config.color}`} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${config.color}`}>
                    {config.label}
                  </span>
                  {isActive && (
                    <span className="flex items-center gap-1 text-[10px] text-primary">
                      <Loader2 className="w-3 h-3 animate-spin" />
                    </span>
                  )}
                  {hasRecording && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Volume2 className="w-3 h-3" />
                      Gravação
                    </span>
                  )}
                  {call.transcription && (
                    <span className="flex items-center gap-1 text-[10px] text-primary">
                      <FileText className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{formatDate(call.started_at)}</span>
                  <span>•</span>
                  <span>{formatTime(call.started_at)}</span>
                  {call.duration_seconds && call.duration_seconds > 0 && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(call.duration_seconds)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {isExpanded && hasRecording && (
              <div className="px-3 pb-3 space-y-2">
                <AudioPlayer url={call.record_url!} />
                <TranscriptionSection
                  callId={call.id}
                  callDate={call.started_at}
                  transcription={call.transcription}
                  transcriptionStatus={call.transcription_status}
                  hasRecording={hasRecording}
                  onTranscriptionUpdate={onTranscriptionUpdate}
                  contactId={contactId}
                  contactName={contactName}
                  onNotesUpdate={onNotesUpdate}
                />
              </div>
            )}
          </div>
        );
      })}

      {compact && calls.length > 5 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          + {calls.length - 5} chamadas anteriores
        </p>
      )}
    </div>
  );
};
