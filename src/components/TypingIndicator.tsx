import React from 'react';
import { Bot } from 'lucide-react';

interface TypingIndicatorProps {
  agentName: string;
  isAggregating?: boolean;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ 
  agentName, 
  isAggregating = false 
}) => {
  return (
    <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col max-w-[75%] items-start">
        <div className="px-5 py-3 rounded-2xl rounded-tl-sm bg-muted border border-border shadow-md">
          <div className="flex items-center gap-3">
            <Bot className="w-4 h-4 text-violet-400 flex-shrink-0" />
            <div className="flex items-center gap-1.5">
              <span className="typing-dot w-2 h-2 rounded-full bg-violet-400" style={{ animationDelay: '0ms' }} />
              <span className="typing-dot w-2 h-2 rounded-full bg-violet-400" style={{ animationDelay: '200ms' }} />
              <span className="typing-dot w-2 h-2 rounded-full bg-violet-400" style={{ animationDelay: '400ms' }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {isAggregating 
              ? 'Coletando mensagens...' 
              : `${agentName} está digitando...`
            }
          </p>
        </div>
      </div>
    </div>
  );
};
