import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles, Loader2, Search, Video, Image as ImageIcon, FileText, Music, Send, Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MediaItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  media_type: 'video' | 'image' | 'document' | 'audio' | string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  thumbnail_url: string | null;
  send_count: number;
  is_active: boolean;
}

interface Props {
  disabled?: boolean;
  sending?: boolean;
  onSend: (item: MediaItem) => Promise<void> | void;
}

const CATEGORY_LABELS: Record<string, string> = {
  geral: 'Geral',
  orbita_plus: 'Órbita Plus',
  orbita_total: 'Órbita Total',
  orbita_galaxia: 'Órbita Galáxia',
  comparativo: 'Comparativo',
  reembolso: 'Reembolso',
  onboarding: 'Onboarding',
  objecao: 'Objeções',
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  video: <Video className="w-4 h-4" />,
  image: <ImageIcon className="w-4 h-4" />,
  document: <FileText className="w-4 h-4" />,
  audio: <Music className="w-4 h-4" />,
};

const formatBytes = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MediaLibraryPicker: React.FC<Props> = ({ disabled, sending, onSend }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('media_library')
      .select('id, name, description, category, media_type, file_url, file_size, mime_type, thumbnail_url, send_count, is_active')
      .eq('is_active', true)
      .order('send_count', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[MediaLibraryPicker] erro ao carregar:', error);
      toast.error('Erro ao carregar biblioteca');
    } else {
      setItems((data as MediaItem[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && items.length === 0) fetchItems();
  }, [open, items.length, fetchItems]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.category));
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (activeCategory !== 'all' && i.category !== activeCategory) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q)
      );
    });
  }, [items, search, activeCategory]);

  const handleSend = async (item: MediaItem) => {
    setSendingId(item.id);
    try {
      await onSend(item);
      setOpen(false);
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary hover:bg-accent rounded-full transition-colors"
          disabled={disabled || sending}
          title="Biblioteca de mídia"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start" side="top">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Biblioteca de mídia</span>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar vídeo, imagem ou documento..."
              className="pl-8 h-9 text-sm"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full border transition-colors',
                  activeCategory === 'all'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent border-border text-muted-foreground hover:text-foreground'
                )}
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCategory(c)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border transition-colors',
                    activeCategory === c
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {CATEGORY_LABELS[c] || c}
                </button>
              ))}
            </div>
          )}
        </div>

        <ScrollArea className="h-[340px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 px-4 text-sm text-muted-foreground">
              {items.length === 0 ? (
                <>
                  Nenhuma mídia ativa.
                  <p className="text-xs mt-1">Adicione vídeos em Configurações → Biblioteca de Mídia.</p>
                </>
              ) : (
                'Nada encontrado com esse filtro.'
              )}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 transition-colors group"
                >
                  <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0 relative">
                    {item.media_type === 'image' ? (
                      <img src={item.file_url} alt="" className="w-full h-full object-cover" />
                    ) : item.media_type === 'video' && item.thumbnail_url ? (
                      <>
                        <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        <Play className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow" />
                      </>
                    ) : (
                      <div className="text-muted-foreground">
                        {TYPE_ICON[item.media_type] || <FileText className="w-4 h-4" />}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {formatBytes(item.file_size)}
                      </span>
                      {item.send_count > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          • {item.send_count} envios
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="opacity-60 group-hover:opacity-100 gap-1"
                    onClick={() => handleSend(item)}
                    disabled={sendingId === item.id}
                  >
                    {sendingId === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Enviar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default MediaLibraryPicker;
