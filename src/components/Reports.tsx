import React from 'react';
import { BarChart3 } from 'lucide-react';

const Reports: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-full w-full bg-background">
      <div className="text-center space-y-4">
        <BarChart3 className="w-16 h-16 text-primary mx-auto opacity-30" />
        <h2 className="text-2xl font-bold text-foreground">Relatórios</h2>
        <p className="text-muted-foreground">Em breve — Conversões, atendimento, retenção e receita 🐾</p>
      </div>
    </div>
  );
};

export default Reports;
