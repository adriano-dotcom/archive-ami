import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays, parseISO } from 'date-fns';
import { Download, RefreshCw } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';

type Row = {
  canal: string | null; campanha_id: string | null; campanha_nome: string | null;
  anuncio_id: string | null; anuncio_nome: string | null; semana: string | null; modo: 'last' | 'first';
  contatos: number; com_cnpj: number; em_proposta: number; clientes: number;
  enviados_pipedrive: number; erro_pipedrive: number; negocios: number; ganhos: number; valor_ganho: number;
};
const METRICS = ['contatos', 'com_cnpj', 'em_proposta', 'clientes', 'enviados_pipedrive', 'erro_pipedrive', 'negocios', 'ganhos', 'valor_ganho'] as const;
const LABELS: Record<string, string> = {
  contatos: 'Contatos', com_cnpj: 'Com CNPJ', em_proposta: 'Em proposta', clientes: 'Clientes',
  enviados_pipedrive: 'Enviados Pipedrive', erro_pipedrive: 'Erro Pipedrive', negocios: 'Negócios', ganhos: 'Ganhos', valor_ganho: 'R$ ganho',
};
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (g: number, c: number) => (c ? `${((g / c) * 100).toFixed(1)}%` : '—');
const fmtCell = (k: string, v: number) => (k === 'valor_ganho' ? brl(v) : String(v));

const OrigemLeads: React.FC = () => {
  const [inicio, setInicio] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [fim, setFim] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [modo, setModo] = useState<'last' | 'first'>('last');
  const [syncing, setSyncing] = useState(false);
  const { isAdmin } = useUserRole();
  const qc = useQueryClient();

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['origem_funil', inicio, fim, modo],
    queryFn: async () => {
      const iniSemana = format(subDays(parseISO(inicio), 6), 'yyyy-MM-dd');
      const { data, error } = await (supabase as any).from('origem_funil').select('*')
        .eq('modo', modo).gte('semana', iniSemana).lte('semana', fim);
      if (error) throw error;
      return ((data || []) as Row[]).map(r => ({ ...r, valor_ganho: Number(r.valor_ganho) || 0 }));
    },
  });

  const atualizar = async () => {
    setSyncing(true);
    const { data: res, error } = await supabase.functions.invoke('pipedrive-deal-sync', { body: {} });
    setSyncing(false);
    if (error) {
      const details = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
      toast.error(`Falha ao atualizar: ${details}`);
      return;
    }
    toast.success(`Atualizado: ${res?.contatos_varridos ?? 0} contatos, ${res?.eventos_deal_open ?? 0} negócios novos, ${res?.eventos_deal_won ?? 0} ganhos novos`);
    qc.invalidateQueries({ queryKey: ['origem_funil'] });
  };

  const porCanal = useMemo(() => {
    const m = new Map<string, { contatos: number; negocios: number; ganhos: number; valor: number }>();
    data.forEach(r => {
      const k = r.canal || 'Direto';
      const v = m.get(k) || { contatos: 0, negocios: 0, ganhos: 0, valor: 0 };
      v.contatos += r.contatos; v.negocios += r.negocios || 0; v.ganhos += r.ganhos || 0; v.valor += r.valor_ganho || 0;
      m.set(k, v);
    });
    return [...m.entries()].sort((a, b) => b[1].contatos - a[1].contatos);
  }, [data]);

  const grupos = useMemo(() => {
    const camp = new Map<string, { canal: string; nome: string; total: Record<string, number>; ads: Map<string, { nome: string; v: Record<string, number> }> }>();
    const zero = () => Object.fromEntries(METRICS.map(k => [k, 0])) as Record<string, number>;
    data.forEach(r => {
      const ck = `${r.canal}|${r.campanha_id ?? ''}`;
      if (!camp.has(ck)) camp.set(ck, { canal: r.canal || 'Direto', nome: r.campanha_nome || r.campanha_id || '(sem campanha)', total: zero(), ads: new Map() });
      const c = camp.get(ck)!;
      const ak = r.anuncio_id ?? '';
      if (!c.ads.has(ak)) c.ads.set(ak, { nome: r.anuncio_nome || r.anuncio_id || '(sem anúncio)', v: zero() });
      const a = c.ads.get(ak)!;
      METRICS.forEach(k => { c.total[k] += Number(r[k]) || 0; a.v[k] += Number(r[k]) || 0; });
    });
    return [...camp.values()].sort((a, b) => b.total.contatos - a.total.contatos);
  }, [data]);

  const exportar = () => {
    const head = ['modo', 'canal', 'campanha_id', 'campanha_nome', 'anuncio_id', 'anuncio_nome', 'semana', ...METRICS];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(','), ...data.map(r => head.map(h => esc((r as any)[h])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `origem-leads_${modo}_${inicio}_${fim}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-auto bg-background p-6 text-foreground">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Origem dos leads</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex overflow-hidden rounded-md border border-border text-sm">
            {(['last', 'first'] as const).map(m => (
              <button key={m} onClick={() => setModo(m)}
                className={`px-3 py-1.5 ${modo === m ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}>
                {m === 'last' ? 'Último toque' : 'Primeiro toque'}
              </button>
            ))}
          </div>
          <label className="text-sm text-muted-foreground">De
            <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="ml-2 rounded-md border border-border bg-card px-2 py-1 text-foreground" /></label>
          <label className="text-sm text-muted-foreground">Até
            <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="ml-2 rounded-md border border-border bg-card px-2 py-1 text-foreground" /></label>
          {isAdmin && (
            <button onClick={atualizar} disabled={syncing} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Atualizando...' : 'Atualizar agora'}</button>
          )}
          <button onClick={exportar} disabled={!data.length} className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
            <Download className="h-4 w-4" /> Exportar CSV</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {porCanal.map(([canal, v]) => (
          <div key={canal} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-sm font-medium text-muted-foreground">{canal}</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-xs text-muted-foreground">Contatos</div><div className="text-xl font-semibold">{v.contatos}</div></div>
              <div><div className="text-xs text-muted-foreground">Negócios</div><div className="text-xl font-semibold">{v.negocios}</div></div>
              <div><div className="text-xs text-muted-foreground">Ganhos</div><div className="text-xl font-semibold">{v.ganhos} <span className="text-xs text-muted-foreground">({pct(v.ganhos, v.contatos)})</span></div></div>
              <div><div className="text-xs text-muted-foreground">R$ ganho</div><div className="text-xl font-semibold">{brl(v.valor)}</div></div>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? <p className="text-muted-foreground">Carregando...</p>
        : error ? <p className="text-destructive">Erro ao carregar: {(error as Error).message}</p>
        : !grupos.length ? <p className="text-muted-foreground">Nenhum contato no período.</p>
        : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr><th className="p-2 text-left">Campanha / anúncio</th>{METRICS.map(k => <th key={k} className="p-2 text-right">{LABELS[k]}</th>)}<th className="p-2 text-right">Taxa ganho</th></tr>
            </thead>
            <tbody>
              {grupos.map(g => (
                <React.Fragment key={g.canal + g.nome}>
                  <tr className="border-t border-border bg-card font-medium">
                    <td className="p-2">{g.nome} <span className="text-xs text-muted-foreground">· {g.canal}</span></td>
                    {METRICS.map(k => <td key={k} className="p-2 text-right">{fmtCell(k, g.total[k])}</td>)}
                    <td className="p-2 text-right">{pct(g.total.ganhos, g.total.contatos)}</td>
                  </tr>
                  {[...g.ads.values()].sort((a, b) => b.v.contatos - a.v.contatos).map(a => (
                    <tr key={a.nome} className="border-t border-border/50">
                      <td className="p-2 pl-8 text-muted-foreground">{a.nome}</td>
                      {METRICS.map(k => <td key={k} className="p-2 text-right">{fmtCell(k, a.v[k])}</td>)}
                      <td className="p-2 text-right">{pct(a.v.ganhos, a.v.contatos)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
export default OrigemLeads;
