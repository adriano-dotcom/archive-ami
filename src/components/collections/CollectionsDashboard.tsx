import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, FileSpreadsheet, Upload, Send } from 'lucide-react';
import { CollectionOverview } from './CollectionOverview';
import { InstallmentsList } from './InstallmentsList';
import { ImportPanel } from './ImportPanel';
import { CollectionCampaigns } from './CollectionCampaigns';

export const CollectionsDashboard: React.FC = () => {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-950">
      {/* Header */}
      <div className="flex-shrink-0 p-6 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Cobrança</h1>
            <p className="text-sm text-slate-400">Gestão de inadimplência e parcelas vencidas</p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs defaultValue="dashboard" className="flex-1 flex flex-col overflow-hidden px-6">
        <TabsList className="flex-shrink-0 bg-slate-900/50 border border-white/5 p-1 rounded-xl">
          <TabsTrigger 
            value="dashboard" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/20 data-[state=active]:to-orange-500/10 data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/30 rounded-lg gap-2"
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger 
            value="installments"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/20 data-[state=active]:to-orange-500/10 data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/30 rounded-lg gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Parcelas
          </TabsTrigger>
          <TabsTrigger 
            value="import"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/20 data-[state=active]:to-orange-500/10 data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/30 rounded-lg gap-2"
          >
            <Upload className="w-4 h-4" />
            Importar
          </TabsTrigger>
          <TabsTrigger 
            value="campaigns"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/20 data-[state=active]:to-orange-500/10 data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/30 rounded-lg gap-2"
          >
            <Send className="w-4 h-4" />
            Campanhas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="flex-1 overflow-auto mt-4">
          <CollectionOverview />
        </TabsContent>

        <TabsContent value="installments" className="flex-1 overflow-auto mt-4">
          <InstallmentsList />
        </TabsContent>

        <TabsContent value="import" className="flex-1 overflow-auto mt-4">
          <ImportPanel />
        </TabsContent>

        <TabsContent value="campaigns" className="flex-1 overflow-auto mt-4">
          <CollectionCampaigns />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CollectionsDashboard;
