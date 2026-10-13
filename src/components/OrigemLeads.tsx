import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, parseISO } from 'date-fns';
import { Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Row = {
  canal: string | null; campanha_id: string | null; campanha_nome: string | null;
  anuncio_id: string | null; anuncio_nome: string | null; semana: string | null;
  contatos: number; com_cnpj: number; em_proposta: number; clientes: number;
  enviados_pipedrive: number; erro_pipedrive: number;
};
const METRICS = ['contatos', 'com_cnpj', 'em_proposta', 'clientes', 'enviados_pipedrive', 'erro_pipedrive'] as const;
const LABELS: Record<string, string> = { contatos: 'Contatos', com_cnpj: 'Com CNPJ', em_proposta: 'Em proposta', clientes: 'Clientes', enviados_pipedrive: 'Enviados Pipedrive', erro_pipedrive: 'Erro Pipedrive' };

const OrigemLeads: React.FC = () => {
  const [inicio, setInicio] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [fim, setFim] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['origem_funil', inicio, fim],
    queryFn: async () => {
      // semana = início da semana; inclui a semana que contém a data inicial
      const iniSemana = format(subDays(parseISO(inicio), 6), 'yyyy-MM-dd');
      const { data, error } = await (supabase as any).from('origem_funil').select('*')
        .gte('semana', iniSemana).lte('semana', fim);
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const porCanal = useMemo(() => {
    const m = new Map<string, number>();
    data.forEach(r => m.set(r.canal || 'Direto', (m.get(r.canal || 'Direto') || 0) + r.contatos));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
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
      METRICS.forEach(k => { c.total[k] += r[k] || 0; a.v[k] += r[k] || 0; });
    });
    return [...camp.values()].sort((a, b) => b.total.contatos - a.total.contatos);
  }, [data]);

  const exportar = () => {
    const head = ['canal', 'campanha_id', 'campanha_nome', 'anuncio_id', 'anuncio_nome', 'semana', ...METRICS];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(','), ...data.map(r => head.map(h => esc((r as any)[h])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `origem-leads_${inicio}_${fim}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-auto bg-background p-6 text-foreground">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Origem dos leads</h1>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-muted-foreground">De
            <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="ml-2 rounded-md border border-border bg-card px-2 py-1 text-foreground" /></label>
          <label className="text-sm text-muted-foreground">Até
            <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="ml-2 rounded-md border border-border bg-card px-2 py-1 text-foreground" /></label>
          <button onClick={exportar} disabled={!data.length} className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
            <Download className="h-4 w-4" /> Exportar CSV</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {porCanal.map(([canal, n]) => (
          <div key={canal} className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm text-muted-foreground">{canal}</div>
            <div className="text-2xl font-semibold">{n}</div>
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
              <tr><th className="p-2 text-left">Campanha / anúncio</th>{METRICS.map(k => <th key={k} className="p-2 text-right">{LABELS[k]}</th>)}</tr>
            </thead>
            <tbody>
              {grupos.map(g => (
                <React.Fragment key={g.canal + g.nome}>
                  <tr className="border-t border-border bg-card font-medium">
                    <td className="p-2">{g.nome} <span className="text-xs text-muted-foreground">· {g.canal}</span></td>
                    {METRICS.map(k => <td key={k} className="p-2 text-right">{g.total[k]}</td>)}
                  </tr>
                  {[...g.ads.values()].sort((a, b) => b.v.contatos - a.v.contatos).map(a => (
                    <tr key={a.nome} className="border-t border-border/50">
                      <td className="p-2 pl-8 text-muted-foreground">{a.nome}</td>
                      {METRICS.map(k => <td key={k} className="p-2 text-right">{a.v[k]}</td>)}
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
