import { Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface QueueItem {
  id: string;
  contact_name: string | null;
  message_type: string;
  status: string;
  created_at: string;
  error_message: string | null;
}

interface SendQueueTableProps {
  items: QueueItem[];
  isLoading?: boolean;
}

const typeLabels: Record<string, string> = {
  text: 'Texto',
  image: 'Imagem',
  audio: 'Áudio',
  document: 'Documento',
  video: 'Vídeo',
  template: 'Template',
};

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'completed':
      return {
        icon: CheckCircle2,
        label: 'Enviado',
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
      };
    case 'failed':
      return {
        icon: XCircle,
        label: 'Falhou',
        className: 'bg-red-500/20 text-red-400 border-red-500/30',
      };
    case 'processing':
      return {
        icon: Loader2,
        label: 'Enviando',
        className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      };
    case 'pending':
    default:
      return {
        icon: Clock,
        label: 'Pendente',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      };
  }
};

export function SendQueueTable({ items, isLoading }: SendQueueTableProps) {
  if (isLoading) {
    return (
      <div className="h-[400px] animate-pulse rounded-lg bg-muted/20" />
    );
  }

  return (
    <div className="rounded-xl border border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Fila de Envio</h3>
        <span className="text-xs text-muted-foreground">Últimas 50 mensagens</span>
      </div>

      <ScrollArea className="h-[350px]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground">Contato</TableHead>
              <TableHead className="text-muted-foreground">Tipo</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Horário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhuma mensagem na fila
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const statusConfig = getStatusConfig(item.status);
                const StatusIcon = statusConfig.icon;

                return (
                  <TableRow key={item.id} className="hover:bg-muted/5">
                    <TableCell className="font-medium">
                      {item.contact_name || 'Desconhecido'}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {typeLabels[item.message_type] || item.message_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('gap-1', statusConfig.className)}
                      >
                        <StatusIcon
                          className={cn(
                            'h-3 w-3',
                            item.status === 'processing' && 'animate-spin'
                          )}
                        />
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(item.created_at), 'HH:mm:ss', { locale: ptBR })}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
