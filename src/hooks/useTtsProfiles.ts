import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type TtsEnvironment = 'test' | 'production';

export interface TtsProfile {
  id?: string;
  environment: TtsEnvironment;
  voice_id: string;
  model: string;
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  speaker_boost: boolean;
}

export const DEFAULT_TTS_PROFILE: Omit<TtsProfile, 'environment'> = {
  voice_id: '9BWtsMINqrJLrRacOk9x',
  model: 'eleven_turbo_v2_5',
  stability: 0.75,
  similarity_boost: 0.8,
  style: 0.3,
  speed: 1.0,
  speaker_boost: true,
};

export function useTtsProfiles() {
  const [profiles, setProfiles] = useState<Record<TtsEnvironment, TtsProfile>>({
    test: { environment: 'test', ...DEFAULT_TTS_PROFILE },
    production: { environment: 'production', ...DEFAULT_TTS_PROFILE },
  });
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('tts_profiles').select('*');
    if (!error && data) {
      setProfiles((prev) => {
        const next = { ...prev };
        for (const row of data as any[]) {
          const env = row.environment as TtsEnvironment;
          next[env] = {
            id: row.id,
            environment: env,
            voice_id: row.voice_id,
            model: row.model,
            stability: Number(row.stability),
            similarity_boost: Number(row.similarity_boost),
            style: Number(row.style),
            speed: Number(row.speed),
            speaker_boost: !!row.speaker_boost,
          };
        }
        return next;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const setProfile = useCallback((environment: TtsEnvironment, patch: Partial<TtsProfile>) => {
    setProfiles((prev) => ({ ...prev, [environment]: { ...prev[environment], ...patch } }));
  }, []);

  const saveProfile = useCallback(async (environment: TtsEnvironment, profile?: TtsProfile) => {
    const p = profile ?? profiles[environment];
    const payload = {
      environment,
      voice_id: p.voice_id,
      model: p.model,
      stability: p.stability,
      similarity_boost: p.similarity_boost,
      style: p.style,
      speed: p.speed,
      speaker_boost: p.speaker_boost,
    };
    const { error } = await supabase
      .from('tts_profiles')
      .upsert(payload, { onConflict: 'environment' });
    if (error) throw error;
    await fetchProfiles();
  }, [profiles, fetchProfiles]);

  return { profiles, loading, setProfile, saveProfile, refetch: fetchProfiles };
}
