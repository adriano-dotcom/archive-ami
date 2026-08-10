import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ElevenLabsVoice {
  id: string;
  name: string;
  description?: string;
  preview_url?: string | null;
}

export interface ElevenLabsModel {
  id: string;
  name: string;
}

export const FALLBACK_VOICES: ElevenLabsVoice[] = [
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', description: 'Feminina, natural' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', description: 'Masculina, confiante' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Feminina, suave' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', description: 'Feminina, expressiva' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', description: 'Masculina, casual' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: 'Masculina, britânica' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', description: 'Masculina, transatlântica' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', description: 'Não-binária, americana' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', description: 'Masculina, articulada' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', description: 'Feminina, sueca' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', description: 'Feminina, britânica' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', description: 'Feminina, calorosa' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', description: 'Masculina, amigável' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', description: 'Feminina, expressiva' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', description: 'Masculina, amigável' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', description: 'Masculina, casual' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', description: 'Masculina, profunda' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', description: 'Masculina, britânica' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', description: 'Feminina, britânica' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', description: 'Masculina, americana' },
];

export const FALLBACK_MODELS: ElevenLabsModel[] = [
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (Recomendado)' },
  { id: 'eleven_turbo_v2', name: 'Turbo v2' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2' },
];

let cached: { voices: ElevenLabsVoice[]; models: ElevenLabsModel[] } | null = null;

export function useElevenLabsVoices() {
  const [voices, setVoices] = useState<ElevenLabsVoice[]>(cached?.voices ?? FALLBACK_VOICES);
  const [models, setModels] = useState<ElevenLabsModel[]>(cached?.models ?? FALLBACK_MODELS);
  const [loading, setLoading] = useState(!cached);
  const [isLive, setIsLive] = useState(!!cached);

  useEffect(() => {
    if (cached) return;
    let active = true;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('elevenlabs-voices');
        if (error) throw error;
        if (!active) return;
        const nextVoices: ElevenLabsVoice[] = data?.voices?.length ? data.voices : FALLBACK_VOICES;
        const nextModels: ElevenLabsModel[] = data?.models?.length ? data.models : FALLBACK_MODELS;
        cached = { voices: nextVoices, models: nextModels };
        setVoices(nextVoices);
        setModels(nextModels);
        setIsLive(!!data?.voices?.length);
      } catch (e) {
        console.warn('[useElevenLabsVoices] falling back to static list:', e);
        if (active) setIsLive(false);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { voices, models, loading, isLive };
}
