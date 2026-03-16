import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Eye, Users, Link2, Trash2, ExternalLink, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { NurtureSequencesSettings } from './NurtureSequencesSettings';
import { LandingPageEditor, emptyForm, type LandingPageForm } from './LandingPageEditor';

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
  primary_color: string | null;
  secondary_color: string | null;
  button_style: string | null;
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

export const LandingPagesAdmin: React.FC = () => {
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadsDialogOpen, setLeadsDialogOpen] = useState(false);
  const [leads, setLeads] = useState<LeadCapture[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedPageName, setSelectedPageName] = useState('');
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({});

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LandingPageForm>(emptyForm);

  const fetchPages = async () => {
    const { data } = await supabase
      .from('landing_pages')
      .select('*')
      .order('created_at', { ascending: false });
    setPages((data as unknown as LandingPage[]) || []);
    setLoading(false);
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
    setEditingId(null);
    setForm(emptyForm);
    setEditorOpen(true);
  };

  const openEdit = (page: LandingPage) => {
    setEditingId(page.id);
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
      hero_image_url: page.hero_image_url || '',
      primary_color: page.primary_color || '#6A0DAD',
      secondary_color: page.secondary_color || '#F3E8FF',
      button_style: page.button_style || 'rounded',
      benefits: Array.isArray(page.benefits) ? page.benefits : [],
      testimonials: Array.isArray(page.testimonials) ? page.testimonials : [],
      form_fields: Array.isArray((page as any).form_fields) ? (page as any).form_fields : ['name', 'email', 'phone', 'pet_name'],
      hero_bg_color: (page as any).hero_bg_color || '#FFFFFF',
      section_bg_color: (page as any).section_bg_color || '#F9FAFB',
    });
    setEditorOpen(true);
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
    const url = `https://lp.orbepet.com.br/lp/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  // If editor is open, show full-page editor
  if (editorOpen) {
    return (
      <LandingPageEditor
        form={form}
        setForm={setForm}
        editingId={editingId}
        onBack={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); fetchPages(); }}
      />
    );
  }

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
          <p className="text-sm text-muted-foreground">Gerencie suas páginas de captura e nutrição de leads</p>
        </div>
      </div>

      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages">Páginas</TabsTrigger>
          <TabsTrigger value="nurture">Nutrição</TabsTrigger>
        </TabsList>

        <TabsContent value="pages">
          <div className="flex justify-end mb-4">
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
                        {page.primary_color && (
                          <div className="w-4 h-4 rounded-full border border-border flex-shrink-0"
                            style={{ backgroundColor: page.primary_color }} />
                        )}
                        <h3 className="font-semibold text-foreground truncate">{page.title}</h3>
                        <Badge variant={page.is_active ? 'default' : 'secondary'}>
                          {page.is_active ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">lp.orbepet.com.br/lp/{page.slug}</p>
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
                      <a href={`https://lp.orbepet.com.br/lp/${page.slug}`} target="_blank" rel="noopener noreferrer" title="Visualizar"
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
        </TabsContent>

        <TabsContent value="nurture">
          <NurtureSequencesSettings />
        </TabsContent>
      </Tabs>

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
