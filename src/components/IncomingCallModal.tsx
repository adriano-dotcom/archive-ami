import React, { useState } from 'react';
import { Phone, PhoneOff, User, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { IncomingWhatsAppCall } from '@/hooks/useIncomingWhatsAppCall';

interface IncomingCallModalProps {
  call: IncomingWhatsAppCall | null;
  onDismiss: () => void;
}

const formatPhone = (phone: string | null) => {
  if (!phone) return 'Número desconhecido';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return phone;
};

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ call, onDismiss }) => {
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const handleAccept = async () => {
    if (!call) return;
    setAccepting(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-call-accept', {
        body: { call_id: call.id },
      });
      if (error || !data?.success) throw new Error(data?.error || 'Erro ao atender chamada');
      toast.success('Chamada atendida!', { description: 'Conectando via WhatsApp...' });
      onDismiss();
    } catch (err: any) {
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
      onDismiss();
    } catch (err: any) {
      toast.error('Erro ao rejeitar', { description: err.message });
      onDismiss();
    } finally {
      setRejecting(false);
    }
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
            {/* Pulsing ring */}
            <div className="relative flex items-center justify-center">
              <span className="absolute w-32 h-32 rounded-full bg-green-500/20 animate-ping" />
              <span className="absolute w-24 h-24 rounded-full bg-green-500/30 animate-ping animation-delay-300" />

              {/* Avatar */}
              <div className="relative w-20 h-20 rounded-full overflow-hidden border-4 border-green-500/60 shadow-lg shadow-green-500/20 bg-slate-700 flex items-center justify-center z-10">
                {call.profile_picture_url ? (
                  <img src={call.profile_picture_url} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-slate-400" />
                )}
              </div>
            </div>

            {/* Info */}
            <div className="text-center space-y-1">
              <p className="text-xs font-medium text-green-400 tracking-widest uppercase">Chamada WhatsApp</p>
              <h2 className="text-2xl font-bold text-white">{displayName}</h2>
              {call.contact_name && (
                <p className="text-sm text-slate-400 font-mono">{displayPhone}</p>
              )}
              <p className="text-sm text-slate-500 animate-pulse mt-1">Chamando...</p>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-8">
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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
