import React, { useState, useEffect, useRef } from 'react';
import { Building2, Search, Plus, Check, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Company {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  city: string | null;
  state: string | null;
}

interface CompanySelectorProps {
  value: string | null;
  onChange: (companyId: string | null, company: Company | null) => void;
  className?: string;
  disabled?: boolean;
}

const formatCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
};

export const CompanySelector: React.FC<CompanySelectorProps> = ({
  value,
  onChange,
  className,
  disabled = false
}) => {
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load companies on mount
  useEffect(() => {
    loadCompanies();
  }, []);

  // Load selected company if value is set
  useEffect(() => {
    if (value && companies.length > 0) {
      const company = companies.find(c => c.id === value);
      if (company) {
        setSelectedCompany(company);
      }
    } else if (!value) {
      setSelectedCompany(null);
    }
  }, [value, companies]);

  // Filter companies based on search
  useEffect(() => {
    if (!search) {
      setFilteredCompanies(companies.slice(0, 10));
    } else {
      const searchLower = search.toLowerCase();
      const filtered = companies.filter(c =>
        c.razao_social.toLowerCase().includes(searchLower) ||
        c.nome_fantasia?.toLowerCase().includes(searchLower) ||
        c.cnpj.includes(search.replace(/\D/g, ''))
      );
      setFilteredCompanies(filtered.slice(0, 10));
    }
  }, [search, companies]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, cnpj, razao_social, nome_fantasia, city, state')
        .order('razao_social');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error loading companies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (company: Company) => {
    setSelectedCompany(company);
    onChange(company.id, company);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = () => {
    setSelectedCompany(null);
    onChange(null, null);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Label className="text-slate-300 mb-2 block">Empresa Vinculada</Label>
      
      {selectedCompany ? (
        <div className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-800 rounded-md">
          <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-200 truncate">{selectedCompany.razao_social}</p>
            <p className="text-xs text-slate-500">{formatCNPJ(selectedCompany.cnpj)}</p>
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 w-6 p-0 text-slate-500 hover:text-red-400"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Buscar empresa por nome ou CNPJ..."
            className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
            disabled={disabled}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 animate-spin" />
          )}
        </div>
      )}

      {/* Dropdown */}
      {isOpen && !selectedCompany && (
        <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {filteredCompanies.length === 0 ? (
            <div className="p-3 text-center text-slate-500 text-sm">
              {search ? 'Nenhuma empresa encontrada' : 'Digite para buscar...'}
            </div>
          ) : (
            filteredCompanies.map((company) => (
              <button
                key={company.id}
                type="button"
                onClick={() => handleSelect(company)}
                className="w-full flex items-center gap-3 p-3 hover:bg-slate-800 transition-colors text-left"
              >
                <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {company.nome_fantasia || company.razao_social}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatCNPJ(company.cnpj)}
                    {company.city && ` • ${company.city}/${company.state}`}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
