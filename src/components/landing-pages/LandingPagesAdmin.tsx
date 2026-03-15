import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Eye, Users, Link2, Trash2, ExternalLink, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface LandingPage {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cta_text: string;
  hero_image_url: string | null;
  lead_magnet_type: string;
  lead_magnet_title: string | null;
  lead_magnet_file_url: string | null;
  thank_you_message: string | null;
  is_active: boolean;
  utm_source: string | null;
  utm_campaign: string | null;
  benefits: any[];
  testimonials: any[];
  created_at: string;
}

interface LeadCapture {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  pet_name: string | null;
  utm_source: string | null;
  created_at: string;
}

const emptyPage = {
  slug: '',
  title: '',
  subtitle: '',
  cta_text: 'Baixar Material Gratuito',
  lead_magnet_type: 'ebook',
  lead_magnet_title: '',
  lead_magnet_file_url: '',
  thank_you_message: 'Obrigado! Você receberá o material em instantes.',
  is_active: true,
};

export const LandingPagesAdmin: React.FC = () => {
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [leadsDialogOpen, setLeadsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LandingPage | null>(null);
  const [form, setForm] = useState(emptyPage);
  const [saving, setSaving] = useState(false);
  const [leads, setLeads] = useState<LeadCapture[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedPageName, setSelectedPageName] = useState('');
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({});

  const fetchPages = async () => {
    const { data } = await supabase
      .from('landing_pages')
      .select('*')
      .order('created_at', { ascending: false });
    setPages((data as unknown as LandingPage[]) || []);
    setLoading(false);

    // Fetch lead counts
    if (data) {
      const counts: Record<string, number> = {};
      for (const p of data) {
        const { count } = await supabase
          .from('lead_captures')
          .select('*', { count: 'exact', head: true })
          .eq('landing_page_id', p.id);
        counts[p.id] = count || 0;
      }
      setLeadCounts(counts);
    }
  };

  useEffect(() => { fetchPages(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyPage);
    setDialogOpen(true);
  };

  const openEdit = (page: LandingPage) => {
    setEditing(page);
    setForm({
      slug: page.slug,
      title: page.title,
      subtitle: page.subtitle || '',
      cta_text: page.cta_text,
      lead_magnet_type: page.lead_magnet_type,
      lead_magnet_title: page.lead_magnet_title || '',
      lead_magnet_file_url: page.lead_magnet_file_url || '',
      thank_you_message: page.thank_you_message || '',
      is_active: page.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.slug || !form.title) {
      toast.error('Slug e título são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        title: form.title,
        subtitle: form.subtitle || null,
        cta_text: form.cta_text,
        lead_magnet_type: form.lead_magnet_type,
        lead_magnet_title: form.lead_magnet_title || null,
        lead_magnet_file_url: form.lead_magnet_file_url || null,
        thank_you_message: form.thank_you_message || null,
        is_active: form.is_active,
      };

      if (editing) {
        await supabase.from('landing_pages').update(payload).eq('id', editing.id);
        toast.success('Landing page atualizada');
      } else {
        await supabase.from('landing_pages').insert(payload);
        toast.success('Landing page criada');
      }
      setDialogOpen(false);
      fetchPages();
    } catch (err) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (page: LandingPage) => {
    await supabase.from('landing_pages').update({ is_active: !page.is_active }).eq('id', page.id);
    fetchPages();
  };

  const deletePage = async (page: LandingPage) => {
    if (!confirm(`Excluir "${page.title}"?`)) return;
    await supabase.from('landing_pages').delete().eq('id', page.id);
    toast.success('Excluída');
    fetchPages();
  };

  const viewLeads = async (page: LandingPage) => {
    setSelectedPageName(page.title);
    setLeadsLoading(true);
    setLeadsDialogOpen(true);
    const { data } = await supabase
      .from('lead_captures')
      .select('*')
      .eq('landing_page_id', page.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setLeads((data as unknown as LeadCapture[]) || []);
    setLeadsLoading(false);
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/lp/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 h-full overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Landing Pages</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas páginas de captura de leads</p>
        </div>
        <button onClick={openCreate}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Nova Landing Page
        </button>
      </div>

      {pages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Link2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma landing page criada</h3>
            <p className="text-muted-foreground mb-4">Crie sua primeira página de captura para gerar leads.</p>
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium">
              <Plus className="w-4 h-4" /> Criar Landing Page
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pages.map(page => (
            <Card key={page.id} className="border-border">
              <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground truncate">{page.title}</h3>
                    <Badge variant={page.is_active ? 'default' : 'secondary'}>
                      {page.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">/lp/{page.slug}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" /> {leadCounts[page.id] || 0} leads
                    </span>
                    <span>{page.lead_magnet_type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => copyLink(page.slug)} title="Copiar link"
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                    <Copy className="w-4 h-4" />
                  </button>
                  <a href={`/lp/${page.slug}`} target="_blank" rel="noopener noreferrer" title="Visualizar"
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button onClick={() => viewLeads(page)} title="Ver leads"
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(page)} title="Editar"
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleActive(page)} title={page.is_active ? 'Desativar' : 'Ativar'}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                    <Switch checked={page.is_active} />
                  </button>
                  <button onClick={() => deletePage(page)} title="Excluir"
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Landing Page' : 'Nova Landing Page'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Slug (URL)</Label>
              <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="guia-saude-pet" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">URL: /lp/{form.slug || 'slug'}</p>
            </div>
            <div>
              <Label>Título</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Guia Completo de Saúde Pet" className="mt-1" />
            </div>
            <div>
              <Label>Subtítulo</Label>
              <Textarea value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                placeholder="Descubra como manter seu pet saudável e feliz" className="mt-1" rows={2} />
            </div>
            <div>
              <Label>Texto do CTA</Label>
              <Input value={form.cta_text} onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))}
                placeholder="Baixar Material Gratuito" className="mt-1" />
            </div>
            <div>
              <Label>Tipo do Material</Label>
              <Select value={form.lead_magnet_type} onValueChange={v => setForm(f => ({ ...f, lead_magnet_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ebook">E-book</SelectItem>
                  <SelectItem value="guide">Guia</SelectItem>
                  <SelectItem value="checklist">Checklist</SelectItem>
                  <SelectItem value="webinar">Webinar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome do Material</Label>
              <Input value={form.lead_magnet_title} onChange={e => setForm(f => ({ ...f, lead_magnet_title: e.target.value }))}
                placeholder="E-book: 10 Dicas para Saúde do Pet" className="mt-1" />
            </div>
            <div>
              <Label>URL do Arquivo (PDF)</Label>
              <Input value={form.lead_magnet_file_url} onChange={e => setForm(f => ({ ...f, lead_magnet_file_url: e.target.value }))}
                placeholder="https://..." className="mt-1" />
            </div>
            <div>
              <Label>Mensagem de Agradecimento</Label>
              <Textarea value={form.thank_you_message} onChange={e => setForm(f => ({ ...f, thank_you_message: e.target.value }))}
                className="mt-1" rows={2} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <Label>Ativa</Label>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Salvar Alterações' : 'Criar Landing Page'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leads Dialog */}
      <Dialog open={leadsDialogOpen} onOpenChange={setLeadsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Leads — {selectedPageName}</DialogTitle>
          </DialogHeader>
          {leadsLoading ? (
            <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : leads.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Nenhum lead capturado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Pet</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map(lead => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.name || '—'}</TableCell>
                    <TableCell>{lead.email || '—'}</TableCell>
                    <TableCell>{lead.phone || '—'}</TableCell>
                    <TableCell>{lead.pet_name || '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LandingPagesAdmin;
