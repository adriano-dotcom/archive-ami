import React from 'react';
import { Filter } from 'lucide-react';

const SalesFunnel: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-full w-full bg-background">
      <div className="text-center space-y-4">
        <Filter className="w-16 h-16 text-primary mx-auto opacity-30" />
        <h2 className="text-2xl font-bold text-foreground">Funil de Vendas</h2>
        <p className="text-muted-foreground">Em breve — Kanban com estágios de conversão 🐾</p>
      </div>
    </div>
  );
};

export default SalesFunnel;
