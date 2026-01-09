import { AlertCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ErrorItem {
  id: string;
  created_at: string;
  error_message: string;
  contact_name?: string;
}

interface RecentErrorsListProps {
  errors: ErrorItem[];
  isLoading?: boolean;
}

export function RecentErrorsList({ errors, isLoading }: RecentErrorsListProps) {
  if (isLoading) {
    return (
      <div className="h-[300px] animate-pulse rounded-lg bg-muted/20" />
    );
  }

  return (
    <div className="rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/10 to-rose-500/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Erros Recentes</h3>
        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
          {errors.length} erros
        </span>
      </div>

      {errors.length === 0 ? (
        <div className="flex h-[250px] flex-col items-center justify-center text-muted-foreground">
          <AlertCircle className="mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">Nenhum erro recente</p>
        </div>
      ) : (
        <ScrollArea className="h-[250px]">
          <div className="space-y-2 pr-4">
            {errors.map((error) => (
              <div
                key={error.id}
                className="rounded-lg bg-red-500/10 p-3 transition-colors hover:bg-red-500/15"
              >
                <div className="mb-1 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-xs text-muted-foreground">
                    {error.contact_name || 'Contato desconhecido'}
                  </span>
                </div>
                <p className="mb-2 line-clamp-2 text-sm text-foreground">
                  {error.error_message || 'Erro desconhecido'}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {format(new Date(error.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
