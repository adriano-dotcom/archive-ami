import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface IncomingWhatsAppCall {
  id: string;
  whatsapp_call_id: string | null;
  from_number: string | null;
  to_number: string | null;
  status: string;
  started_at: string | null;
  contact_id: string | null;
  phone_number_id: string | null;
  // enriched
  contact_name?: string | null;
  contact_phone?: string | null;
  profile_picture_url?: string | null;
}

// Persistent AudioContext to avoid browser autoplay restrictions
// Must be created/resumed after a user interaction
let sharedAudioCtx: AudioContext | null = null;
let ringtoneInterval: ReturnType<typeof setInterval> | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

// Pre-unlock AudioContext on first user interaction
if (typeof window !== 'undefined') {
  const unlock = () => {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    window.removeEventListener('click', unlock);
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('click', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

export const useIncomingWhatsAppCall = () => {
  const [incomingCall, setIncomingCall] = useState<IncomingWhatsAppCall | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const playRingtone = useCallback(() => {
    if (ringtoneInterval) return; // already playing
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;

      // Resume context if suspended (needed after user interaction)
      const doPlay = () => {
        const playBeep = () => {
          try {
            if (!ctx || ctx.state === 'closed') return;
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(480, ctx.currentTime);
            oscillator.frequency.setValueAtTime(620, ctx.currentTime + 0.4);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.9);
          } catch { /* silent fail */ }
        };
        playBeep();
        ringtoneInterval = setInterval(playBeep, 2000);
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(doPlay).catch(() => {});
      } else {
        doPlay();
      }
    } catch {
      // silent fail — ringtone is optional
    }
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringtoneInterval) {
      clearInterval(ringtoneInterval);
      ringtoneInterval = null;
    }
  }, []);

  const enrichCallWithContact = useCallback(async (call: any): Promise<IncomingWhatsAppCall> => {
    if (!call.contact_id) return call;
    try {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone_number, profile_picture_url')
        .eq('id', call.contact_id)
        .maybeSingle();
      return {
        ...call,
        contact_name: contact?.name ?? null,
        contact_phone: contact?.phone_number ?? null,
        profile_picture_url: contact?.profile_picture_url ?? null,
      };
    } catch {
      return call;
    }
  }, []);

  const dismissCall = useCallback(() => {
    stopRingtone();
    setIncomingCall(null);
  }, [stopRingtone]);

  useEffect(() => {
    // Check if there's already a ringing call on mount
    const checkExisting = async () => {
      const { data } = await supabase
        .from('whatsapp_calls')
        .select('*')
        .eq('status', 'ringing')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const enriched = await enrichCallWithContact(data);
        setIncomingCall(enriched);
        playRingtone();
      }
    };
    checkExisting();

    // Subscribe to new inserts / updates
    const channel = supabase
      .channel('incoming-whatsapp-calls')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_calls' },
        async (payload) => {
          const call = payload.new as any;
          if (call.status === 'ringing' && call.direction === 'inbound') {
            const enriched = await enrichCallWithContact(call);
            setIncomingCall(enriched);
            playRingtone();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_calls' },
        (payload) => {
          const updated = payload.new as any;
          setIncomingCall(prev => {
            if (!prev || prev.id !== updated.id) return prev;
            // Call ended/rejected → dismiss
            if (['ended', 'rejected', 'missed', 'failed'].includes(updated.status)) {
              stopRingtone();
              return null;
            }
            return { ...prev, status: updated.status };
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      stopRingtone();
      supabase.removeChannel(channel);
    };
  }, [enrichCallWithContact, playRingtone, stopRingtone]);

  return { incomingCall, dismissCall };
};
