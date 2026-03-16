import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Plus, Trash2, Loader2, Upload, Shield, Heart, Star, PawPrint, CheckCircle, Award, Eye } from 'lucide-react';
import { toast } from 'sonner';
import orbepetLogo from '@/assets/orbepet-logo.png';

const ICON_OPTIONS = [
  { value: 'shield', label: 'Escudo', icon: Shield },
  { value: 'heart', label: 'Coração', icon: Heart },
  { value: 'star', label: 'Estrela', icon: Star },
  { value: 'paw', label: 'Pata', icon: PawPrint },
  { value: 'check', label: 'Check', icon: CheckCircle },
  { value: 'award', label: 'Prêmio', icon: Award },
];

const iconMap: Record<string, React.ReactNode> = {
  shield: <Shield className="w-6 h-6" />,
  heart: <Heart className="w-6 h-6" />,
  star: <Star className="w-6 h-6" />,
  paw: <PawPrint className="w-6 h-6" />,
  check: <CheckCircle className="w-6 h-6" />,
  award: <Award className="w-6 h-6" />,
};

export interface LandingPageForm {
  slug: string;
  title: string;
  subtitle: string;
  cta_text: string;
  lead_magnet_type: string;
  lead_magnet_title: string;
  lead_magnet_file_url: string;
  thank_you_message: string;
  is_active: boolean;
  hero_image_url: string;
  primary_color: string;
  secondary_color: string;
  button_style: string;
  benefits: { icon: string; title: string; description: string }[];
  testimonials: { name: string; text: string; avatar: string }[];
}

export const emptyForm: LandingPageForm = {
  slug: '',
  title: '',
  subtitle: '',
  cta_text: 'Baixar Material Gratuito',
  lead_magnet_type: 'ebook',
  lead_magnet_title: '',
  lead_magnet_file_url: '',
  thank_you_message: 'Obrigado! Você receberá o material em instantes.',
  is_active: true,
  hero_image_url: '',
  primary_color: '#6A0DAD',
  secondary_color: '#F3E8FF',
  button_style: 'rounded',
  benefits: [],
  testimonials: [],
};

interface Props {
  form: LandingPageForm;
  setForm: React.Dispatch<React.SetStateAction<LandingPageForm>>;
  editingId: string | null;
  onBack: () => void;
  onSaved: () => void;
}

export const LandingPageEditor: React.FC<Props> = ({ form, setForm, editingId, onBack, onSaved }) => {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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
        hero_image_url: form.hero_image_url || null,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        button_style: form.button_style,
        benefits: form.benefits as any,
        testimonials: form.testimonials as any,
      };

      if (editingId) {
        await supabase.from('landing_pages').update(payload).eq('id', editingId);
        toast.success('Landing page atualizada');
      } else {
        await supabase.from('landing_pages').insert(payload);
        toast.success('Landing page criada');
      }
      onSaved();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `heroes/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('landing-pages').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('landing-pages').getPublicUrl(path);
      setForm(f => ({ ...f, hero_image_url: urlData.publicUrl }));
      toast.success('Imagem enviada!');
    } catch {
      toast.error('Erro ao enviar imagem');
    } finally {
      setUploading(false);
    }
  };

  // Benefits management
  const addBenefit = () => setForm(f => ({
    ...f, benefits: [...f.benefits, { icon: 'paw', title: '', description: '' }]
  }));
  const removeBenefit = (i: number) => setForm(f => ({
    ...f, benefits: f.benefits.filter((_, idx) => idx !== i)
  }));
  const updateBenefit = (i: number, field: string, value: string) => setForm(f => ({
    ...f, benefits: f.benefits.map((b, idx) => idx === i ? { ...b, [field]: value } : b)
  }));

  // Testimonials management
  const addTestimonial = () => setForm(f => ({
    ...f, testimonials: [...f.testimonials, { name: '', text: '', avatar: '' }]
  }));
  const removeTestimonial = (i: number) => setForm(f => ({
    ...f, testimonials: f.testimonials.filter((_, idx) => idx !== i)
  }));
  const updateTestimonial = (i: number, field: string, value: string) => setForm(f => ({
    ...f, testimonials: f.testimonials.map((t, idx) => idx === i ? { ...t, [field]: value } : t)
  }));

  const buttonRadius = form.button_style === 'pill' ? 'rounded-full' : form.button_style === 'square' ? 'rounded-md' : 'rounded-xl';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-background flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-foreground">
            {editingId ? 'Editar Landing Page' : 'Nova Landing Page'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            <span className="text-sm text-muted-foreground">{form.is_active ? 'Ativa' : 'Inativa'}</span>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingId ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <Tabs defaultValue="content" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="content">Conteúdo</TabsTrigger>
            <TabsTrigger value="benefits">Benefícios</TabsTrigger>
            <TabsTrigger value="testimonials">Depoimentos</TabsTrigger>
            <TabsTrigger value="appearance">Aparência</TabsTrigger>
            <TabsTrigger value="preview">
              <Eye className="w-4 h-4 mr-1" /> Preview
            </TabsTrigger>
          </TabsList>

          {/* Content tab */}
          <TabsContent value="content">
            <div className="max-w-2xl space-y-5">
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
                  placeholder="Descubra como manter seu pet saudável" className="mt-1" rows={2} />
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
            </div>
          </TabsContent>

          {/* Benefits tab */}
          <TabsContent value="benefits">
            <div className="max-w-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Benefícios</h3>
                  <p className="text-sm text-muted-foreground">Cards exibidos na seção de benefícios da landing page</p>
                </div>
                <button onClick={addBenefit}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                  <Plus className="w-4 h-4" /> Adicionar
                </button>
              </div>
              {form.benefits.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum benefício adicionado. Serão exibidos os padrão.
                </p>
              )}
              {form.benefits.map((b, i) => (
                <Card key={i} className="border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Benefício {i + 1}</span>
                      <button onClick={() => removeBenefit(i)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <Label className="text-xs">Ícone</Label>
                      <Select value={b.icon} onValueChange={v => updateBenefit(i, 'icon', v)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ICON_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <span className="flex items-center gap-2">
                                <opt.icon className="w-4 h-4" /> {opt.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Título</Label>
                      <Input value={b.title} onChange={e => updateBenefit(i, 'title', e.target.value)}
                        placeholder="Cobertura Completa" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Descrição</Label>
                      <Textarea value={b.description} onChange={e => updateBenefit(i, 'description', e.target.value)}
                        placeholder="Consultas, exames e cirurgias..." className="mt-1" rows={2} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Testimonials tab */}
          <TabsContent value="testimonials">
            <div className="max-w-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Depoimentos</h3>
                  <p className="text-sm text-muted-foreground">Prova social exibida na landing page</p>
                </div>
                <button onClick={addTestimonial}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                  <Plus className="w-4 h-4" /> Adicionar
                </button>
              </div>
              {form.testimonials.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum depoimento adicionado. A seção não será exibida.
                </p>
              )}
              {form.testimonials.map((t, i) => (
                <Card key={i} className="border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Depoimento {i + 1}</span>
                      <button onClick={() => removeTestimonial(i)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <Label className="text-xs">Nome</Label>
                      <Input value={t.name} onChange={e => updateTestimonial(i, 'name', e.target.value)}
                        placeholder="Maria Silva" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Depoimento</Label>
                      <Textarea value={t.text} onChange={e => updateTestimonial(i, 'text', e.target.value)}
                        placeholder="O plano OrbePet mudou a vida do meu pet..." className="mt-1" rows={3} />
                    </div>
                    <div>
                      <Label className="text-xs">URL do Avatar (opcional)</Label>
                      <Input value={t.avatar} onChange={e => updateTestimonial(i, 'avatar', e.target.value)}
                        placeholder="https://..." className="mt-1" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Appearance tab */}
          <TabsContent value="appearance">
            <div className="max-w-2xl space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Imagem Hero</h3>
                <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
                  {form.hero_image_url ? (
                    <div className="space-y-3">
                      <img src={form.hero_image_url} alt="Hero" className="max-h-48 mx-auto rounded-lg object-cover" />
                      <button onClick={() => setForm(f => ({ ...f, hero_image_url: '' }))}
                        className="text-sm text-destructive hover:underline">Remover imagem</button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Clique para enviar imagem</span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      {uploading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                    </label>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cor Primária</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="color" value={form.primary_color}
                      onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                      className="w-10 h-10 rounded cursor-pointer border border-border" />
                    <Input value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                      className="flex-1" />
                  </div>
                </div>
                <div>
                  <Label>Cor Secundária</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="color" value={form.secondary_color}
                      onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))}
                      className="w-10 h-10 rounded cursor-pointer border border-border" />
                    <Input value={form.secondary_color} onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))}
                      className="flex-1" />
                  </div>
                </div>
              </div>

              <div>
                <Label>Estilo do Botão</Label>
                <Select value={form.button_style} onValueChange={v => setForm(f => ({ ...f, button_style: v }))}>
                  <SelectTrigger className="mt-1 max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rounded">Arredondado</SelectItem>
                    <SelectItem value="square">Quadrado</SelectItem>
                    <SelectItem value="pill">Pílula</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Mini preview of button */}
              <div>
                <Label className="text-xs text-muted-foreground">Preview do botão</Label>
                <div className="mt-2">
                  <button className={`px-6 py-3 text-white font-bold ${buttonRadius}`}
                    style={{ backgroundColor: form.primary_color }}>
                    {form.cta_text || 'Baixar Material'}
                  </button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Preview tab */}
          <TabsContent value="preview">
            <div className="border border-border rounded-xl overflow-hidden bg-white">
              <LivePreview form={form} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// Live preview component
const LivePreview: React.FC<{ form: LandingPageForm }> = ({ form }) => {
  const pc = form.primary_color || '#6A0DAD';
  const sc = form.secondary_color || '#F3E8FF';
  const buttonRadius = form.button_style === 'pill' ? '9999px' : form.button_style === 'square' ? '8px' : '12px';

  const defaultBenefits = [
    { icon: 'shield', title: 'Cobertura Completa', description: 'Consultas, exames, internações e cirurgias.' },
    { icon: 'heart', title: 'Sem Carência', description: 'Atendimento imediato após a contratação.' },
    { icon: 'star', title: 'Rede Credenciada', description: 'Mais de 500 clínicas parceiras.' },
  ];
  const benefits = form.benefits.length > 0 ? form.benefits : defaultBenefits;

  return (
    <div className="text-gray-800" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={orbepetLogo} alt="OrbePet" className="w-10 h-10" />
            <span className="font-bold text-lg" style={{ color: pc }}>OrbePet</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-12 px-4" style={{ background: `linear-gradient(135deg, ${pc}08, white, ${sc})` }}>
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
          <div>
            {form.hero_image_url && (
              <img src={form.hero_image_url} alt="Hero" className="rounded-xl mb-6 max-h-64 object-cover w-full" />
            )}
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
              {form.title || 'Título da Landing Page'}
            </h1>
            {form.subtitle && <p className="text-lg text-gray-600 mb-6">{form.subtitle}</p>}
          </div>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">{form.cta_text || 'CTA'}</h3>
            <div className="space-y-3">
              <div className="h-10 bg-gray-100 rounded-lg" />
              <div className="h-10 bg-gray-100 rounded-lg" />
              <div className="h-10 bg-gray-100 rounded-lg" />
              <button className="w-full py-3 text-white font-bold" style={{ backgroundColor: pc, borderRadius: buttonRadius }}>
                {form.cta_text || 'Baixar Material'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-12 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">Por que cuidar da saúde do seu pet?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {benefits.map((b, i) => (
              <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${pc}15`, color: pc }}>
                  {iconMap[b.icon] || <PawPrint className="w-6 h-6" />}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{b.title || 'Título'}</h3>
                <p className="text-sm text-gray-600">{b.description || 'Descrição'}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {form.testimonials.length > 0 && (
        <section className="py-12 px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">O que dizem nossos clientes</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {form.testimonials.map((t, i) => (
                <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <p className="text-gray-600 mb-4 italic">"{t.text || 'Depoimento...'}"</p>
                  <div className="flex items-center gap-3">
                    {t.avatar ? (
                      <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: pc }}>
                        {(t.name || '?')[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="font-semibold text-gray-900">{t.name || 'Nome'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-6 px-4 text-center text-sm">
        © {new Date().getFullYear()} OrbePet. Todos os direitos reservados.
      </footer>
    </div>
  );
};

export default LandingPageEditor;
