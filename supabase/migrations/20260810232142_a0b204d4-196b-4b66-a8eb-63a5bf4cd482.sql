CREATE TABLE public.tts_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL UNIQUE CHECK (environment IN ('test','production')),
  voice_id text NOT NULL DEFAULT '9BWtsMINqrJLrRacOk9x',
  model text NOT NULL DEFAULT 'eleven_turbo_v2_5',
  stability numeric NOT NULL DEFAULT 0.75,
  similarity_boost numeric NOT NULL DEFAULT 0.80,
  style numeric NOT NULL DEFAULT 0.30,
  speed numeric NOT NULL DEFAULT 1.0,
  speaker_boost boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tts_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tts_profiles TO authenticated;
GRANT ALL ON public.tts_profiles TO service_role;

ALTER TABLE public.tts_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tts profiles"
  ON public.tts_profiles FOR SELECT TO authenticated
  USING (public.is_authenticated_user());

CREATE POLICY "Admins can manage tts profiles"
  ON public.tts_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_tts_profiles_updated_at
  BEFORE UPDATE ON public.tts_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tts_profiles (environment, voice_id, model, stability, similarity_boost, style, speed, speaker_boost)
SELECT e.env,
       COALESCE(s.elevenlabs_voice_id, '9BWtsMINqrJLrRacOk9x'),
       COALESCE(s.elevenlabs_model, 'eleven_turbo_v2_5'),
       COALESCE(s.elevenlabs_stability, 0.75),
       COALESCE(s.elevenlabs_similarity_boost, 0.80),
       COALESCE(s.elevenlabs_style, 0.30),
       COALESCE(s.elevenlabs_speed, 1.0),
       COALESCE(s.elevenlabs_speaker_boost, true)
FROM (VALUES ('test'), ('production')) AS e(env)
LEFT JOIN LATERAL (SELECT * FROM public.nina_settings LIMIT 1) s ON true;