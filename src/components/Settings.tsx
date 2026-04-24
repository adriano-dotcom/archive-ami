import React, { useRef, useState } from 'react';
import { Shield, Plug, Loader2, Save, Users, Mail, Settings2, MessageSquare, Zap, Brain, Stethoscope, BookOpen, FolderOpen } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import ApiSettings, { ApiSettingsRef } from './settings/ApiSettings';
import AgentsSettings, { AgentsSettingsRef } from './settings/AgentsSettings';
import EmailTemplatesSettings from './settings/EmailTemplatesSettings';
import WhatsAppTemplatesSettings from './settings/WhatsAppTemplatesSettings';
import FollowupAutomationsSettings from './settings/FollowupAutomationsSettings';

import GeneralSettings from './settings/GeneralSettings';
import SalesCoachingSettings from './settings/SalesCoachingSettings';
import WhatsAppDiagnosticPanel from './settings/WhatsAppDiagnosticPanel';
import ProductKnowledgeSettings from './settings/ProductKnowledgeSettings';
import MediaLibrarySettings from './settings/MediaLibrarySettings';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { Button } from './Button';

const Settings: React.FC = () => {
  const { companyName } = useCompanySettings();
  const apiRef = useRef<ApiSettingsRef>(null);
  const agentsRef = useRef<AgentsSettingsRef>(null);
  
  const [activeTab, setActiveTab] = useState('general');

  const handleSave = async () => {
    if (activeTab === 'apis') {
      await apiRef.current?.save();
    } else if (activeTab === 'agents') {
      await agentsRef.current?.save();
    }
  };

  const handleCancel = () => {
    if (activeTab === 'apis') {
      apiRef.current?.cancel();
    } else if (activeTab === 'agents') {
      agentsRef.current?.cancel();
    }
  };

  const isSaving = activeTab === 'apis'
    ? apiRef.current?.isSaving
    : activeTab === 'agents'
    ? agentsRef.current?.isSaving
    : false;

  const showSaveButtons = activeTab !== 'templates' && activeTab !== 'whatsapp-templates' && activeTab !== 'automations' && activeTab !== 'general' && activeTab !== 'coaching' && activeTab !== 'diagnostic' && activeTab !== 'products' && activeTab !== 'media';
  
  return (
    <div className="p-8 max-w-5xl mx-auto h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Configurações</h2>
          <p className="text-sm text-muted-foreground mt-1">Central de controle da sua instância {companyName}.</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-xs rounded-full font-mono flex items-center">
            <Shield className="w-3 h-3 mr-1" /> Ambiente Seguro
          </span>
        </div>
      </div>

      <Tabs defaultValue="agents" className="w-full" onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-8">
          <TabsList>
            <TabsTrigger value="general" className="gap-2">
              <Settings2 className="w-4 h-4" />
              Geral
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-2">
              <Users className="w-4 h-4" />
              Agentes
            </TabsTrigger>
            <TabsTrigger value="apis" className="gap-2">
              <Plug className="w-4 h-4" />
              APIs
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <Mail className="w-4 h-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="whatsapp-templates" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="automations" className="gap-2">
              <Zap className="w-4 h-4" />
              Automações
            </TabsTrigger>
            <TabsTrigger value="coaching" className="gap-2">
              <Brain className="w-4 h-4" />
              Coaching
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Produtos
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              Mídia
            </TabsTrigger>
            <TabsTrigger value="diagnostic" className="gap-2">
              <Stethoscope className="w-4 h-4" />
              Diagnóstico
            </TabsTrigger>
          </TabsList>

          {showSaveButtons && (
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={isSaving}
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>

        <TabsContent value="agents">
          <AgentsSettings ref={agentsRef} />
        </TabsContent>

        <TabsContent value="apis">
          <ApiSettings ref={apiRef} />
        </TabsContent>

        <TabsContent value="templates">
          <EmailTemplatesSettings />
        </TabsContent>

        <TabsContent value="whatsapp-templates">
          <WhatsAppTemplatesSettings />
        </TabsContent>

        <TabsContent value="automations">
          <FollowupAutomationsSettings />
        </TabsContent>


        <TabsContent value="coaching">
          <SalesCoachingSettings />
        </TabsContent>

        <TabsContent value="products">
          <ProductKnowledgeSettings />
        </TabsContent>

        <TabsContent value="media">
          <MediaLibrarySettings />
        </TabsContent>

        <TabsContent value="diagnostic">
          <WhatsAppDiagnosticPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
