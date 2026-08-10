import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { Save, MessageSquare, Mic, Eye, EyeOff, Copy, Check, Loader2, Send, ChevronDown, Volume2, Download, Upload, FileAudio, Mail, Phone, Bot } from 'lucide-react';
import { Button } from '../Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { VaultMigrationPanel } from './VaultMigrationPanel';
import { useTtsProfiles, type TtsEnvironment } from '@/hooks/useTtsProfiles';
import { useElevenLabsVoices } from '@/hooks/useElevenLabsVoices';


interface NinaSettings {
  id?: string;
  whatsapp_access_token: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_waba_id: string | null;
  whatsapp_verify_token: string | null;
  elevenlabs_api_key: string | null;
  elevenlabs_voice_id: string;
  elevenlabs_model: string | null;
  elevenlabs_stability: number;
  elevenlabs_similarity_boost: number;
  elevenlabs_style: number;
  elevenlabs_speed: number | null;
  elevenlabs_speaker_boost: boolean;
  audio_response_enabled: boolean;
  api4com_api_token: string | null;
  api4com_default_extension: string | null;
  api4com_enabled: boolean;
  openai_api_key: string | null;
}

const VOICE_OPTIONS = [
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', desc: 'Feminina, natural' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', desc: 'Masculina, confiante' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Feminina, suave' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', desc: 'Feminina, expressiva' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', desc: 'Masculina, casual' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', desc: 'Masculina, britânica' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', desc: 'Masculina, transatlântica' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', desc: 'Não-binária, americana' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', desc: 'Masculina, articulada' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', desc: 'Feminina, sueca' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', desc: 'Feminina, britânica' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', desc: 'Feminina, calorosa' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', desc: 'Masculina, amigável' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', desc: 'Feminina, expressiva' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', desc: 'Masculina, amigável' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', desc: 'Masculina, casual' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', desc: 'Masculina, profunda' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Masculina, britânica' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', desc: 'Feminina, britânica' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', desc: 'Masculina, americana' },
];

const MODEL_OPTIONS = [
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (Recomendado)' },
  { id: 'eleven_turbo_v2', name: 'Turbo v2' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2' },
];

export interface ApiSettingsRef {
  save: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
}

const ApiSettings = forwardRef<ApiSettingsRef>((props, ref) => {
  const { companyName } = useCompanySettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [showWhatsAppToken, setShowWhatsAppToken] = useState(false);
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [advancedVoiceOpen, setAdvancedVoiceOpen] = useState(false);
  const [testSectionOpen, setTestSectionOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testSending, setTestSending] = useState(false);
  
  // Audio test states
  const [audioTestOpen, setAudioTestOpen] = useState(false);
  const [audioTestText, setAudioTestText] = useState('Olá! Esta é uma mensagem de teste para verificar a qualidade da voz.');
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioStats, setAudioStats] = useState<{ duration_ms: number; size_kb: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Audio simulation states
  const [audioSimulateOpen, setAudioSimulateOpen] = useState(false);
  const [audioSimulatePhone, setAudioSimulatePhone] = useState('');
  const [audioSimulateName, setAudioSimulateName] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioSimulating, setAudioSimulating] = useState(false);
  const [audioSimulateResult, setAudioSimulateResult] = useState<{
    transcription: string;
    contact_id: string;
    conversation_id: string;
    message_id: string;
    queued_for_nina: boolean;
  } | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  
  // Email test states
  const [emailTestOpen, setEmailTestOpen] = useState(false);
  const [emailTestTo, setEmailTestTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  
  const [settings, setSettings] = useState<NinaSettings>({
    whatsapp_access_token: null,
    whatsapp_phone_number_id: null,
    whatsapp_waba_id: null,
    whatsapp_verify_token: 'webhook-verify-token',
    elevenlabs_api_key: null,
    elevenlabs_voice_id: '9BWtsMINqrJLrRacOk9x',
    elevenlabs_model: 'eleven_turbo_v2_5',
    elevenlabs_stability: 0.75,
    elevenlabs_similarity_boost: 0.80,
    elevenlabs_style: 0.30,
    elevenlabs_speed: 1.0,
    elevenlabs_speaker_boost: true,
    audio_response_enabled: false,
    api4com_api_token: null,
    api4com_default_extension: '1000',
    api4com_enabled: false,
    openai_api_key: null,
  });

  // TTS profiles per environment (test / production)
  const { profiles: ttsProfiles, setProfile, saveProfile } = useTtsProfiles();
  const { voices: availableVoices, models: availableModels, isLive: voicesLive } = useElevenLabsVoices();
  const [ttsEnv, setTtsEnv] = useState<TtsEnvironment>('test');
  const [savingTtsProfile, setSavingTtsProfile] = useState(false);
  const ttsProfile = ttsProfiles[ttsEnv];

  
  // API4Com states
  const [showApi4comToken, setShowApi4comToken] = useState(false);
  const [api4comSectionOpen, setApi4comSectionOpen] = useState(false);
  const [copiedApi4comWebhook, setCopiedApi4comWebhook] = useState(false);
  const [testingApi4com, setTestingApi4com] = useState(false);
  
  // OpenAI states
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [openaiSectionOpen, setOpenaiSectionOpen] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  useEffect(() => {
    setTestMessage(`Olá! Esta é uma mensagem de teste do sistema ${companyName}. 🚀`);
  }, [companyName]);

  useEffect(() => {
    loadSettings();
  }, []);

  useImperativeHandle(ref, () => ({
    save: handleSave,
    cancel: loadSettings,
    isSaving: saving
  }));

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('nina_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // Se não existe registro, criar um padrão automaticamente
      if (!data) {
        console.log('[ApiSettings] No settings found, creating default...');
        const { data: newData, error: insertError } = await supabase
          .from('nina_settings')
          .insert({})
          .select('*')
          .single();

        if (insertError) {
          console.error('[ApiSettings] Error creating default settings:', insertError);
          toast.error('Erro ao criar configurações iniciais');
        } else if (newData) {
          setSettings({
            id: newData.id,
            whatsapp_access_token: newData.whatsapp_access_token,
            whatsapp_phone_number_id: newData.whatsapp_phone_number_id,
            whatsapp_waba_id: (newData as any).whatsapp_waba_id || null,
            whatsapp_verify_token: newData.whatsapp_verify_token || 'webhook-verify-token',
            elevenlabs_api_key: newData.elevenlabs_api_key,
            elevenlabs_voice_id: newData.elevenlabs_voice_id,
            elevenlabs_model: newData.elevenlabs_model,
            elevenlabs_stability: newData.elevenlabs_stability,
            elevenlabs_similarity_boost: newData.elevenlabs_similarity_boost,
            elevenlabs_style: newData.elevenlabs_style,
            elevenlabs_speed: newData.elevenlabs_speed,
            elevenlabs_speaker_boost: newData.elevenlabs_speaker_boost,
            audio_response_enabled: newData.audio_response_enabled || false,
            api4com_api_token: (newData as any).api4com_api_token || null,
            api4com_default_extension: (newData as any).api4com_default_extension || '1000',
            api4com_enabled: (newData as any).api4com_enabled || false,
            openai_api_key: newData.openai_api_key || null,
          });
        }
      } else {
        setSettings({
          id: data.id,
          whatsapp_access_token: data.whatsapp_access_token,
          whatsapp_phone_number_id: data.whatsapp_phone_number_id,
          whatsapp_waba_id: (data as any).whatsapp_waba_id || null,
          whatsapp_verify_token: data.whatsapp_verify_token || 'webhook-verify-token',
          elevenlabs_api_key: data.elevenlabs_api_key,
          elevenlabs_voice_id: data.elevenlabs_voice_id,
          elevenlabs_model: data.elevenlabs_model,
          elevenlabs_stability: data.elevenlabs_stability,
          elevenlabs_similarity_boost: data.elevenlabs_similarity_boost,
          elevenlabs_style: data.elevenlabs_style,
          elevenlabs_speed: data.elevenlabs_speed,
          elevenlabs_speaker_boost: data.elevenlabs_speaker_boost,
          audio_response_enabled: data.audio_response_enabled || false,
          api4com_api_token: (data as any).api4com_api_token || null,
          api4com_default_extension: (data as any).api4com_default_extension || '1000',
          api4com_enabled: (data as any).api4com_enabled || false,
          openai_api_key: data.openai_api_key || null,
        });
      }
    } catch (error) {
      console.error('[ApiSettings] Error loading settings:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings.whatsapp_phone_number_id && !/^\d+$/.test(settings.whatsapp_phone_number_id)) {
        toast.error('Phone Number ID deve conter apenas números');
        return;
      }

      if (!settings.id) {
        toast.error('Erro: ID das configurações não encontrado');
        return;
      }

      const { error } = await supabase
        .from('nina_settings')
        .update({
          whatsapp_access_token: settings.whatsapp_access_token,
          whatsapp_phone_number_id: settings.whatsapp_phone_number_id,
          whatsapp_waba_id: settings.whatsapp_waba_id,
          whatsapp_verify_token: settings.whatsapp_verify_token,
          elevenlabs_api_key: settings.elevenlabs_api_key,
          elevenlabs_voice_id: settings.elevenlabs_voice_id,
          elevenlabs_model: settings.elevenlabs_model,
          elevenlabs_stability: settings.elevenlabs_stability,
          elevenlabs_similarity_boost: settings.elevenlabs_similarity_boost,
          elevenlabs_style: settings.elevenlabs_style,
          elevenlabs_speed: settings.elevenlabs_speed,
          elevenlabs_speaker_boost: settings.elevenlabs_speaker_boost,
          audio_response_enabled: settings.audio_response_enabled,
          api4com_api_token: settings.api4com_api_token,
          api4com_default_extension: settings.api4com_default_extension,
          api4com_enabled: settings.api4com_enabled,
          openai_api_key: settings.openai_api_key,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast.success('Configurações de APIs salvas com sucesso!');

      // Reprocessa a fila automaticamente se o WhatsApp estiver configurado
      if (settings.whatsapp_access_token && settings.whatsapp_phone_number_id) {
        toast.info('Reprocessando fila de envios do WhatsApp...');
        await handleReprocessQueue();
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleReprocessQueue = async () => {
    if (!settings.whatsapp_access_token || !settings.whatsapp_phone_number_id) {
      toast.error('Configure e salve o Access Token e o Phone Number ID antes de reprocessar.');
      return;
    }

    setReprocessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('trigger-whatsapp-sender', {
        body: { source: 'api_settings' }
      });
      if (error) throw error;

      const processed = data?.result?.processed;
      if (typeof processed === 'number') {
        toast.success(
          processed > 0
            ? `Fila reprocessada: ${processed} mensagem(ns) enviada(s).`
            : 'Fila reprocessada. Nenhuma mensagem pendente para enviar.'
        );
      } else {
        toast.success('Fila de envios reprocessada com sucesso!');
      }
    } catch (error) {
      console.error('Error reprocessing queue:', error);
      toast.error('Erro ao reprocessar a fila de envios.');
    } finally {
      setReprocessing(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    toast.success('URL do webhook copiada!');
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleSaveTtsProfile = async () => {
    setSavingTtsProfile(true);
    try {
      await saveProfile(ttsEnv);
      toast.success(`Perfil de voz (${ttsEnv === 'test' ? 'Teste' : 'Produção'}) salvo`);
    } catch (e) {
      console.error('Error saving TTS profile:', e);
      toast.error('Erro ao salvar perfil de voz');
    } finally {
      setSavingTtsProfile(false);
    }
  };

  const handleCopyTestToProduction = async () => {
    setSavingTtsProfile(true);
    try {
      await saveProfile('production', { ...ttsProfiles.test, environment: 'production', id: ttsProfiles.production.id });
      toast.success('Perfil de Teste copiado para Produção');
    } catch (e) {
      console.error('Error copying TTS profile:', e);
      toast.error('Erro ao copiar perfil');
    } finally {
      setSavingTtsProfile(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!audioTestText.trim()) {
      toast.error('Insira um texto para converter em áudio');
      return;
    }

    setAudioGenerating(true);
    setAudioUrl(null);
    setAudioStats(null);

    try {
      const { data, error } = await supabase.functions.invoke('test-elevenlabs-tts', {
        body: {
          text: audioTestText,
          environment: ttsEnv,
          voiceId: ttsProfile.voice_id,
          model: ttsProfile.model,
          stability: ttsProfile.stability,
          similarity: ttsProfile.similarity_boost,
          style: ttsProfile.style,
          speed: ttsProfile.speed,
          speakerBoost: ttsProfile.speaker_boost,
        }
      });


      if (error) throw error;

      if (data?.success && data?.audioBase64) {
        // Create audio URL from base64
        const audioBlob = new Blob(
          [Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0))],
          { type: 'audio/mpeg' }
        );
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        setAudioStats({ duration_ms: data.duration_ms, size_kb: data.size_kb });
        toast.success(`Áudio gerado em ${(data.duration_ms / 1000).toFixed(1)}s`);
      } else {
        throw new Error(data?.error || 'Erro ao gerar áudio');
      }
    } catch (error) {
      console.error('Error generating audio:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar áudio';
      toast.error(errorMessage);
    } finally {
      setAudioGenerating(false);
    }
  };

  const handleDownloadAudio = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = 'elevenlabs-test.mp3';
    a.click();
  };

  const handleTestMessage = async () => {
    if (!settings.whatsapp_access_token || !settings.whatsapp_phone_number_id) {
      toast.error('⚠️ Preencha e SALVE as credenciais do WhatsApp primeiro!', {
        description: 'Clique em "Salvar Alterações" no topo da página antes de testar.'
      });
      return;
    }

    if (!testPhone.trim()) {
      toast.error('Insira um número de telefone');
      return;
    }

    if (!testMessage.trim()) {
      toast.error('Insira uma mensagem');
      return;
    }

    if (!testPhone.startsWith('+')) {
      toast.error('O número deve estar no formato internacional (ex: +5511999999999)');
      return;
    }

    setTestSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-whatsapp-message', {
        body: {
          phone_number: testPhone,
          message: testMessage
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Mensagem enviada com sucesso! ✅', {
          description: `ID: ${data.message_id}`
        });
      } else {
        throw new Error(data?.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Error sending test message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao enviar mensagem de teste';
      toast.error('Falha ao enviar mensagem', {
        description: errorMessage
      });
    } finally {
      setTestSending(false);
    }
  };

  const handleSimulateAudioWebhook = async () => {
    if (!audioSimulatePhone.trim()) {
      toast.error('Insira um número de telefone');
      return;
    }

    if (!audioFile) {
      toast.error('Selecione um arquivo de áudio');
      return;
    }

    // Validate phone format
    const cleanPhone = audioSimulatePhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      toast.error('Número de telefone inválido');
      return;
    }

    setAudioSimulating(true);
    setAudioSimulateResult(null);

    try {
      // Convert file to base64
      const arrayBuffer = await audioFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const { data, error } = await supabase.functions.invoke('simulate-audio-webhook', {
        body: {
          phone: cleanPhone,
          name: audioSimulateName.trim() || undefined,
          audio_base64: base64,
          audio_mime_type: audioFile.type || 'audio/ogg'
        }
      });

      if (error) throw error;

      if (data?.success) {
        setAudioSimulateResult({
          transcription: data.transcription,
          contact_id: data.contact_id,
          conversation_id: data.conversation_id,
          message_id: data.message_id,
          queued_for_nina: data.queued_for_nina
        });
        toast.success('Áudio simulado com sucesso!', {
          description: `Transcrição: "${data.transcription?.substring(0, 50)}..."`
        });
      } else {
        throw new Error(data?.error || 'Erro ao simular áudio');
      }
    } catch (error) {
      console.error('Error simulating audio webhook:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao simular recebimento de áudio';
      toast.error('Falha na simulação', {
        description: errorMessage
      });
    } finally {
      setAudioSimulating(false);
    }
  };

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/webm', 'audio/mp4'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(ogg|mp3|wav|m4a|webm|mp4)$/i)) {
        toast.error('Formato de áudio não suportado', {
          description: 'Use .ogg, .mp3, .wav, .m4a ou .webm'
        });
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Arquivo muito grande', {
          description: 'O arquivo deve ter no máximo 10MB'
        });
        return;
      }
      
      setAudioFile(file);
      setAudioSimulateResult(null);
    }
  };

  const handleTestEmail = async () => {
    if (!emailTestTo.trim()) {
      toast.error('Insira um email de destino');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTestTo)) {
      toast.error('Formato de email inválido');
      return;
    }

    setEmailSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: emailTestTo,
          subject: `🧪 Teste de Email - ${companyName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #0891b2; margin-bottom: 20px;">✅ Email de Teste</h1>
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                Este é um email de teste enviado pelo sistema <strong>${companyName}</strong>.
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                Se você recebeu esta mensagem, a integração de email está funcionando corretamente! 🎉
              </p>
              <div style="margin-top: 30px; padding: 15px; background-color: #f3f4f6; border-radius: 8px;">
                <p style="color: #6b7280; font-size: 14px; margin: 0;">
                  Enviado em: ${new Date().toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          `
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Email de teste enviado com sucesso! ✅', {
          description: `Verifique a caixa de entrada de ${emailTestTo}`
        });
      } else {
        throw new Error(data?.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao enviar email de teste';
      toast.error('Falha ao enviar email', {
        description: errorMessage
      });
    } finally {
      setEmailSending(false);
    }
  };

  const whatsappConfigured = settings.whatsapp_access_token && settings.whatsapp_phone_number_id;
  const elevenlabsConfigured = settings.elevenlabs_api_key;
  const api4comConfigured = settings.api4com_api_token && settings.api4com_enabled;
  
  const api4comWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api4com-webhook`;
  
  const copyApi4comWebhookUrl = () => {
    navigator.clipboard.writeText(api4comWebhookUrl);
    setCopiedApi4comWebhook(true);
    toast.success('URL do webhook copiada!');
    setTimeout(() => setCopiedApi4comWebhook(false), 2000);
  };
  
  const handleTestApi4com = async () => {
    if (!settings.api4com_api_token) {
      toast.error('Configure o Token da API4Com primeiro');
      return;
    }
    
    setTestingApi4com(true);
    try {
      // Just validate the token by checking if it's set
      toast.success('Token configurado! Para testar, faça uma ligação de teste no Chat.');
    } finally {
      setTestingApi4com(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Vault Migration Panel */}
      <VaultMigrationPanel />

      {/* WhatsApp Cloud API + Webhook */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white">WhatsApp Cloud API</h3>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
            whatsappConfigured 
              ? 'bg-emerald-500/10 text-emerald-400' 
              : 'bg-amber-500/10 text-amber-400'
          }`}>
            <span className={`h-2 w-2 rounded-full ${whatsappConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            {whatsappConfigured ? 'Configurado' : 'Aguardando'}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Access Token</label>
            <div className="relative">
              <input
                type={showWhatsAppToken ? "text" : "password"}
                value={settings.whatsapp_access_token || ''}
                onChange={(e) => setSettings({ ...settings, whatsapp_access_token: e.target.value })}
                placeholder="EAAxxxxxxxxxxxxxxx..."
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
              <button
                type="button"
                onClick={() => setShowWhatsAppToken(!showWhatsAppToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showWhatsAppToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Phone Number ID</label>
            <input
              type="text"
              value={settings.whatsapp_phone_number_id || ''}
              onChange={(e) => setSettings({ ...settings, whatsapp_phone_number_id: e.target.value })}
              placeholder="123456789012345"
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">
              WABA ID
              <span className="text-slate-500 font-normal ml-1">(Business Account)</span>
            </label>
            <input
              type="text"
              value={settings.whatsapp_waba_id || ''}
              onChange={(e) => setSettings({ ...settings, whatsapp_waba_id: e.target.value })}
              placeholder="123456789012345"
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <p className="text-xs text-slate-500 mt-1">
              Meta Business Manager → Contas → WhatsApp Business
            </p>
          </div>
        </div>

        {/* Webhook Collapsible */}
        <Collapsible.Root open={webhookOpen} onOpenChange={setWebhookOpen}>
          <Collapsible.Trigger className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors">
            <ChevronDown className={`w-4 h-4 transition-transform ${webhookOpen ? 'rotate-180' : ''}`} />
            Configuração de Webhook
          </Collapsible.Trigger>
          <Collapsible.Content className="mt-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Callback URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookUrl}
                  readOnly
                  className="h-9 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-400 font-mono"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyWebhookUrl}
                  className="px-3"
                >
                  {copiedWebhook ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Verify Token</label>
              <input
                type="text"
                value={settings.whatsapp_verify_token || ''}
                onChange={(e) => setSettings({ ...settings, whatsapp_verify_token: e.target.value })}
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>
          </Collapsible.Content>
        </Collapsible.Root>

        {/* Reprocessar fila de envios */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            Dispara imediatamente o envio das mensagens pendentes na fila do WhatsApp.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReprocessQueue}
            disabled={!whatsappConfigured || reprocessing}
            className="shrink-0"
          >
            {reprocessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Reprocessar fila de envios
          </Button>
        </div>
      </div>

      {/* ElevenLabs */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Mic className="w-5 h-5 text-violet-400" />
            <h3 className="font-semibold text-white">ElevenLabs (Text-to-Speech)</h3>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
            elevenlabsConfigured 
              ? 'bg-emerald-500/10 text-emerald-400' 
              : 'bg-amber-500/10 text-amber-400'
          }`}>
            <span className={`h-2 w-2 rounded-full ${elevenlabsConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            {elevenlabsConfigured ? 'Configurado' : 'Aguardando'}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">API Key</label>
            <div className="relative">
              <input
                type={showElevenLabsKey ? "text" : "password"}
                value={settings.elevenlabs_api_key || ''}
                onChange={(e) => setSettings({ ...settings, elevenlabs_api_key: e.target.value })}
                placeholder="sk_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <button
                type="button"
                onClick={() => setShowElevenLabsKey(!showElevenLabsKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showElevenLabsKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Ambiente do perfil de voz */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium text-white">Perfil de voz por ambiente</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Testes no CRM usam o perfil de <span className="text-slate-300">Teste</span>; conversas reais no WhatsApp usam <span className="text-slate-300">Produção</span>.
                </p>
              </div>
              <div className="flex rounded-lg border border-slate-700 overflow-hidden">
                {(['test', 'production'] as const).map((env) => (
                  <button
                    key={env}
                    type="button"
                    onClick={() => setTtsEnv(env)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      ttsEnv === env ? 'bg-violet-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {env === 'test' ? 'Teste' : 'Produção'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">
                  Voz {voicesLive ? <span className="text-emerald-400">(conta ElevenLabs)</span> : <span className="text-slate-600">(lista padrão)</span>}
                </label>
                <select
                  value={ttsProfile.voice_id}
                  onChange={(e) => setProfile(ttsEnv, { voice_id: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  {availableVoices.map(voice => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name}{voice.description ? ` - ${voice.description}` : ''}
                    </option>
                  ))}
                  {!availableVoices.some(v => v.id === ttsProfile.voice_id) && (
                    <option value={ttsProfile.voice_id}>{ttsProfile.voice_id}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Modelo</label>
                <select
                  value={ttsProfile.model}
                  onChange={(e) => setProfile(ttsEnv, { model: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  {availableModels.map(model => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                  {!availableModels.some(m => m.id === ttsProfile.model) && (
                    <option value={ttsProfile.model}>{ttsProfile.model}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {ttsEnv === 'test' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyTestToProduction}
                  disabled={savingTtsProfile}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copiar para Produção
                </Button>
              )}
              <Button
                onClick={handleSaveTtsProfile}
                disabled={savingTtsProfile}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {savingTtsProfile ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" />Salvar perfil ({ttsEnv === 'test' ? 'Teste' : 'Produção'})</>
                )}
              </Button>
            </div>
          </div>


          {/* Audio Response Toggle */}
          <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Volume2 className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-medium text-white">Respostas em Áudio</span>
                </div>
                <p className="text-xs text-slate-400">
                  Quando ativado, Nina responderá com áudios em vez de texto
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.audio_response_enabled}
                  onChange={(e) => setSettings({ ...settings, audio_response_enabled: e.target.checked })}
                  disabled={!elevenlabsConfigured}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-violet-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500 ${!elevenlabsConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              </label>
            </div>
            {!elevenlabsConfigured && (
              <p className="text-xs text-amber-400 mt-2">
                ⚠️ Configure a API Key da ElevenLabs para habilitar respostas em áudio
              </p>
            )}
            {settings.audio_response_enabled && elevenlabsConfigured && (
              <p className="text-xs text-emerald-400 mt-2">
                ✅ Áudios recebidos serão transcritos automaticamente e Nina responderá com áudio
              </p>
            )}
          </div>

          {/* Advanced Voice Settings Collapsible */}
          <Collapsible.Root open={advancedVoiceOpen} onOpenChange={setAdvancedVoiceOpen}>
            <Collapsible.Trigger className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${advancedVoiceOpen ? 'rotate-180' : ''}`} />
              Configurações Avançadas de Voz
            </Collapsible.Trigger>
            <Collapsible.Content className="mt-3 p-4 bg-slate-950/50 rounded-lg border border-slate-800 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-slate-400">Stability</label>
                    <span className="text-xs font-mono text-slate-300">{ttsProfile.stability.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={ttsProfile.stability}
                    onChange={(e) => setProfile(ttsEnv, { stability: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-slate-400">Similarity</label>
                    <span className="text-xs font-mono text-slate-300">{ttsProfile.similarity_boost.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={ttsProfile.similarity_boost}
                    onChange={(e) => setProfile(ttsEnv, { similarity_boost: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-slate-400">Style</label>
                    <span className="text-xs font-mono text-slate-300">{ttsProfile.style.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={ttsProfile.style}
                    onChange={(e) => setProfile(ttsEnv, { style: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-slate-400">Speed</label>
                    <span className="text-xs font-mono text-slate-300">{ttsProfile.speed.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={ttsProfile.speed}
                    onChange={(e) => setProfile(ttsEnv, { speed: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ttsProfile.speaker_boost}
                    onChange={(e) => setProfile(ttsEnv, { speaker_boost: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-violet-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-500"></div>
                </label>
                <span className="text-sm text-slate-300">Speaker Boost</span>
              </div>

            </Collapsible.Content>
          </Collapsible.Root>

          {/* Audio Test Section */}
          <Collapsible.Root open={audioTestOpen} onOpenChange={setAudioTestOpen} className="mt-4">
            <Collapsible.Trigger className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${audioTestOpen ? 'rotate-180' : ''}`} />
              <Volume2 className="w-4 h-4" />
              Testar Áudio
            </Collapsible.Trigger>
            <Collapsible.Content className="mt-3 p-4 bg-slate-950/50 rounded-lg border border-slate-800 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Texto para converter em áudio</label>
                <textarea
                  value={audioTestText}
                  onChange={(e) => setAudioTestText(e.target.value)}
                  placeholder="Digite o texto que deseja converter em áudio..."
                  rows={3}
                  maxLength={1000}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                />
                <p className="text-xs text-slate-500 mt-1">{audioTestText.length}/1000 caracteres</p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleGenerateAudio}
                  disabled={audioGenerating || !settings.elevenlabs_api_key}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  {audioGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 mr-2" />
                      Gerar e Ouvir
                    </>
                  )}
                </Button>

                {audioUrl && (
                  <Button
                    onClick={handleDownloadAudio}
                    variant="ghost"
                    size="sm"
                    className="text-slate-400 hover:text-slate-200"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Baixar
                  </Button>
                )}
              </div>

              {!settings.elevenlabs_api_key && !voicesLive && (
                <p className="text-xs text-amber-400">
                  Configure a API Key da ElevenLabs (ou conecte a integração) para testar
                </p>
              )}


              {audioUrl && (
                <div className="space-y-2">
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    controls
                    className="w-full h-10"
                    autoPlay
                  />
                  {audioStats && (
                    <p className="text-xs text-slate-500">
                      ✅ Gerado em {(audioStats.duration_ms / 1000).toFixed(1)}s • {audioStats.size_kb}KB
                    </p>
                  )}
                </div>
              )}
            </Collapsible.Content>
          </Collapsible.Root>
        </div>
      </div>

      {/* Test Message Collapsible */}
      <Collapsible.Root open={testSectionOpen} onOpenChange={setTestSectionOpen}>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <Collapsible.Trigger className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors w-full">
            <Send className="w-4 h-4" />
            <span>Teste de Envio</span>
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${testSectionOpen ? 'rotate-180' : ''}`} />
          </Collapsible.Trigger>
          <Collapsible.Content className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Telefone</label>
                <input
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+5511999999999"
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Mensagem</label>
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Mensagem de teste..."
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleTestMessage}
                disabled={testSending}
                className="shadow-lg shadow-cyan-500/20"
              >
                {testSending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar Teste
                  </>
                )}
              </Button>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {/* Simulate Audio Reception */}
      <Collapsible.Root open={audioSimulateOpen} onOpenChange={setAudioSimulateOpen}>
        <div className="rounded-xl border border-amber-500/20 bg-slate-900/50 p-6">
          <Collapsible.Trigger className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors w-full">
            <FileAudio className="w-4 h-4 text-amber-400" />
            <span>Simular Recebimento de Áudio</span>
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${audioSimulateOpen ? 'rotate-180' : ''}`} />
          </Collapsible.Trigger>
          <Collapsible.Content className="mt-4 space-y-4">
            <p className="text-xs text-slate-400">
              Simula o recebimento de um áudio pelo WhatsApp. O áudio será transcrito e processado pela IA.
            </p>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Telefone do Contato *</label>
                <input
                  type="tel"
                  value={audioSimulatePhone}
                  onChange={(e) => setAudioSimulatePhone(e.target.value)}
                  placeholder="5511999999999"
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Nome do Contato (opcional)</label>
                <input
                  type="text"
                  value={audioSimulateName}
                  onChange={(e) => setAudioSimulateName(e.target.value)}
                  placeholder="João da Silva"
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
            </div>

            {/* File Upload */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Arquivo de Áudio *</label>
              <div 
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  audioFile 
                    ? 'border-amber-500/50 bg-amber-500/5' 
                    : 'border-slate-700 hover:border-slate-600 bg-slate-950/50'
                }`}
                onClick={() => audioFileInputRef.current?.click()}
              >
                <input
                  ref={audioFileInputRef}
                  type="file"
                  accept=".ogg,.mp3,.wav,.m4a,.webm,audio/*"
                  onChange={handleAudioFileChange}
                  className="hidden"
                />
                {audioFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileAudio className="w-5 h-5 text-amber-400" />
                    <div className="text-left">
                      <p className="text-sm text-slate-200">{audioFile.name}</p>
                      <p className="text-xs text-slate-500">{(audioFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAudioFile(null);
                        setAudioSimulateResult(null);
                      }}
                      className="ml-2 text-slate-500 hover:text-slate-300"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 mx-auto text-slate-500 mb-2" />
                    <p className="text-sm text-slate-400">Clique ou arraste um arquivo de áudio</p>
                    <p className="text-xs text-slate-600 mt-1">.ogg, .mp3, .wav, .m4a, .webm (máx 10MB)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSimulateAudioWebhook}
                disabled={audioSimulating || !audioFile || !audioSimulatePhone.trim()}
                className="bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-500/20"
              >
                {audioSimulating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <FileAudio className="w-4 h-4 mr-2" />
                    Simular Áudio Recebido
                  </>
                )}
              </Button>
            </div>

            {/* Result Display */}
            {audioSimulateResult && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Check className="w-4 h-4" />
                  <span className="text-sm font-medium">Áudio processado com sucesso!</span>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-slate-400">Transcrição:</span>
                    <p className="text-slate-200 mt-1 p-2 bg-slate-950/50 rounded border border-slate-800">
                      "{audioSimulateResult.transcription}"
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Contact ID:</span>
                      <p className="text-slate-300 font-mono">{audioSimulateResult.contact_id.slice(0, 8)}...</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Conversation ID:</span>
                      <p className="text-slate-300 font-mono">{audioSimulateResult.conversation_id.slice(0, 8)}...</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Message ID:</span>
                      <p className="text-slate-300 font-mono">{audioSimulateResult.message_id.slice(0, 8)}...</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Nina:</span>
                      <p className={audioSimulateResult.queued_for_nina ? 'text-emerald-400' : 'text-amber-400'}>
                        {audioSimulateResult.queued_for_nina ? '✅ Processando' : '⏸️ Não enfileirado'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {/* Email Test Section */}
      <Collapsible.Root open={emailTestOpen} onOpenChange={setEmailTestOpen}>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <Collapsible.Trigger asChild>
            <button className="flex items-center justify-between w-full p-4 hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-rose-400" />
                <div className="text-left">
                  <h3 className="font-semibold text-white">Testar Envio de Email</h3>
                  <p className="text-xs text-slate-400">Verificar integração com Resend</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${emailTestOpen ? 'rotate-180' : ''}`} />
            </button>
          </Collapsible.Trigger>

          <Collapsible.Content className="border-t border-slate-800">
            <div className="p-4 space-y-4">
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                <p className="text-sm text-rose-300">
                  <strong>Nota:</strong> Usando o domínio de teste do Resend (onboarding@resend.dev), 
                  emails só podem ser enviados para o email cadastrado na conta Resend. 
                  Para enviar para qualquer email, configure um domínio verificado.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Email de Destino *</label>
                <input
                  type="email"
                  value={emailTestTo}
                  onChange={(e) => setEmailTestTo(e.target.value)}
                  placeholder="seu@email.com"
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleTestEmail}
                  disabled={emailSending || !emailTestTo.trim()}
                  className="bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-500/20"
                >
                  {emailSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Enviar Email de Teste
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {/* API4Com - Telefonia */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-green-400" />
            <h3 className="font-semibold text-white">API4Com - Telefonia</h3>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
            api4comConfigured 
              ? 'bg-emerald-500/10 text-emerald-400' 
              : 'bg-amber-500/10 text-amber-400'
          }`}>
            <span className={`h-2 w-2 rounded-full ${api4comConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            {api4comConfigured ? 'Ativo' : 'Inativo'}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Token de API</label>
            <div className="relative">
              <input
                type={showApi4comToken ? "text" : "password"}
                value={settings.api4com_api_token || ''}
                onChange={(e) => setSettings({ ...settings, api4com_api_token: e.target.value })}
                placeholder="Seu token da API4Com..."
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/50"
              />
              <button
                type="button"
                onClick={() => setShowApi4comToken(!showApi4comToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showApi4comToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Ramal Padrão</label>
            <input
              type="text"
              value={settings.api4com_default_extension || ''}
              onChange={(e) => setSettings({ ...settings, api4com_default_extension: e.target.value })}
              placeholder="1000"
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
          </div>

          <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Phone className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-white">Ativar Ligações</span>
                </div>
                <p className="text-xs text-slate-400">
                  Habilita o botão de ligação no chat
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.api4com_enabled}
                  onChange={(e) => setSettings({ ...settings, api4com_enabled: e.target.checked })}
                  disabled={!settings.api4com_api_token}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500 ${!settings.api4com_api_token ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              </label>
            </div>
          </div>

          <Collapsible.Root open={api4comSectionOpen} onOpenChange={setApi4comSectionOpen}>
            <Collapsible.Trigger className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${api4comSectionOpen ? 'rotate-180' : ''}`} />
              Configuração de Webhook
            </Collapsible.Trigger>
            <Collapsible.Content className="mt-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Webhook URL (configure no painel API4Com)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={api4comWebhookUrl}
                    readOnly
                    className="h-9 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-400 font-mono"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyApi4comWebhookUrl}
                    className="px-3"
                  >
                    {copiedApi4comWebhook ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        </div>
      </div>

      {/* OpenAI / GPT */}
      <Collapsible.Root open={openaiSectionOpen} onOpenChange={setOpenaiSectionOpen}>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <Collapsible.Trigger asChild>
            <button className="flex items-center justify-between w-full p-4 hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-3">
                <Bot className="w-5 h-5 text-emerald-400" />
                <div className="text-left">
                  <h3 className="font-semibold text-white">OpenAI / GPT</h3>
                  <p className="text-xs text-slate-400">API Key própria (opcional)</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
                  settings.openai_api_key 
                    ? 'bg-emerald-500/10 text-emerald-400' 
                    : 'bg-slate-500/10 text-slate-400'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${settings.openai_api_key ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                  {settings.openai_api_key ? 'Configurado' : 'Usando Lovable AI'}
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openaiSectionOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
          </Collapsible.Trigger>

          <Collapsible.Content className="border-t border-slate-800">
            <div className="p-4 space-y-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-sm text-emerald-300">
                  <strong>ℹ️ Lovable AI Gateway:</strong> O sistema usa Lovable AI por padrão, 
                  que não requer API key própria.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">API Key (opcional)</label>
                <div className="relative">
                  <input
                    type={showOpenAIKey ? "text" : "password"}
                    value={settings.openai_api_key || ''}
                    onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value || null })}
                    placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showOpenAIKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                <p className="text-xs text-slate-400 mb-2">
                  <strong className="text-slate-300">💡 Use sua própria key para:</strong>
                </p>
                <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                  <li>Modelos específicos (GPT-4 Turbo, GPT-4o, etc.)</li>
                  <li>Limites de rate mais altos</li>
                  <li>Controle de custos separado</li>
                </ul>
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>
    </div>
  );
});

ApiSettings.displayName = 'ApiSettings';

export default ApiSettings;
