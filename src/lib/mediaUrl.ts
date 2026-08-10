import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';

/** Buckets privados cujas URLs precisam ser assinadas para tocar/exibir no app. */
const PRIVATE_BUCKETS = ['whatsapp-media', 'nina-audio'];

const signedCache = new Map<string, { url: string; expiresAt: number }>();

/** Extrai { bucket, path } de uma URL de storage (public ou sign). */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

/**
 * Converte URLs de buckets privados em URLs assinadas.
 * URLs de buckets públicos ou externas são devolvidas sem alteração.
 */
export async function resolveMediaUrl(
  url: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!url) return null;
  const parsed = parseStorageUrl(url);
  if (!parsed || !PRIVATE_BUCKETS.includes(parsed.bucket)) return url;

  const cacheKey = `${parsed.bucket}/${parsed.path}`;
  const cached = signedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, expiresIn);

  if (error || !data?.signedUrl) {
    console.error('[media] Falha ao assinar URL:', parsed.bucket, parsed.path, error);
    return null;
  }

  signedCache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + expiresIn * 1000 });
  return data.signedUrl;
}

/** Hook: devolve a URL pronta para uso (assinada quando necessário). */
export function useResolvedMediaUrl(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(() => {
    const parsed = url ? parseStorageUrl(url) : null;
    return parsed && PRIVATE_BUCKETS.includes(parsed.bucket) ? null : url ?? null;
  });

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setResolved(null);
      return;
    }
    resolveMediaUrl(url).then((u) => {
      if (!cancelled) setResolved(u);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolved;
}
