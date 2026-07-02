import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface QuickReply {
  id: string;
  title: string;
  content: string;
  category: string | null;
  shortcut: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuickReplyInput {
  title: string;
  content: string;
  category?: string | null;
  shortcut?: string | null;
}

export function useQuickReplies() {
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQuickReplies = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('quick_replies')
      .select('*')
      .order('title', { ascending: true });

    if (error) {
      console.error('[useQuickReplies] fetch error:', error);
      toast.error('Erro ao carregar respostas prontas');
    } else {
      setQuickReplies((data as QuickReply[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQuickReplies();

    const channel = supabase
      .channel('quick_replies_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quick_replies' },
        () => fetchQuickReplies(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchQuickReplies]);

  const createQuickReply = useCallback(async (input: QuickReplyInput) => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('quick_replies').insert({
      title: input.title.trim(),
      content: input.content,
      category: input.category?.trim() || null,
      shortcut: input.shortcut?.trim() || null,
      created_by: userData.user?.id ?? null,
    });

    if (error) {
      console.error('[useQuickReplies] create error:', error);
      toast.error('Erro ao criar resposta pronta');
      return false;
    }
    toast.success('Resposta pronta criada');
    await fetchQuickReplies();
    return true;
  }, [fetchQuickReplies]);

  const updateQuickReply = useCallback(async (id: string, input: QuickReplyInput) => {
    const { error } = await supabase
      .from('quick_replies')
      .update({
        title: input.title.trim(),
        content: input.content,
        category: input.category?.trim() || null,
        shortcut: input.shortcut?.trim() || null,
      })
      .eq('id', id);

    if (error) {
      console.error('[useQuickReplies] update error:', error);
      toast.error('Erro ao atualizar resposta pronta');
      return false;
    }
    toast.success('Resposta pronta atualizada');
    await fetchQuickReplies();
    return true;
  }, [fetchQuickReplies]);

  const deleteQuickReply = useCallback(async (id: string) => {
    const { error } = await supabase.from('quick_replies').delete().eq('id', id);

    if (error) {
      console.error('[useQuickReplies] delete error:', error);
      toast.error('Erro ao excluir resposta pronta');
      return false;
    }
    toast.success('Resposta pronta excluída');
    await fetchQuickReplies();
    return true;
  }, [fetchQuickReplies]);

  return {
    quickReplies,
    loading,
    createQuickReply,
    updateQuickReply,
    deleteQuickReply,
    refetch: fetchQuickReplies,
  };
}

/**
 * Substitui variáveis do tipo {nome}, {empresa}, {cnpj}, {rntrc}, {telefone}
 * pelos dados do contato. Variáveis sem dado ficam com um placeholder amigável.
 */
export interface QuickReplyVariables {
  nome?: string | null;
  empresa?: string | null;
  cnpj?: string | null;
  rntrc?: string | null;
  telefone?: string | null;
}

export function applyQuickReplyVariables(
  content: string,
  vars: QuickReplyVariables,
): string {
  const map: Record<string, string | null | undefined> = {
    nome: vars.nome,
    empresa: vars.empresa,
    cnpj: vars.cnpj,
    rntrc: vars.rntrc,
    telefone: vars.telefone,
  };

  return content.replace(/\{(\w+)\}/g, (full, key: string) => {
    const value = map[key.toLowerCase()];
    if (value && String(value).trim()) return String(value).trim();
    return full; // mantém o placeholder original se não houver dado
  });
}

export const QUICK_REPLY_VARIABLES = [
  { token: '{nome}', label: 'Nome do contato' },
  { token: '{empresa}', label: 'Empresa / razão social' },
  { token: '{cnpj}', label: 'CNPJ' },
  { token: '{rntrc}', label: 'RNTRC (ANTT)' },
  { token: '{telefone}', label: 'Telefone' },
];
