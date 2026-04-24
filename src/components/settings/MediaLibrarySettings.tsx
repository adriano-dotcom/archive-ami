import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Upload, Trash2, Plus, Loader2, Video, Image as ImageIcon, FileText, Music, Sparkles, Send, Play } from 'lucide-react';

interface OrbePlan {
  id: string;
  plan_name: string;
}

interface MediaItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  media_type: string;
  file_url: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  thumbnail_url: string | null;
  plan_id: string | null;
  trigger_keywords: string[];
  auto_send_enabled: boolean;
  tags: string[];
  is_active: boolean;
  send_count: number;
  last_sent_at: string | null;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  geral: 'Geral',
  orbita_plus: 'Órbita Plus',
  orbita_total: 'Órbita Total',
  orbita_galaxia: 'Órbita Galáxia',
  comparativo: 'Comparativo de Planos',
  reembolso: 'Reembolso',
  onboarding: 'Onboarding',
  objecao: 'Objeções',
};

const MEDIA_ICON: Record<string, React.ReactNode> = {
  video: <Video className="w-4 h-4 text-primary" />,
  image: <ImageIcon className="w-4 h-4 text-primary" />,
  document: <FileText className="w-4 h-4 text-primary" />,
  audio: <Music className="w-4 h-4 text-primary" />,
};

const detectMediaType = (file: File): 'video' | 'image' | 'document' | 'audio' => {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
};

const formatBytes = (bytes: number | null) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MediaLibrarySettings: React.FC = () => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [plans, setPlans] = useState<OrbePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'general',
    plan_id: '',
    trigger_keywords: '',
    auto_send_enabled: false,
    tags: '',
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [itemsRes, plansRes] = await Promise.all([
      supabase.from('media_library').select('*').order('created_at', { ascending: false }),
      supabase.from('orbe_plans_catalog').select('id, plan_name').eq('is_active', true).order('display_order'),
    ]);

    if (itemsRes.error) {
      console.error('Erro ao carregar mídias:', itemsRes.error);
      toast.error('Erro ao carregar biblioteca');
    } else {
      setItems((itemsRes.data as MediaItem[]) || []);
    }
    if (!plansRes.error) setPlans((plansRes.data as OrbePlan[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      category: 'general',
      plan_id: '',
      trigger_keywords: '',
      auto_send_enabled: false,
      tags: '',
    });
    setSelectedFile(null);
    setEditing(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openAdd = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const openEdit = (item: MediaItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description || '',
      category: item.category,
      plan_id: item.plan_id || '',
      trigger_keywords: (item.trigger_keywords || []).join(', '),
      auto_send_enabled: item.auto_send_enabled,
      tags: (item.tags || []).join(', '),
    });
    setShowAddDialog(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 50MB.');
      e.target.value = '';
      return;
    }
    if (file.type.startsWith('video/') && file.size > 16 * 1024 * 1024) {
      toast.warning('Vídeo acima de 16MB pode falhar no envio via WhatsApp. Considere comprimir.');
    }
    setSelectedFile(file);
    if (!form.name) {
      setForm((f) => ({ ...f, name: file.name.replace(/\.[^/.]+$/, '') }));
    }
  };

  const handleSubmit = async () => {
    if (!editing && !selectedFile) {
      toast.error('Selecione um arquivo');
      return;
    }
    if (!form.name.trim()) {
      toast.error('Informe o nome');
      return;
    }

    setUploading(true);
    try {
      let payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        plan_id: form.plan_id || null,
        trigger_keywords: form.trigger_keywords
          .split(',')
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean),
        auto_send_enabled: form.auto_send_enabled,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };

      if (editing) {
        const { error } = await supabase.from('media_library').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Mídia atualizada');
      } else {
        const file = selectedFile!;
        const mediaType = detectMediaType(file);
        const ext = file.name.split('.').pop() || 'bin';
        const path = `${mediaType}/${Date.now()}_${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('media-library')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;

        const { data: urlData } = supabase.storage.from('media-library').getPublicUrl(path);

        const { data: { user } } = await supabase.auth.getUser();

        const { error: insErr } = await supabase.from('media_library').insert({
          ...payload,
          media_type: mediaType,
          file_url: urlData.publicUrl,
          file_path: path,
          file_size: file.size,
          mime_type: file.type,
          created_by: user?.id || null,
        });
        if (insErr) throw insErr;
        toast.success('Mídia adicionada à biblioteca');
      }

      setShowAddDialog(false);
      resetForm();
      fetchAll();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (item: MediaItem) => {
    const { error } = await supabase
      .from('media_library')
      .update({ is_active: !item.is_active })
      .eq('id', item.id);
    if (error) {
      toast.error('Erro ao alterar status');
    } else {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i)));
    }
  };

  const handleDelete = async (item: MediaItem) => {
    if (!confirm(`Excluir "${item.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await supabase.storage.from('media-library').remove([item.file_path]);
      const { error } = await supabase.from('media_library').delete().eq('id', item.id);
      if (error) throw error;
      toast.success('Mídia excluída');
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Biblioteca de Mídia
            </CardTitle>
            <CardDescription>
              Vídeos curtos, imagens e documentos prontos para envio rápido pelo chat ou pela Orbi automaticamente.
              Limite de 50MB. Para WhatsApp prefira vídeos até 16MB.
            </CardDescription>
          </div>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="w-4 h-4" />
            Adicionar mídia
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
              <Upload className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>Nenhuma mídia cadastrada ainda.</p>
              <p className="text-xs mt-1">Comece adicionando os vídeos curtos de explicação dos planos.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-center">Auto Orbi</TableHead>
                  <TableHead className="text-center">Envios</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const planName = plans.find((p) => p.id === item.plan_id)?.plan_name;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{MEDIA_ICON[item.media_type] || <FileText className="w-4 h-4" />}</TableCell>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        {item.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">{item.description}</div>
                        )}
                        <div className="text-xs text-muted-foreground mt-0.5">{formatBytes(item.file_size)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{CATEGORY_LABELS[item.category] || item.category}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{planName || '—'}</TableCell>
                      <TableCell className="text-center">
                        {item.auto_send_enabled ? (
                          <Badge className="bg-primary/15 text-primary border-primary/30">Sim</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm">{item.send_count}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={item.is_active} onCheckedChange={() => toggleActive(item)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setPreviewItem(item)} title="Visualizar">
                            <Play className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDelete(item)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de adicionar/editar */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { setShowAddDialog(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar mídia' : 'Adicionar mídia à biblioteca'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editing && (
              <div>
                <Label>Arquivo</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,image/*,application/pdf,audio/*"
                  onChange={handleFileChange}
                  className="mt-1"
                />
                {selectedFile && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedFile.name} • {formatBytes(selectedFile.size)}
                  </p>
                )}
              </div>
            )}
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Apresentação Plano Plus"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Quando usar este vídeo, contexto, etc."
                rows={2}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plano vinculado (opcional)</Label>
                <Select
                  value={form.plan_id || 'none'}
                  onValueChange={(v) => setForm({ ...form, plan_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.plan_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Palavras-chave para envio automático</Label>
              <Input
                value={form.trigger_keywords}
                onChange={(e) => setForm({ ...form, trigger_keywords: e.target.value })}
                placeholder="Ex: plus, intermediario, melhor custo (separe por vírgulas)"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Quando o lead mencionar uma destas palavras, a Orbi pode anexar este vídeo automaticamente.
              </p>
            </div>
            <div>
              <Label>Tags (opcional)</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="objeção preço, primeira mensagem"
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label className="text-sm">Envio automático pela Orbi</Label>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, a Orbi pode anexar esta mídia automaticamente ao detectar interesse.
                </p>
              </div>
              <Switch
                checked={form.auto_send_enabled}
                onCheckedChange={(v) => setForm({ ...form, auto_send_enabled: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowAddDialog(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={uploading} className="gap-2">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Send className="w-4 h-4" /> {editing ? 'Salvar' : 'Adicionar'}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Dialog open={!!previewItem} onOpenChange={(open) => { if (!open) setPreviewItem(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewItem?.name}</DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="flex items-center justify-center bg-black/30 rounded-lg p-2">
              {previewItem.media_type === 'video' && (
                <video src={previewItem.file_url} controls className="max-h-[60vh] rounded" />
              )}
              {previewItem.media_type === 'image' && (
                <img src={previewItem.file_url} alt={previewItem.name} className="max-h-[60vh] rounded" />
              )}
              {previewItem.media_type === 'audio' && (
                <audio src={previewItem.file_url} controls className="w-full" />
              )}
              {previewItem.media_type === 'document' && (
                <iframe src={previewItem.file_url} className="w-full h-[60vh] rounded" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MediaLibrarySettings;
