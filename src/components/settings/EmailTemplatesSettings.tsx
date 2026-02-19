import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Copy, Trash2, ToggleLeft, ToggleRight, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '../Button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import EmailTemplateEditorModal from './EmailTemplateEditorModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  'follow-up': { label: 'Follow-up', icon: '📬', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  'proposal': { label: 'Proposta', icon: '📋', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  'welcome': { label: 'Boas-vindas', icon: '🎉', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  'general': { label: 'Geral', icon: '📧', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
};

const EmailTemplatesSettings: React.FC = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmTemplate, setDeleteConfirmTemplate] = useState<EmailTemplate | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates((data || []) as any);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setIsModalOpen(true);
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setIsModalOpen(true);
  };

  const handleDuplicate = async (template: EmailTemplate) => {
    try {
      const { error } = await supabase.from('email_templates').insert({
        name: `${template.name} (Cópia)`,
        subject: template.subject,
        body_html: template.body_html,
        category: template.category,
        is_active: false,
      });

      if (error) throw error;
      toast.success('Template duplicado com sucesso');
      loadTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast.error('Erro ao duplicar template');
    }
  };

  const handleToggleActive = async (template: EmailTemplate) => {
    try {
      const { error } = await supabase
        .from('email_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id);

      if (error) throw error;
      toast.success(template.is_active ? 'Template desativado' : 'Template ativado');
      loadTemplates();
    } catch (error) {
      console.error('Error toggling template:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmTemplate) return;

    try {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', deleteConfirmTemplate.id);

      if (error) throw error;
      toast.success('Template excluído com sucesso');
      setDeleteConfirmTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Erro ao excluir template');
    }
  };

  const handleSaveTemplate = async (template: Partial<EmailTemplate>) => {
    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('email_templates')
          .update({
            name: template.name,
            subject: template.subject,
            body_html: template.body_html,
            category: template.category,
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('Template atualizado com sucesso');
      } else {
        const { error } = await supabase.from('email_templates').insert([{
          name: template.name!,
          subject: template.subject!,
          body_html: template.body_html!,
          category: template.category || 'general',
          is_active: true,
        }]);

        if (error) throw error;
        toast.success('Template criado com sucesso');
      }

      setIsModalOpen(false);
      loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Erro ao salvar template');
    }
  };

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.subject.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && template.is_active) ||
      (statusFilter === 'inactive' && !template.is_active);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getCategoryConfig = (category: string) => {
    return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.general;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Templates de Email</h3>
          <p className="text-sm text-slate-400">Gerencie seus templates para envio de emails</p>
        </div>
        <Button variant="primary" onClick={handleCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-slate-800/50 border-slate-700"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 bg-slate-800/50 border-slate-700">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Categorias</SelectItem>
            <SelectItem value="follow-up">📬 Follow-up</SelectItem>
            <SelectItem value="proposal">📋 Proposta</SelectItem>
            <SelectItem value="welcome">🎉 Boas-vindas</SelectItem>
            <SelectItem value="general">📧 Geral</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 bg-slate-800/50 border-slate-700">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Mail className="w-12 h-12 mb-4 opacity-50" />
          <p>Nenhum template encontrado</p>
          <Button variant="ghost" onClick={handleCreate} className="mt-4">
            Criar primeiro template
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredTemplates.map((template) => {
            const categoryConfig = getCategoryConfig(template.category);
            return (
              <div
                key={template.id}
                className={`p-4 rounded-lg border bg-slate-800/30 transition-all hover:bg-slate-800/50 ${
                  template.is_active ? 'border-slate-700' : 'border-slate-800 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-white truncate">{template.name}</h4>
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full border ${categoryConfig.color}`}
                      >
                        {categoryConfig.icon} {categoryConfig.label}
                      </span>
                      {!template.is_active && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700/50 text-slate-500 border border-slate-600">
                          Inativo
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 truncate">
                      <span className="text-slate-500">Assunto:</span> {template.subject}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(template)}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDuplicate(template)}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                      title="Duplicar"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(template)}
                      className={`h-8 w-8 p-0 ${
                        template.is_active
                          ? 'text-green-400 hover:text-green-300'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title={template.is_active ? 'Desativar' : 'Ativar'}
                    >
                      {template.is_active ? (
                        <ToggleRight className="w-4 h-4" />
                      ) : (
                        <ToggleLeft className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirmTemplate(template)}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-red-400"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      <EmailTemplateEditorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        template={editingTemplate}
        onSave={handleSaveTemplate}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmTemplate} onOpenChange={() => setDeleteConfirmTemplate(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Excluir Template</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir o template "{deleteConfirmTemplate?.name}"? Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EmailTemplatesSettings;
