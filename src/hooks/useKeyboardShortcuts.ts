import { useEffect, useCallback } from 'react';

interface ShortcutHandlers {
  onNextConversation?: () => void;
  onPrevConversation?: () => void;
  onNextUnread?: () => void;
  onFocusSearch?: () => void;
  onFocusMessage?: () => void;
  onSetStatusNina?: () => void;
  onSetStatusHuman?: () => void;
  onSetStatusPaused?: () => void;
  onToggleInfo?: () => void;
  onCall?: () => void;
  onTemplate?: () => void;
  onArchive?: () => void;
  onShowHelp?: () => void;
}

export const useKeyboardShortcuts = (handlers: ShortcutHandlers, enabled = true) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const tagName = target.tagName;
    const isEditing = tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;

    // Allow Escape to blur inputs
    if (e.key === 'Escape') {
      if (isEditing) {
        target.blur();
      }
      return;
    }

    // Ignore shortcuts when typing in inputs (except specific ones)
    if (isEditing) {
      return;
    }

    // Ignore shortcuts when modifier keys are active (Ctrl, Cmd, Alt)
    // This allows Ctrl+C, Ctrl+V, Cmd+C, Cmd+V, etc. to work normally
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    // Prevent default for handled keys
    const handledKeys = ['j', 'k', 'n', '/', 'm', '1', '2', '3', 'i', 'c', 't', 'a', '?', 'ArrowDown', 'ArrowUp'];
    
    if (handledKeys.includes(e.key)) {
      e.preventDefault();
    }

    // Navigation
    if (e.key === 'j' || e.key === 'ArrowDown') {
      handlers.onNextConversation?.();
    }
    if (e.key === 'k' || e.key === 'ArrowUp') {
      handlers.onPrevConversation?.();
    }
    // Next unread - critical for high-volume operators
    if (e.key === 'n') {
      handlers.onNextUnread?.();
    }

    // Focus
    if (e.key === '/') {
      handlers.onFocusSearch?.();
    }
    if (e.key === 'm') {
      handlers.onFocusMessage?.();
    }

    // Status changes
    if (e.key === '1') {
      handlers.onSetStatusNina?.();
    }
    if (e.key === '2') {
      handlers.onSetStatusHuman?.();
    }
    if (e.key === '3') {
      handlers.onSetStatusPaused?.();
    }

    // Actions
    if (e.key === 'i') {
      handlers.onToggleInfo?.();
    }
    if (e.key === 'c') {
      handlers.onCall?.();
    }
    if (e.key === 't') {
      handlers.onTemplate?.();
    }
    if (e.key === 'a') {
      handlers.onArchive?.();
    }

    // Help
    if (e.key === '?') {
      handlers.onShowHelp?.();
    }
  }, [handlers]);

  useEffect(() => {
    if (!enabled) return;
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
};

export const shortcuts = [
  { key: 'J / ↓', action: 'Próxima conversa' },
  { key: 'K / ↑', action: 'Conversa anterior' },
  { key: '/', action: 'Buscar conversas' },
  { key: 'M', action: 'Escrever mensagem' },
  { key: '1', action: 'Ativar IA' },
  { key: '2', action: 'Assumir (Humano)' },
  { key: '3', action: 'Pausar conversa' },
  { key: 'I', action: 'Mostrar/ocultar info' },
  { key: 'C', action: 'Ligar para contato' },
  { key: 'T', action: 'Enviar template' },
  { key: 'A', action: 'Arquivar conversa' },
  { key: '?', action: 'Mostrar atalhos' },
  { key: 'Esc', action: 'Fechar/sair do input' },
];
