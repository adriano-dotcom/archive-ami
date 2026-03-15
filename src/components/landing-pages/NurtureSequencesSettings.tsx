import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Loader2, Mail, MessageSquare, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface NurtureStep {
  day: number;
  channel: 'whatsapp' | 'email';
  template_name?: string;
  subject?: string;
  content?: string;
}

interface NurtureSequence {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  landing_page_id: string | null;
  is_active: boolean;
  steps: NurtureStep[];
  created_at: string;
}

interface LandingPageOption {
  id: string;
  title: string;
  slug: string;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  status: string;
}

const emptyStep: NurtureStep = { day: 0, channel: 'whatsapp', template_name: '' };

export const NurtureSequencesSettings: React.FC = () => {
  const [sequences, setSequences] = useState<NurtureSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NurtureSequence | null>(null);
  const [saving, setSaving] = useState(false);
  const [landingPages, setLandingPages] = useState<LandingPageOption[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({});
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLandingPageId, setFormLandingPageId] = useState<string>('none');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formSteps, setFormSteps] = useState<NurtureStep[]>([{ ...emptyStep }]);

  const fetchData = async () => {
    const [seqRes, lpRes, tplRes] = await Promise.all([
      supabase.from('nurture_sequences').select('*').order('created_at', { ascending: false }),
      supabase.from('landing_pages').select('id, title, slug').order('title'),
      supabase.from('whatsapp_templates').select('id, name, status').eq('status', 'APPROVED'),
    ]);
    setSequences((seqRes.data as unknown as NurtureSequence[]) || []);
    setLandingPages((lpRes.data as unknown as LandingPageOption[]) || []);
    setTemplates((tplRes.data as unknown as WhatsAppTemplate[]) || []);
    setLoading(false);

    // Fetch enrollment counts
    if (seqRes.data) {
      const counts: Record<string, number> = {};
      for (const s of seqRes.data) {
        const { count } = await supabase
          .from('lead_nurture_enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('sequence_id', s.id)
          .eq('status', 'active');
        counts[s.id] = count || 0;
      }
      setEnrollmentCounts(counts);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormDescription('');
    setFormLandingPageId('none');
    setFormIsActive(true);
    setFormSteps([{ day: 0, channel: 'whatsapp', template_name: '' }]);
    setDialogOpen(true);
  };

  const openEdit = (seq: NurtureSequence) => {
    setEditing(seq);
    setFormName(seq.name);
    setFormDescription(seq.description || '');
    setFormLandingPageId(seq.landing_page_id || 'none');
    setFormIsActive(seq.is_active);
    setFormSteps(seq.steps.length > 0 ? [...seq.steps] : [{ ...emptyStep }]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName) { toast.error('Nome é obrigatório'); return; }
    if (formSteps.length === 0) { toast.error('Adicione pelo menos um step'); return; }
    setSaving(true);
    try {
      const payload = {
        name: formName,
        description: formDescription || null,
        trigger_type: 'lead_capture',
        landing_page_id: formLandingPageId === 'none' ? null : formLandingPageId,
        is_active: formIsActive,
        steps: formSteps,
      };
      if (editing) {
        await supabase.from('nurture_sequences').update(payload).eq('id', editing.id);
        toast.success('Sequência atualizada');
      } else {
        await supabase.from('nurture_sequences').insert(payload);
        toast.success('Sequência criada');
      }
      setDialogOpen(false);
      fetchData();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const deleteSequence = async (seq: NurtureSequence) => {
    if (!confirm(`Excluir "${seq.name}"?`)) return;
    await supabase.from('nurture_sequences').delete().eq('id', seq.id);
    toast.success('Excluída');
    fetchData();
  };

  const toggleActive = async (seq: NurtureSequence) => {
    await supabase.from('nurture_sequences').update({ is_active: !seq.is_active }).eq('id', seq.id);
    fetchData();
  };

  const updateStep = (index: number, field: string, value: any) => {
    setFormSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const addStep = () => {
    const lastDay = formSteps.length > 0 ? formSteps[formSteps.length - 1].day : 0;
    setFormSteps(prev => [...prev, { day: lastDay + 2, channel: 'email', subject: '', content: '' }]);
  };

  const removeStep = (index: number) => {
    setFormSteps(prev => prev.filter((_, i) => i !== index));
  };

  const viewLogs = async (seqId: string) => {
    if (expandedLogs === seqId) { setExpandedLogs(null); return; }
    setExpandedLogs(seqId);
    setLogsLoading(true);
    const { data } = await supabase
      .from('nurture_step_logs')
      .select('*, lead_nurture_enrollments(contacts(name, phone_number))')
      .eq('lead_nurture_enrollments.sequence_id', seqId)
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs(data || []);
    setLogsLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Sequências de Nutrição</h2>
          <p className="text-sm text-muted-foreground">Automatize o envio de conteúdo por WhatsApp e Email</p>
        </div>
        <button onClick={openCreate}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Nova Sequência
        </button>
      </div>

      {sequences.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma sequência criada</h3>
            <p className="text-muted-foreground mb-4">Crie sua primeira sequência de nutrição para engajar leads automaticamente.</p>
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium">
              <Plus className="w-4 h-4" /> Criar Sequência
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sequences.map(seq => (
            <Card key={seq.id} className="border-border">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">{seq.name}</h3>
                      <Badge variant={seq.is_active ? 'default' : 'secondary'}>
                        {seq.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                    {seq.description && <p className="text-sm text-muted-foreground truncate mb-2">{seq.description}</p>}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{seq.steps.length} steps</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {enrollmentCounts[seq.id] || 0} ativos</span>
                      <div className="flex gap-1">
                        {seq.steps.map((s, i) => (
                          <span key={i} title={`Dia ${s.day} - ${s.channel}`}>
                            {s.channel === 'whatsapp'
                              ? <MessageSquare className="w-3.5 h-3.5 text-green-500" />
                              : <Mail className="w-3.5 h-3.5 text-blue-500" />}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(seq)} title="Editar"
                      className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleActive(seq)} title={seq.is_active ? 'Desativar' : 'Ativar'}
                      className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                      <Switch checked={seq.is_active} />
                    </button>
                    <button onClick={() => deleteSequence(seq)} title="Excluir"
                      className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Sequência' : 'Nova Sequência de Nutrição'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="Nutrição - Guia Saúde Pet" className="mt-1" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)}
                placeholder="Sequência para leads que baixaram o guia de saúde" className="mt-1" rows={2} />
            </div>
            <div>
              <Label>Landing Page Vinculada</Label>
              <Select value={formLandingPageId} onValueChange={setFormLandingPageId}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (enrollment manual)</SelectItem>
                  {landingPages.map(lp => (
                    <SelectItem key={lp.id} value={lp.id}>{lp.title} (/lp/{lp.slug})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Leads capturados nesta landing page serão inscritos automaticamente</p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              <Label>Ativa</Label>
            </div>

            {/* Steps Editor */}
            <div>
              <Label className="text-base font-semibold">Steps da Sequência</Label>
              <div className="mt-3 space-y-3">
                {formSteps.map((step, index) => (
                  <div key={index} className="border border-border rounded-lg p-3 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground flex items-center gap-2">
                        {step.channel === 'whatsapp'
                          ? <MessageSquare className="w-4 h-4 text-green-500" />
                          : <Mail className="w-4 h-4 text-blue-500" />}
                        Step {index + 1}
                      </span>
                      {formSteps.length > 1 && (
                        <button onClick={() => removeStep(index)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Dia</Label>
                        <Input type="number" min={0} value={step.day}
                          onChange={e => updateStep(index, 'day', parseInt(e.target.value) || 0)}
                          className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Canal</Label>
                        <Select value={step.channel} onValueChange={v => updateStep(index, 'channel', v)}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="whatsapp">WhatsApp</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {step.channel === 'whatsapp' ? (
                      <div>
                        <Label className="text-xs">Template WhatsApp</Label>
                        <Select value={step.template_name || ''} onValueChange={v => updateStep(index, 'template_name', v)}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione um template" /></SelectTrigger>
                          <SelectContent>
                            {templates.map(t => (
                              <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label className="text-xs">Assunto do Email</Label>
                          <Input value={step.subject || ''} onChange={e => updateStep(index, 'subject', e.target.value)}
                            placeholder="Dicas para saúde do seu pet" className="mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Conteúdo HTML</Label>
                          <Textarea value={step.content || ''} onChange={e => updateStep(index, 'content', e.target.value)}
                            placeholder="<h1>Olá {{name}}</h1><p>...</p>" className="mt-1 font-mono text-xs" rows={4} />
                        </div>
                      </>
                    )}
                  </div>
                ))}
                <button onClick={addStep}
                  className="w-full border border-dashed border-border rounded-lg py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Adicionar Step
                </button>
              </div>
            </div>

            <button onClick={handleSave} disabled={saving}
              className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Salvar Alterações' : 'Criar Sequência'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NurtureSequencesSettings;
