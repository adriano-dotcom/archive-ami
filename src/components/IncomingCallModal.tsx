import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Phone, PhoneOff, User, Loader2, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { IncomingWhatsAppCall } from '@/hooks/useIncomingWhatsAppCall';

interface IncomingCallModalProps {
  call: IncomingWhatsAppCall | null;
  onDismiss: () => void;
  onStopRingtone?: () => void;
}

const formatPhone = (phone: string | null) => {
  if (!phone) return 'Número desconhecido';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return phone;
};

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ call, onDismiss, onStopRingtone }) => {
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup WebRTC on unmount or call end
  const cleanupWebRTC = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setInCall(false);
    setCallDuration(0);
    setMuted(false);
  }, []);

  useEffect(() => {
    return () => cleanupWebRTC();
  }, [cleanupWebRTC]);

  const handleAccept = async () => {
    if (!call) return;
    setAccepting(true);
    onStopRingtone?.();
    
    try {
      // 1. Get user microphone
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = localStream;

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      peerConnectionRef.current = pc;

      // Add local audio tracks
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      // Handle remote audio
      pc.ontrack = (event) => {
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      // 3. Set remote description with SDP offer from WhatsApp
      if (!call.sdp_offer) {
        throw new Error('SDP offer não disponível para esta chamada');
      }

      const offerSdp = call.sdp_offer;
      const offerType = (call.sdp_type || 'offer') as RTCSdpType;
      
      await pc.setRemoteDescription(new RTCSessionDescription({ 
        sdp: offerSdp, 
        type: offerType 
      }));

      // 4. Create SDP answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Wait for ICE gathering to complete (or timeout after 3s)
      const finalAnswer = await new Promise<RTCSessionDescriptionInit>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve(pc.localDescription!);
          return;
        }
        const timeout = setTimeout(() => resolve(pc.localDescription!), 3000);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve(pc.localDescription!);
          }
        };
      });

      // 5. Send SDP answer to edge function
      const { data, error } = await supabase.functions.invoke('whatsapp-call-accept', {
        body: { 
          call_id: call.id,
          sdp_answer: finalAnswer.sdp,
          sdp_type: finalAnswer.type || 'answer',
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || 'Erro ao atender chamada');
      }

      // 6. Call is now connected
      setInCall(true);
      toast.success('Chamada conectada!');
      
      // Start call timer
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error('Erro ao atender chamada WebRTC:', err);
      cleanupWebRTC();
      toast.error('Erro ao atender', { description: err.message });
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async () => {
    if (!call) return;
    setRejecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-call-reject', {
        body: { call_id: call.id },
      });
      if (error) throw error;
      toast.info('Chamada rejeitada');
      cleanupWebRTC();
      onDismiss();
    } catch (err: any) {
      toast.error('Erro ao rejeitar', { description: err.message });
      onDismiss();
    } finally {
      setRejecting(false);
    }
  };

  const handleHangup = async () => {
    if (!call) return;
    try {
      await supabase.functions.invoke('whatsapp-call-terminate', {
        body: { call_id: call.id },
      });
      toast.info('Chamada encerrada');
    } catch (err: any) {
      toast.error('Erro ao encerrar', { description: err.message });
    } finally {
      cleanupWebRTC();
      onDismiss();
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMuted(!audioTrack.enabled);
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const displayName = call?.contact_name || formatPhone(call?.from_number || null);
  const displayPhone = formatPhone(call?.from_number || null);

  return (
    <AnimatePresence>
      {call && (
        <motion.div
          key="incoming-call-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
        >
          {/* Hidden audio element for remote stream */}
          <audio ref={remoteAudioRef} autoPlay playsInline />

          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Card */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative z-10 flex flex-col items-center gap-8 px-10 py-12 rounded-3xl bg-slate-900/95 border border-white/10 shadow-2xl min-w-[320px] max-w-sm w-full"
          >
            {/* Pulsing ring (only when ringing) */}
            <div className="relative flex items-center justify-center">
              {!inCall && (
                <>
                  <span className="absolute w-32 h-32 rounded-full bg-green-500/20 animate-ping" />
                  <span className="absolute w-24 h-24 rounded-full bg-green-500/30 animate-ping animation-delay-300" />
                </>
              )}

              {/* Avatar */}
              <div className={`relative w-20 h-20 rounded-full overflow-hidden border-4 ${inCall ? 'border-blue-500/60 shadow-blue-500/20' : 'border-green-500/60 shadow-green-500/20'} shadow-lg bg-slate-700 flex items-center justify-center z-10`}>
                {call.profile_picture_url ? (
                  <img src={call.profile_picture_url} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-slate-400" />
                )}
              </div>
            </div>

            {/* Info */}
            <div className="text-center space-y-1">
              <p className={`text-xs font-medium tracking-widest uppercase ${inCall ? 'text-blue-400' : 'text-green-400'}`}>
                {inCall ? 'Em chamada' : 'Chamada WhatsApp'}
              </p>
              <h2 className="text-2xl font-bold text-white">{displayName}</h2>
              {call.contact_name && (
                <p className="text-sm text-slate-400 font-mono">{displayPhone}</p>
              )}
              {inCall ? (
                <p className="text-lg text-blue-400 font-mono mt-1">{formatDuration(callDuration)}</p>
              ) : (
                <p className="text-sm text-slate-500 animate-pulse mt-1">Chamando...</p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-8">
              {inCall ? (
                <>
                  {/* Mute */}
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={toggleMute}
                      className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${muted ? 'bg-yellow-600 hover:bg-yellow-500 shadow-yellow-500/30' : 'bg-slate-600 hover:bg-slate-500 shadow-slate-500/30'}`}
                    >
                      {muted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
                    </button>
                    <span className="text-xs text-slate-400">{muted ? 'Mudo' : 'Mudo'}</span>
                  </div>

                  {/* Hangup */}
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={handleHangup}
                      className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all active:scale-95"
                    >
                      <PhoneOff className="w-7 h-7 text-white" />
                    </button>
                    <span className="text-xs text-slate-400">Desligar</span>
                  </div>
                </>
              ) : (
                <>
                  {/* Reject */}
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={handleReject}
                      disabled={rejecting || accepting}
                      className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-50 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all active:scale-95"
                    >
                      {rejecting ? (
                        <Loader2 className="w-7 h-7 text-white animate-spin" />
                      ) : (
                        <PhoneOff className="w-7 h-7 text-white" />
                      )}
                    </button>
                    <span className="text-xs text-slate-400">Rejeitar</span>
                  </div>

                  {/* Accept */}
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={handleAccept}
                      disabled={accepting || rejecting}
                      className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-500 disabled:opacity-50 flex items-center justify-center shadow-lg shadow-green-500/30 transition-all active:scale-95"
                    >
                      {accepting ? (
                        <Loader2 className="w-7 h-7 text-white animate-spin" />
                      ) : (
                        <Phone className="w-7 h-7 text-white" />
                      )}
                    </button>
                    <span className="text-xs text-slate-400">Atender</span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
