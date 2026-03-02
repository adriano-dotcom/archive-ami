import React, { useState, useEffect } from 'react';
import { Bell, Volume2, VolumeX, Receipt, DollarSign } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { playNotificationSound, isNotificationSoundEnabled, setNotificationSoundEnabled } from '@/utils/notificationSound';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const GeneralSettings: React.FC = () => {
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Collection email settings
  const [collectionEmailFrom, setCollectionEmailFrom] = useState('');
  const [collectionEmailBcc, setCollectionEmailBcc] = useState('');
  const [savingCollectionEmail, setSavingCollectionEmail] = useState(false);

  // Message cost settings
  const [messageCostPerUnit, setMessageCostPerUnit] = useState<string>('0,41');
  const [savingMessageCost, setSavingMessageCost] = useState(false);

  useEffect(() => {
    setSoundEnabled(isNotificationSoundEnabled());
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('nina_settings')
      .select('collection_email_from, collection_email_bcc, message_cost_per_unit')
      .maybeSingle();
    
    if (data?.collection_email_from) {
      setCollectionEmailFrom(data.collection_email_from);
    }
    if (data?.collection_email_bcc) {
      setCollectionEmailBcc((data.collection_email_bcc as string[]).join(', '));
    }
    if (data?.message_cost_per_unit !== null && data?.message_cost_per_unit !== undefined) {
      setMessageCostPerUnit(String(data.message_cost_per_unit).replace('.', ','));
    }
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    setNotificationSoundEnabled(enabled);
    
    if (enabled) {
      playNotificationSound();
      toast.success('Som de notificação ativado');
    } else {
      toast.info('Som de notificação desativado');
    }
  };

  const handleTestSound = () => {
    if (soundEnabled) {
      playNotificationSound();
    }
  };

  const handleSaveCollectionEmailSettings = async () => {
    setSavingCollectionEmail(true);
    try {
      const bccArray = collectionEmailBcc
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);
      
      const { error } = await supabase
        .from('nina_settings')
        .update({
          collection_email_from: collectionEmailFrom || null,
          collection_email_bcc: bccArray.length > 0 ? bccArray : null
        })
        .not('id', 'is', null);
      
      if (error) throw error;
      toast.success('Configurações de email de cobrança salvas');
    } catch (error) {
      console.error('Error saving collection email settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSavingCollectionEmail(false);
    }
  };

  const handleSaveMessageCost = async () => {
    setSavingMessageCost(true);
    try {
      const cost = parseFloat(messageCostPerUnit.replace(',', '.'));
      if (isNaN(cost) || cost < 0) {
        toast.error('Valor inválido');
        setSavingMessageCost(false);
        return;
      }
      
      const { error } = await supabase
        .from('nina_settings')
        .update({ message_cost_per_unit: cost })
        .not('id', 'is', null);
      
      if (error) throw error;
      toast.success('Custo por mensagem salvo');
    } catch (error) {
      console.error('Error saving message cost:', error);
      toast.error('Erro ao salvar custo');
    } finally {
      setSavingMessageCost(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notificações */}
      <div className="bg-card/50 border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Notificações
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50">
            <div className="flex items-center gap-3">
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-primary" />
              ) : (
                <VolumeX className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <Label htmlFor="notification-sound" className="text-sm font-medium text-foreground cursor-pointer">
                  Som de notificação
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tocar som ao receber novas mensagens de clientes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {soundEnabled && (
                <button
                  onClick={handleTestSound}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Testar
                </button>
              )}
              <Switch
                id="notification-sound"
                checked={soundEnabled}
                onCheckedChange={handleSoundToggle}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Configurações de Email de Cobrança */}
      <div className="bg-card/50 border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-orange-400" />
          Configurações de Email de Cobrança
        </h3>
        
        <div className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
            <Label className="text-sm font-medium text-foreground mb-2 block">
              Remetente (From)
            </Label>
            <Input
              placeholder="cobranca@empresa.com"
              value={collectionEmailFrom}
              onChange={(e) => setCollectionEmailFrom(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Email que aparecerá como remetente nas cobranças
            </p>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
            <Label className="text-sm font-medium text-foreground mb-2 block">
              Cópia Oculta (BCC)
            </Label>
            <Input
              placeholder="financeiro@empresa.com, gerente@empresa.com"
              value={collectionEmailBcc}
              onChange={(e) => setCollectionEmailBcc(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Separar múltiplos emails por vírgula
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveCollectionEmailSettings}
              disabled={savingCollectionEmail}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {savingCollectionEmail ? 'Salvando...' : 'Salvar Configurações de Cobrança'}
            </Button>
          </div>
        </div>
      </div>

      {/* Custo de Mensagens */}
      <div className="bg-card/50 border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-400" />
          Custo de Mensagens
        </h3>
        
        <div className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
            <Label className="text-sm font-medium text-foreground mb-2 block">
              Custo por Mensagem (R$)
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">R$</span>
              <Input
                type="text"
                placeholder="0,41"
                value={messageCostPerUnit}
                onChange={(e) => setMessageCostPerUnit(e.target.value)}
                className="w-32"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Custo por mensagem WhatsApp Template (cobrado pela Meta)
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveMessageCost}
              disabled={savingMessageCost}
              className="bg-green-600 hover:bg-green-700"
            >
              {savingMessageCost ? 'Salvando...' : 'Salvar Custo'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
