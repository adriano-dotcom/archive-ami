import React from 'react';
import { GitBranch } from 'lucide-react';

const BotFlows: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-full w-full bg-background">
      <div className="text-center space-y-4">
        <GitBranch className="w-16 h-16 text-primary mx-auto opacity-30" />
        <h2 className="text-2xl font-bold text-foreground">Fluxos do Bot</h2>
        <p className="text-muted-foreground">Em breve — Visualização dos fluxos automáticos 🐾</p>
      </div>
    </div>
  );
};

export default BotFlows;
