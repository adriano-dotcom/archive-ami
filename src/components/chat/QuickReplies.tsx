import React, { useMemo, useState } from 'react';
import { Zap, Search, Plus, Pencil, Trash2, Settings2, X, MessageSquareText } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import {
  useQuickReplies, applyQuickReplyVariables, QUICK_REPLY_VARIABLES,
  type QuickReply, type QuickReplyVariables,
} from '@/hooks/useQuickReplies';

interface QuickRepliesPopoverProps {
  variables: QuickReplyVariables;
  onSelect: (resolvedContent: string) => void;
  disabled?: boolean;
}

export const QuickRepliesPopover: React.FC<QuickRepliesPopoverProps> = ({
  variables,
  onSelect,
  disabled,
}) => {
  const { quickReplies, loading, createQuickReply, updateQuickReply, deleteQuickReply } = useQuickReplies();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [managerOpen, setManagerOpen] = useState(false);
  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return quickReplies;
    return quickReplies.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.content.toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q) ||
        (r.shortcut || '').toLowerCase().includes(q),
    );
  }, [quickReplies, search]);

  const handleSelect = (reply: QuickReply) => {
    onSelect(applyQuickReplyVariables(reply.content, variables));
    setOpen(false);
    setSearch('');
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (reply: QuickReply) => {
    setEditing(reply);
    setFormOpen(true);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            title="Respostas prontas"
            className="text-muted-foreground hover:text-primary hover:bg-accent rounded-full transition-colors"
          >
            <Zap className="w-5 h-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-[360px] p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/40">
            <MessageSquareText className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Respostas Prontas</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-xs"
              onClick={() => setManagerOpen(true)}
            >
              <Settings2 className="w-3.5 h-3.5 mr-1" /> Gerenciar
            </Button>
          </div>

          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar resposta..."
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>

          <ScrollArea className="max-h-72">
            <div className="p-2 space-y-1">
              {loading ? (
                <p className="text-center text-sm text-muted-foreground py-6">Carregando...</p>
              ) : filtered.length === 0 ? (
                <div className="text-center py-6 px-3">
                  <p className="text-sm text-muted-foreground mb-3">
                    {quickReplies.length === 0
                      ? 'Nenhuma resposta pronta ainda.'
                      : 'Nenhuma resposta encontrada.'}
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={openNew}>
                    <Plus className="w-4 h-4 mr-1" /> Criar resposta
                  </Button>
                </div>
              ) : (
                filtered.map((reply) => (
                  <button
                    key={reply.id}
                    type="button"
                    onClick={() => handleSelect(reply)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{reply.title}</span>
                      {reply.category && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 shrink-0">
                          {reply.category}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {reply.content}
                    </p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="p-2 border-t border-border">
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={openNew}>
              <Plus className="w-4 h-4 mr-1" /> Nova resposta pronta
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <QuickRepliesManagerModal
        open={managerOpen}
        onOpenChange={setManagerOpen}
        quickReplies={quickReplies}
        onNew={openNew}
        onEdit={openEdit}
        onDelete={deleteQuickReply}
      />

      <QuickReplyFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onCreate={createQuickReply}
        onUpdate={updateQuickReply}
      />
    </>
  );
};

interface ManagerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quickReplies: QuickReply[];
  onNew: () => void;
  onEdit: (reply: QuickReply) => void;
  onDelete: (id: string) => Promise<boolean>;
}

const QuickRepliesManagerModal: React.FC<ManagerProps> = ({
  open, onOpenChange, quickReplies, onNew, onEdit, onDelete,
}) => {
  const [toDelete, setToDelete] = useState<QuickReply | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareText className="w-5 h-5 text-primary" />
              Gerenciar Respostas Prontas
            </DialogTitle>
          </DialogHeader>

          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={onNew}>
              <Plus className="w-4 h-4 mr-1" /> Nova resposta
            </Button>
          </div>

          <ScrollArea className="max-h-[55vh] pr-2">
            <div className="space-y-2">
              {quickReplies.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">
                  Nenhuma resposta pronta criada ainda.
                </p>
              ) : (
                quickReplies.map((reply) => (
                  <div
                    key={reply.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{reply.title}</span>
                        {reply.category && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">{reply.category}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3 mt-1">
                        {reply.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(reply)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setToDelete(reply)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir resposta pronta?</AlertDialogTitle>
            <AlertDialogDescription>
              A resposta "{toDelete?.title}" será removida para toda a equipe. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) await onDelete(toDelete.id);
                setToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

interface FormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: QuickReply | null;
  onCreate: (input: { title: string; content: string; category?: string | null; shortcut?: string | null }) => Promise<boolean>;
  onUpdate: (id: string, input: { title: string; content: string; category?: string | null; shortcut?: string | null }) => Promise<boolean>;
}

const QuickReplyFormModal: React.FC<FormProps> = ({ open, onOpenChange, editing, onCreate, onUpdate }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const contentRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open) {
      setTitle(editing?.title || '');
      setContent(editing?.content || '');
      setCategory(editing?.category || '');
    }
  }, [open, editing]);

  const insertVariable = (token: string) => {
    const el = contentRef.current;
    if (!el) {
      setContent((c) => c + token);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + token + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    const payload = { title, content, category };
    const ok = editing
      ? await onUpdate(editing.id, payload)
      : await onCreate(payload);
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar resposta pronta' : 'Nova resposta pronta'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="qr-title">Título</Label>
            <Input
              id="qr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Saudação inicial"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qr-category">Categoria (opcional)</Label>
            <Input
              id="qr-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex: Saudação, Cobrança, Dúvidas"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qr-content">Mensagem</Label>
            <Textarea
              id="qr-content"
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Digite a mensagem. Use variáveis como {nome} e {empresa}."
              rows={5}
              className="resize-none"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground w-full mb-0.5">Inserir variável:</span>
              {QUICK_REPLY_VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token)}
                  title={v.label}
                  className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono"
                >
                  {v.token}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-1" /> Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !title.trim() || !content.trim()}>
            {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar resposta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
