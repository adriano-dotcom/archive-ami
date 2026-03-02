import React, { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert, Loader2, Lock, Unlock, RefreshCw } from 'lucide-react';
import { Button } from '../Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as Collapsible from '@radix-ui/react-collapsible';

interface SecretStatus {
  name: string;
  label: string;
  inVault: boolean;
  inTable: boolean;
}

const SECRET_LABELS: Record<string, string> = {
  whatsapp_access_token: 'WhatsApp Access Token',
  elevenlabs_api_key: 'ElevenLabs API Key',
  
  api4com_api_token: 'API4Com Token',
  calcom_api_key: 'Cal.com API Key',
  openai_api_key: 'OpenAI API Key',
};

export const VaultMigrationPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [secretsStatus, setSecretsStatus] = useState<SecretStatus[]>([]);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migratingSecret, setMigratingSecret] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && secretsStatus.length === 0) {
      checkSecretsStatus();
    }
  }, [isOpen]);

  const checkSecretsStatus = async () => {
    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-secrets', {
        body: { action: 'check' }
      });

      if (error) throw error;

      if (data?.secrets) {
        const statuses: SecretStatus[] = Object.entries(data.secrets).map(([name, status]: [string, any]) => ({
          name,
          label: SECRET_LABELS[name] || name,
          inVault: status.inVault,
          inTable: status.inTable,
        }));
        setSecretsStatus(statuses);
      }
    } catch (error) {
      console.error('Error checking secrets status:', error);
      toast.error('Erro ao verificar status dos secrets');
    } finally {
      setCheckingStatus(false);
    }
  };

  const migrateAllSecrets = async () => {
    setMigrating(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-secrets', {
        body: { action: 'migrate' }
      });

      if (error) throw error;

      if (data?.migrated && data.migrated.length > 0) {
        toast.success(`${data.migrated.length} secrets migrados para o Vault!`);
        await checkSecretsStatus();
      } else {
        toast.info('Nenhum secret para migrar');
      }
    } catch (error) {
      console.error('Error migrating secrets:', error);
      toast.error('Erro ao migrar secrets');
    } finally {
      setMigrating(false);
    }
  };

  const getStatusInfo = (secret: SecretStatus) => {
    if (secret.inVault) {
      return {
        icon: <ShieldCheck className="w-4 h-4 text-green-500" />,
        text: 'No Vault',
        textClass: 'text-green-600',
        bgClass: 'bg-green-500/10',
      };
    }
    if (secret.inTable) {
      return {
        icon: <ShieldAlert className="w-4 h-4 text-amber-500" />,
        text: 'Texto plano',
        textClass: 'text-amber-600',
        bgClass: 'bg-amber-500/10',
      };
    }
    return {
      icon: <Shield className="w-4 h-4 text-muted-foreground/50" />,
      text: 'Não configurado',
      textClass: 'text-muted-foreground',
      bgClass: 'bg-muted/30',
    };
  };

  const secretsInTable = secretsStatus.filter(s => s.inTable && !s.inVault);
  const secretsInVault = secretsStatus.filter(s => s.inVault);
  const allMigrated = secretsInTable.length === 0 && secretsInVault.length > 0;

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <Collapsible.Trigger asChild>
        <button className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:bg-accent/5 transition-colors mb-6">
          <div className="flex items-center gap-3">
            {allMigrated ? (
              <ShieldCheck className="w-5 h-5 text-green-500" />
            ) : secretsInTable.length > 0 ? (
              <ShieldAlert className="w-5 h-5 text-amber-500" />
            ) : (
              <Shield className="w-5 h-5 text-muted-foreground" />
            )}
            <div className="text-left">
              <h3 className="font-medium text-foreground">Segurança de API Keys</h3>
              <p className="text-sm text-muted-foreground">
                {allMigrated 
                  ? 'Todos os secrets estão protegidos no Vault' 
                  : secretsInTable.length > 0
                    ? `${secretsInTable.length} secret(s) em texto plano - migre para o Vault`
                    : 'Gerencie a segurança das suas API keys'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {secretsInTable.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/20 text-amber-600">
                {secretsInTable.length} inseguro(s)
              </span>
            )}
            <svg
              className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content className="mb-6">
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-muted/30 px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Status dos Secrets</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={checkSecretsStatus}
              disabled={checkingStatus}
              className="h-8 px-2"
            >
              <RefreshCw className={`w-4 h-4 ${checkingStatus ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Table */}
          <div className="divide-y divide-border">
            {checkingStatus && secretsStatus.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Verificando...</span>
              </div>
            ) : secretsStatus.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhum secret encontrado
              </div>
            ) : (
              secretsStatus.map((secret) => {
                const statusInfo = getStatusInfo(secret);
                return (
                  <div
                    key={secret.name}
                    className="flex items-center justify-between px-4 py-3 hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {secret.inVault ? (
                        <Lock className="w-4 h-4 text-green-500" />
                      ) : secret.inTable ? (
                        <Unlock className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Shield className="w-4 h-4 text-muted-foreground/40" />
                      )}
                      <span className="text-sm font-medium text-foreground">{secret.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.bgClass} ${statusInfo.textClass}`}>
                        {statusInfo.icon}
                        {statusInfo.text}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Actions */}
          {secretsInTable.length > 0 && (
            <div className="bg-muted/20 px-4 py-3 border-t border-border">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground max-w-md">
                  <strong>Atenção:</strong> Secrets em texto plano ficam expostos no banco de dados. 
                  Migre para o Vault para criptografar e proteger suas API keys.
                </p>
                <Button
                  onClick={migrateAllSecrets}
                  disabled={migrating}
                  className="bg-primary hover:bg-primary/90"
                >
                  {migrating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Migrando...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Migrar Todos para Vault
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Success state */}
          {allMigrated && (
            <div className="bg-green-500/10 px-4 py-3 border-t border-green-500/20">
              <div className="flex items-center gap-2 text-green-600">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-sm font-medium">Todos os secrets estão protegidos no Vault</span>
              </div>
            </div>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
