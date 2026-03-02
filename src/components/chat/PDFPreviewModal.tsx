import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X, Loader2, FileText, ExternalLink } from 'lucide-react';

interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
  filename: string;
}

export const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({
  isOpen,
  onClose,
  pdfUrl,
  filename
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  // Reset states when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setHasError(false);
    }
  }, [isOpen, pdfUrl]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 bg-card border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-red-500/20 p-2 rounded-lg shrink-0">
              <FileText className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-sm font-medium text-foreground truncate" title={filename}>
              {filename}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground border-border hover:bg-accent"
              asChild
            >
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                Abrir em nova aba
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground border-border hover:bg-accent"
              asChild
            >
              <a href={pdfUrl} download={filename}>
                <Download className="w-4 h-4 mr-2" />
                Baixar
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-accent"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* PDF Content */}
        <div className="flex-1 relative overflow-hidden bg-background">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">Carregando PDF...</span>
              </div>
            </div>
          )}

          {hasError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background">
              <FileText className="w-16 h-16 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-sm mb-2">Não foi possível carregar o preview</p>
              <p className="text-muted-foreground/70 text-xs mb-4">Seu navegador pode não suportar visualização de PDF inline</p>
              <Button variant="outline" asChild>
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir em nova aba
                </a>
              </Button>
            </div>
          ) : (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title={`Preview: ${filename}`}
              onLoad={handleLoad}
              onError={handleError}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
