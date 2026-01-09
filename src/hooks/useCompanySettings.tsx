import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CompanySettings {
  companyName: string;
  sdrName: string;
  loading: boolean;
  refetch: () => Promise<void>;
}

const CompanySettingsContext = createContext<CompanySettings | undefined>(undefined);

export const CompanySettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companyName, setCompanyName] = useState('Viver de IA');
  const [sdrName, setSdrName] = useState('Nina');
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('nina_settings')
        .select('company_name, sdr_name')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // Se não existe registro, criar um padrão automaticamente
      if (!data) {
        console.log('[useCompanySettings] No settings found, creating default...');
        const { data: newData, error: insertError } = await supabase
          .from('nina_settings')
          .insert({
            company_name: 'Sua Empresa',
            sdr_name: 'Agente'
          })
          .select('company_name, sdr_name')
          .single();

        if (insertError) {
          console.error('[useCompanySettings] Error creating default settings:', insertError);
        } else if (newData) {
          setCompanyName(newData.company_name || 'Sua Empresa');
          setSdrName(newData.sdr_name || 'Agente');
        }
      } else {
        setCompanyName(data.company_name || 'Sua Empresa');
        setSdrName(data.sdr_name || 'Agente');
      }
    } catch (error) {
      console.error('[useCompanySettings] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const value: CompanySettings = {
    companyName,
    sdrName,
    loading,
    refetch: fetchSettings,
  };

  return (
    <CompanySettingsContext.Provider value={value}>
      {children}
    </CompanySettingsContext.Provider>
  );
};

export const useCompanySettings = () => {
  const context = useContext(CompanySettingsContext);
  if (context === undefined) {
    throw new Error('useCompanySettings must be used within a CompanySettingsProvider');
  }
  return context;
};
