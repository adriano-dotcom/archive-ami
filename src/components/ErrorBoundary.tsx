import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
}

/**
 * Error Boundary para capturar erros React e exibir fallback
 * Previne que erros em componentes quebrem toda a aplicação
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    // Aqui você pode enviar para serviços de monitoramento (Sentry, etc.)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div 
          className="flex items-center justify-center h-screen bg-background"
          role="alert"
          aria-live="assertive"
        >
          <div className="text-center p-8 bg-card rounded-xl border border-destructive/30 max-w-md">
            <h1 className="text-xl font-semibold text-destructive mb-2">
              Algo deu errado
            </h1>
            <p className="text-muted-foreground mb-4 text-sm">
              {this.state.error?.message || 'Ocorreu um erro inesperado na aplicação.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
              aria-label="Recarregar página para tentar novamente"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
