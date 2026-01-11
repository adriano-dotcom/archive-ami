import React, { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, Save, Loader2, UserCog, Phone, Mail } from 'lucide-react';
import { Button } from './Button';
import { api } from '../services/api';
import { Team, TeamFunction } from '../types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TeamConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

interface Seller {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
}

type TabType = 'teams' | 'functions' | 'sellers';

const TeamConfigModal: React.FC<TeamConfigModalProps> = ({ isOpen, onClose, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<TabType>('teams');
  const [teams, setTeams] = useState<Team[]>([]);
  const [functions, setFunctions] = useState<TeamFunction[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', color: '#3b82f6', email: '', phone: '' });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
      setupRealtime();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [teamsData, functionsData, sellersData] = await Promise.all([
        api.fetchTeams(),
        api.fetchTeamFunctions(),
        api.fetchSellers()
      ]);
      setTeams(teamsData);
      setFunctions(functionsData);
      setSellers(sellersData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtime = () => {
    const teamsChannel = supabase
      .channel('teams-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        loadData();
      })
      .subscribe();

    const functionsChannel = supabase
      .channel('functions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_functions' }, () => {
        loadData();
      })
      .subscribe();

    const sellersChannel = supabase
      .channel('sellers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sellers' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(teamsChannel);
      supabase.removeChannel(functionsChannel);
      supabase.removeChannel(sellersChannel);
    };
  };

  const handleCreateTeam = async () => {
    if (!editForm.name.trim()) return;
    try {
      await api.createTeam({
        name: editForm.name,
        description: editForm.description,
        color: editForm.color
      });
      resetForm();
      setIsCreating(false);
      onUpdate();
    } catch (error) {
      console.error('Error creating team:', error);
    }
  };

  const handleCreateFunction = async () => {
    if (!editForm.name.trim()) return;
    try {
      await api.createTeamFunction({
        name: editForm.name,
        description: editForm.description
      });
      resetForm();
      setIsCreating(false);
      onUpdate();
    } catch (error) {
      console.error('Error creating function:', error);
    }
  };

  const handleCreateSeller = async () => {
    if (!editForm.name.trim() || !editForm.email.trim()) {
      toast.error('Nome e email são obrigatórios');
      return;
    }
    try {
      await api.createSeller({
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone || undefined
      });
      toast.success('Vendedor criado com sucesso!');
      resetForm();
      setIsCreating(false);
      onUpdate();
    } catch (error: any) {
      console.error('Error creating seller:', error);
      toast.error('Erro ao criar vendedor');
    }
  };

  const handleUpdateTeam = async (id: string) => {
    try {
      await api.updateTeam(id, {
        name: editForm.name,
        description: editForm.description,
        color: editForm.color
      });
      setEditingId(null);
      resetForm();
      onUpdate();
    } catch (error) {
      console.error('Error updating team:', error);
    }
  };

  const handleUpdateFunction = async (id: string) => {
    try {
      await api.updateTeamFunction(id, {
        name: editForm.name,
        description: editForm.description
      });
      setEditingId(null);
      resetForm();
      onUpdate();
    } catch (error) {
      console.error('Error updating function:', error);
    }
  };

  const handleUpdateSeller = async (id: string) => {
    if (!editForm.name.trim() || !editForm.email.trim()) {
      toast.error('Nome e email são obrigatórios');
      return;
    }
    try {
      await api.updateSeller(id, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone || undefined
      });
      toast.success('Vendedor atualizado!');
      setEditingId(null);
      resetForm();
      onUpdate();
    } catch (error) {
      console.error('Error updating seller:', error);
      toast.error('Erro ao atualizar vendedor');
    }
  };

  const handleDeleteTeam = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este time?')) return;
    try {
      await api.deleteTeam(id);
      onUpdate();
    } catch (error) {
      console.error('Error deleting team:', error);
    }
  };

  const handleDeleteFunction = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta função?')) return;
    try {
      await api.deleteTeamFunction(id);
      onUpdate();
    } catch (error) {
      console.error('Error deleting function:', error);
    }
  };

  const handleDeleteSeller = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este vendedor?')) return;
    try {
      await api.deleteSeller(id);
      toast.success('Vendedor excluído!');
      onUpdate();
    } catch (error) {
      console.error('Error deleting seller:', error);
      toast.error('Erro ao excluir vendedor');
    }
  };

  const resetForm = () => {
    setEditForm({ name: '', description: '', color: '#3b82f6', email: '', phone: '' });
  };

  const startEdit = (item: Team | TeamFunction | Seller, type: 'team' | 'function' | 'seller') => {
    setEditingId(item.id);
    if (type === 'seller') {
      const seller = item as Seller;
      setEditForm({
        name: seller.name,
        email: seller.email,
        phone: seller.phone || '',
        description: '',
        color: '#3b82f6'
      });
    } else {
      setEditForm({
        name: item.name,
        description: (item as Team | TeamFunction).description || '',
        color: type === 'team' ? (item as Team).color : '#3b82f6',
        email: '',
        phone: ''
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">⚙️ Configurar Equipe</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => { setActiveTab('teams'); setIsCreating(false); setEditingId(null); resetForm(); }}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'teams'
                ? 'text-white border-b-2 border-cyan-500 bg-slate-800/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🏢 Times
          </button>
          <button
            onClick={() => { setActiveTab('functions'); setIsCreating(false); setEditingId(null); resetForm(); }}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'functions'
                ? 'text-white border-b-2 border-cyan-500 bg-slate-800/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            💼 Funções
          </button>
          <button
            onClick={() => { setActiveTab('sellers'); setIsCreating(false); setEditingId(null); resetForm(); }}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'sellers'
                ? 'text-white border-b-2 border-cyan-500 bg-slate-800/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCog className="w-4 h-4 inline mr-1" /> Vendedores
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh] custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
            </div>
          ) : activeTab === 'teams' ? (
            <div className="space-y-3">
              {/* Create New Team */}
              {isCreating ? (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Nome do time"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                  <input
                    type="text"
                    placeholder="Descrição (opcional)"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editForm.color}
                      onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                      className="w-12 h-8 rounded cursor-pointer"
                    />
                    <span className="text-xs text-slate-400">Cor do time</span>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleCreateTeam} className="flex-1">Salvar</Button>
                    <Button onClick={() => { setIsCreating(false); resetForm(); }} variant="ghost">Cancelar</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full bg-slate-800/30 border border-dashed border-slate-700 rounded-lg p-4 text-slate-400 hover:text-white hover:border-slate-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Novo Time
                </button>
              )}

              {/* Teams List */}
              {teams.map((team) => (
                <div key={team.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                  {editingId === team.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                      />
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={editForm.color}
                          onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                          className="w-12 h-8 rounded cursor-pointer"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => handleUpdateTeam(team.id)} size="sm">
                          <Save className="w-3 h-3 mr-1" />
                          Salvar
                        </Button>
                        <Button onClick={() => { setEditingId(null); resetForm(); }} variant="ghost" size="sm">Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: team.color }}></div>
                        <div>
                          <div className="text-sm font-medium text-white">{team.name}</div>
                          {team.description && (
                            <div className="text-xs text-slate-400">{team.description}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(team, 'team')}
                          className="p-2 text-slate-400 hover:text-white transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTeam(team.id)}
                          className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : activeTab === 'functions' ? (
            <div className="space-y-3">
              {/* Create New Function */}
              {isCreating ? (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Nome da função"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                  <input
                    type="text"
                    placeholder="Descrição (opcional)"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleCreateFunction} className="flex-1">Salvar</Button>
                    <Button onClick={() => { setIsCreating(false); resetForm(); }} variant="ghost">Cancelar</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full bg-slate-800/30 border border-dashed border-slate-700 rounded-lg p-4 text-slate-400 hover:text-white hover:border-slate-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Nova Função
                </button>
              )}

              {/* Functions List */}
              {functions.map((func) => (
                <div key={func.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                  {editingId === func.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                      />
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                      />
                      <div className="flex gap-2">
                        <Button onClick={() => handleUpdateFunction(func.id)} size="sm">
                          <Save className="w-3 h-3 mr-1" />
                          Salvar
                        </Button>
                        <Button onClick={() => { setEditingId(null); resetForm(); }} variant="ghost" size="sm">Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">{func.name}</div>
                        {func.description && (
                          <div className="text-xs text-slate-400">{func.description}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(func, 'function')}
                          className="p-2 text-slate-400 hover:text-white transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteFunction(func.id)}
                          className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Sellers Tab */
            <div className="space-y-3">
              {/* Create New Seller */}
              {isCreating ? (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Nome do vendedor *"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      placeholder="Email do vendedor *"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Telefone (opcional)"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleCreateSeller} className="flex-1">Salvar</Button>
                    <Button onClick={() => { setIsCreating(false); resetForm(); }} variant="ghost">Cancelar</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full bg-slate-800/30 border border-dashed border-slate-700 rounded-lg p-4 text-slate-400 hover:text-white hover:border-slate-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Novo Vendedor
                </button>
              )}

              {/* Sellers List */}
              {sellers.length === 0 && !isCreating ? (
                <div className="text-center py-8 text-slate-500">
                  <UserCog className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum vendedor cadastrado</p>
                  <p className="text-xs mt-1">Vendedores são responsáveis pelas empresas e podem ser copiados nos emails de cobrança</p>
                </div>
              ) : (
                sellers.map((seller) => (
                  <div key={seller.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                    {editingId === seller.id ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="Nome *"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            placeholder="Email *"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type="text"
                            value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            placeholder="Telefone"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => handleUpdateSeller(seller.id)} size="sm">
                            <Save className="w-3 h-3 mr-1" />
                            Salvar
                          </Button>
                          <Button onClick={() => { setEditingId(null); resetForm(); }} variant="ghost" size="sm">Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                            <UserCog className="w-5 h-5 text-cyan-400" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white">{seller.name}</div>
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {seller.email}
                              </span>
                              {seller.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {seller.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(seller, 'seller')}
                            className="p-2 text-slate-400 hover:text-white transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteSeller(seller.id)}
                            className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end">
          <Button onClick={onClose} variant="ghost">Fechar</Button>
        </div>
      </div>
    </div>
  );
};

export default TeamConfigModal;