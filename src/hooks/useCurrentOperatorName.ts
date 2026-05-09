import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

const GENERIC_PREFIXES = new Set([
  'contato', 'contact', 'vendas', 'sales', 'suporte', 'support',
  'atendimento', 'comercial', 'jarvis', 'noreply', 'no-reply',
  'admin', 'info', 'hello', 'ola', 'financeiro',
]);

const FALLBACK_NAME = 'Atendente';

function formatFromEmail(email: string): string | null {
  const localPart = email.split('@')[0];
  if (!localPart) return null;
  if (GENERIC_PREFIXES.has(localPart.toLowerCase())) return null;
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

const cache = new Map<string, string>();

export function useCurrentOperatorName(): string {
  const { user } = useAuth();
  const [name, setName] = useState<string>(() => {
    if (!user?.email) return FALLBACK_NAME;
    return cache.get(user.email) ?? '';
  });

  useEffect(() => {
    if (!user) {
      setName(FALLBACK_NAME);
      return;
    }

    const email = user.email ?? '';
    if (cache.has(email)) {
      setName(cache.get(email)!);
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      // 1. team_members.name
      let resolved: string | null = null;
      if (email) {
        const { data } = await supabase
          .from('team_members')
          .select('name')
          .eq('email', email)
          .maybeSingle();
        if (data?.name && data.name.trim()) {
          resolved = data.name.trim();
        }
      }

      // 2. user metadata
      if (!resolved) {
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const metaName = (meta.full_name as string) || (meta.name as string);
        if (metaName && metaName.trim()) resolved = metaName.trim();
      }

      // 3. email local part (skip generic)
      if (!resolved && email) {
        resolved = formatFromEmail(email);
      }

      const final = resolved || FALLBACK_NAME;
      if (email) cache.set(email, final);
      if (!cancelled) setName(final);
    };

    resolve();
    return () => { cancelled = true; };
  }, [user?.id, user?.email]);

  return name || FALLBACK_NAME;
}
