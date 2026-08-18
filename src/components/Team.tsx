import React, { useEffect, useState } from 'react';
import { Mail, Phone, UserCog, Trash2, Plus } from 'lucide-react';
import { UserPlus, Search, MoreVertical, Loader2, X, Check, ChevronDown, Edit2, Shield, Users, Briefcase, Settings } from 'lucide-react';
import { Button } from './Button';
import { api } from '../services/api';
import { TeamMember, type Team as TeamType, type TeamFunction } from '../types';
import { supabase } from '@/integrations/supabase/client';
import TeamConfigModal from './TeamConfigModal';
import { toast } from 'sonner';

interface Seller {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
}

const Team: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<TeamType[]>([]);
  const [functions, setFunctions] = useState<TeamFunction[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showSellerForm, setShowSellerForm] = useState(false);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [sellerForm, setSellerForm] = useState({ name: '', email: '', phone: '' });
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    role: 'agent',
    team_id: '',
    function_id: '',
    weight: 1
  });

  useEffect(() => {
    loadAllData();
    const cleanup = setupRealtime();
    return cleanup;
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [membersData, teamsData, functionsData, sellersData] = await Promise.all([
        api.fetchTeam(),
        api.fetchTeams(),
        api.fetchTeamFunctions(),
        api.fetchSellers()
      ]);
      setMembers(membersData);
      setTeams(teamsData as any);
      setFunctions(functionsData as any);
      setSellers(sellersData as any);
    } catch (error) {
      console.error("Erro ao carregar dados da equipe", error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtime = () => {
    const channel = supabase
      .channel('team-members-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, () => {
        loadAllData();
      })
      .subscribe();

    const sellersChannel = supabase
      .channel('sellers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sellers' }, () => {
        loadAllData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(sellersChannel);
    };
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      // 1. Criar (ou atualizar) team_member
      const member = await api.createTeamMember({
        name: formData.name,
        email: formData.email,
        role: formData.role as 'agent' | 'admin' | 'manager',
        team_id: formData.team_id || undefined,
        function_id: formData.function_id || undefined,
        weight: formData.weight
      });

      const jaAtivo = member.alreadyExisted && member.status === 'active';

      if (jaAtivo) {
        toast.info('Este e-mail já faz parte da equipe. Dados atualizados.');
        setShowModal(false);
        setFormData({ name: '', email: '', role: 'agent', team_id: '', function_id: '', weight: 1 });
        await loadAllData();
        return;
      }

      // 2. Criar/renovar pending_invite com app_role
      const appRole = formData.role === 'admin' ? 'admin' : 'operator';
      await api.createPendingInvite({
        email: formData.email,
        app_role: appRole,
        team_member_id: member.id
      });

      // 3. Enviar email de convite
      const { data: userData } = await supabase.auth.getUser();
      const inviterName = userData.user?.email?.split('@')[0] || 'Equipe OrbePet';
      
      const { error: emailError } = await supabase.functions.invoke('send-invite-email', {
        body: {
          email: formData.email,
          name: formData.name,
          role: formData.role,
          inviter_name: inviterName.charAt(0).toUpperCase() + inviterName.slice(1)
        }
      });

      if (emailError) {
        console.warn('Erro ao enviar email de convite:', emailError);
        toast.success('Membro convidado! (Email não enviado - configure RESEND_API_KEY)');
      } else {
        toast.success(member.alreadyExisted ? 'Convite reenviado por email!' : 'Convite enviado por email!');
      }

      setShowModal(false);
      setFormData({ name: '', email: '', role: 'agent', team_id: '', function_id: '', weight: 1 });
      await loadAllData();
    } catch (error) {
      console.error('Erro ao convidar membro:', error);
      toast.error('Erro ao convidar membro. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };


  const handleUpdateMember = async (id: string, field: string, value: any) => {
    try {
      await api.updateTeamMember(id, { [field]: value });
      toast.success('Membro atualizado com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar membro:', error);
      toast.error('Erro ao atualizar membro');
    }
  };

  const handleResendInvite = async (member: TeamMember) => {
    try {
      // 1. Atualizar expires_at do pending_invite (renovar por mais 7 dias)
      const { error: updateError } = await supabase
        .from('pending_invites')
        .update({ 
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() 
        })
        .eq('email', member.email);

      if (updateError) {
        console.warn('Pending invite não encontrado, criando novo...');
        const appRole = member.role === 'admin' ? 'admin' : 'operator';
        await api.createPendingInvite({
          email: member.email,
          app_role: appRole,
          team_member_id: member.id
        });
      }

      // 2. Reenviar email de convite
      const { data: userData } = await supabase.auth.getUser();
      const inviterName = userData.user?.email?.split('@')[0] || 'Equipe OrbePet';

      const { error: emailError } = await supabase.functions.invoke('send-invite-email', {
        body: {
          email: member.email,
          name: member.name,
          role: member.role,
          inviter_name: inviterName.charAt(0).toUpperCase() + inviterName.slice(1)
        }
      });

      if (emailError) {
        console.warn('Erro ao enviar email:', emailError);
        toast.success('Convite renovado! (Email não enviado - configure RESEND_API_KEY)');
      } else {
        toast.success('Convite reenviado com sucesso!');
      }
    } catch (error) {
      console.error('Erro ao reenviar convite:', error);
      toast.error('Erro ao reenviar convite');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
        case 'active':
            return <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-950 border border-slate-700 text-white shadow-sm">Ativo</span>;
        case 'invited':
            return <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-950 border border-amber-900/50 text-amber-500 shadow-sm">Pendente</span>;
        default:
            return <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-950 border border-slate-800 text-slate-500 shadow-sm">Inativo</span>;
    }
  };

  // Seller handlers
  const handleCreateSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createSeller({
        name: sellerForm.name,
        email: sellerForm.email,
        phone: sellerForm.phone || undefined
      });
      toast.success('Vendedor criado com sucesso!');
      setSellerForm({ name: '', email: '', phone: '' });
      setShowSellerForm(false);
      await loadAllData();
    } catch (error) {
      console.error('Erro ao criar vendedor:', error);
      toast.error('Erro ao criar vendedor');
    }
  };

  const handleUpdateSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeller) return;
    try {
      await api.updateSeller(editingSeller.id, {
        name: sellerForm.name,
        email: sellerForm.email,
        phone: sellerForm.phone || undefined
      });
      toast.success('Vendedor atualizado com sucesso!');
      setEditingSeller(null);
      setSellerForm({ name: '', email: '', phone: '' });
      await loadAllData();
    } catch (error) {
      console.error('Erro ao atualizar vendedor:', error);
      toast.error('Erro ao atualizar vendedor');
    }
  };

  const handleDeleteSeller = async (seller: Seller) => {
    if (!confirm(`Tem certeza que deseja excluir o vendedor "${seller.name}"?`)) return;
    try {
      await api.deleteSeller(seller.id);
      toast.success('Vendedor excluído com sucesso!');
      await loadAllData();
    } catch (error) {
      console.error('Erro ao excluir vendedor:', error);
      toast.error('Erro ao excluir vendedor');
    }
  };

  const startEditSeller = (seller: Seller) => {
    setEditingSeller(seller);
    setSellerForm({
      name: seller.name,
      email: seller.email,
      phone: seller.phone || ''
    });
    setShowSellerForm(false);
  };

  const cancelSellerEdit = () => {
    setEditingSeller(null);
    setShowSellerForm(false);
    setSellerForm({ name: '', email: '', phone: '' });
  };

  // Stats calculations
  const stats = {
    total: members.length,
    admins: members.filter(m => m.role === 'admin').length,
    members: members.filter(m => m.role !== 'admin').length,
    teams: teams.length,
    sellers: sellers.length
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950 text-slate-50 relative custom-scrollbar">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Equipe</h2>
          <p className="text-sm text-slate-400 mt-1">Gerencie usuários e times da organização</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setShowConfigModal(true)} variant="outline" className="border-slate-700">
            <Settings className="w-4 h-4 mr-2" />
            Configurar
          </Button>
          <Button onClick={() => setShowModal(true)} className="shadow-lg shadow-primary/20 bg-primary text-primary-foreground hover:bg-primary/90">
            <UserPlus className="w-4 h-4 mr-2" />
            Convidar Usuário
          </Button>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-400 mb-2">Total de Usuários</div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.total}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-400 mb-2">Admins</div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.admins}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-400 mb-2">Membros</div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.members}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-400 mb-2">Times Ativos</div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.teams}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-400 mb-2">Vendedores</div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.sellers}</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input 
            type="text" 
            placeholder="Buscar por nome, email, time ou função..." 
            className="w-full sm:w-96 pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-200 focus:ring-1 focus:ring-slate-700 outline-none placeholder:text-slate-600 transition-all"
        />
      </div>

      {/* Main Table Card */}
      <div className="bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-800">
            <h3 className="text-lg font-bold text-white">Usuários da Equipe</h3>
            <p className="text-sm text-slate-500 mt-1">Gerencie roles e times dos usuários</p>
        </div>

        {loading ? (
             <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mb-3" />
                <span className="text-sm text-slate-400">Carregando dados...</span>
           </div>
        ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12">
                <Users className="w-12 h-12 text-slate-600 mb-4" />
                <p className="text-slate-400 mb-4">Nenhum membro cadastrado ainda.</p>
                <Button onClick={() => setShowModal(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Convidar Primeiro Membro
                </Button>
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-800/50">
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Usuário</th>
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
                                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Função</th>
                                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Peso</th>
                                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Ramal</th>
                                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider text-center">Status</th>
                                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/30">
                        {members.map((member) => (
                            <tr key={member.id} className="hover:bg-slate-800/20 transition-colors group">
                                {/* User Info */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 border border-slate-700 uppercase">
                                            {member.name.substring(0, 2)}
                                        </div>
                                        <span className="text-sm font-medium text-slate-200">{member.name}</span>
                                    </div>
                                </td>
                                
                                {/* Email */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm text-slate-400">{member.email}</span>
                                </td>

                                {/* Role Selector */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center justify-between w-32 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-300 cursor-pointer hover:border-slate-600 transition-colors">
                                        {member.role === 'admin' ? 'Admin' : member.role === 'manager' ? 'Gerente' : 'Normal'}
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                    </div>
                                </td>

                                {/* Time Selector */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <select
                                        value={member.team_id || ''}
                                        onChange={(e) => handleUpdateMember(member.id, 'team_id', e.target.value || null)}
                                        className="w-32 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-300 cursor-pointer hover:border-slate-600 transition-colors"
                                    >
                                        <option value="">Sem time</option>
                                        {teams.map(team => (
                                            <option key={team.id} value={team.id}>{team.name}</option>
                                        ))}
                                    </select>
                                </td>

                                {/* Function Selector */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <select
                                        value={member.function_id || ''}
                                        onChange={(e) => handleUpdateMember(member.id, 'function_id', e.target.value || null)}
                                        className="w-32 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-300 cursor-pointer hover:border-slate-600 transition-colors"
                                    >
                                        <option value="">Sem função</option>
                                        {functions.map(func => (
                                            <option key={func.id} value={func.id}>{func.name}</option>
                                        ))}
                                    </select>
                                </td>

                                                {/* Weight */}
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="10"
                                                        value={member.weight || 1}
                                                        onChange={(e) => handleUpdateMember(member.id, 'weight', parseInt(e.target.value))}
                                                        className="w-16 px-2 py-1 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-300 text-center"
                                                    />
                                                </td>

                                                {/* Ramal API4Com */}
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <input
                                                        type="text"
                                                        placeholder="1000"
                                                        value={member.api4com_extension || ''}
                                                        onChange={(e) => handleUpdateMember(member.id, 'api4com_extension', e.target.value || null)}
                                                        className="w-20 px-2 py-1 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-300 text-center placeholder:text-slate-600"
                                                    />
                                                </td>

                                {/* Status */}
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    {getStatusBadge(member.status)}
                                </td>

                                {/* Actions */}
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        {member.status === 'invited' && (
                                            <button 
                                                onClick={() => handleResendInvite(member)}
                                                className="p-2 rounded-lg text-amber-500 hover:bg-slate-800 hover:text-amber-400 transition-colors"
                                                title="Reenviar convite"
                                            >
                                                <Mail className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button className="p-2 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition-colors">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* Sellers Section */}
      <div className="bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden shadow-xl mt-8">
        <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <UserCog className="w-5 h-5 text-cyan-500" />
              Vendedores
            </h3>
            <p className="text-sm text-slate-500 mt-1">Gerencie os vendedores responsáveis pelas empresas</p>
          </div>
          <Button 
            onClick={() => {
              setShowSellerForm(true);
              setEditingSeller(null);
              setSellerForm({ name: '', email: '', phone: '' });
            }}
            className="bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Vendedor
          </Button>
        </div>

        {/* Seller Form (Inline) */}
        {(showSellerForm || editingSeller) && (
          <div className="p-6 border-b border-slate-800 bg-slate-900/50">
            <form onSubmit={editingSeller ? handleUpdateSeller : handleCreateSeller} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Nome</label>
                  <input
                    required
                    type="text"
                    placeholder="Nome do vendedor"
                    value={sellerForm.name}
                    onChange={(e) => setSellerForm({ ...sellerForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Email</label>
                  <input
                    required
                    type="email"
                    placeholder="email@empresa.com"
                    value={sellerForm.email}
                    onChange={(e) => setSellerForm({ ...sellerForm, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Telefone</label>
                  <input
                    type="tel"
                    placeholder="+55 11 99999-9999"
                    value={sellerForm.phone}
                    onChange={(e) => setSellerForm({ ...sellerForm, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button type="button" variant="ghost" onClick={cancelSellerEdit} className="border border-slate-700 hover:bg-slate-800">
                  Cancelar
                </Button>
                <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {editingSeller ? 'Salvar Alterações' : 'Criar Vendedor'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Sellers Grid */}
        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mb-3" />
              <span className="text-sm text-slate-400">Carregando vendedores...</span>
            </div>
          ) : sellers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <UserCog className="w-12 h-12 text-slate-600 mb-4" />
              <p className="text-slate-400 mb-4">Nenhum vendedor cadastrado ainda.</p>
              <Button 
                onClick={() => {
                  setShowSellerForm(true);
                  setSellerForm({ name: '', email: '', phone: '' });
                }}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Cadastrar Primeiro Vendedor
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sellers.map((seller) => (
                <div 
                  key={seller.id} 
                  className="bg-slate-950 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-600 to-cyan-800 flex items-center justify-center text-lg font-bold text-white uppercase shadow-lg">
                        {seller.name.substring(0, 2)}
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">{seller.name}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${seller.is_active ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                          {seller.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEditSeller(seller)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-cyan-400 transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSeller(seller)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Mail className="w-4 h-4 text-slate-500" />
                      <span className="truncate">{seller.email}</span>
                    </div>
                    {seller.phone && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Phone className="w-4 h-4 text-slate-500" />
                        <span>{seller.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">Convidar para a Equipe</h3>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleInvite} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Nome Completo</label>
                        <input 
                            required
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all"
                            placeholder="Ex: João da Silva"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Email Corporativo</label>
                        <input 
                            required
                            type="email" 
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all"
                            placeholder="colaborador@empresa.com"
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Nível de Acesso</label>
                        <div className="grid grid-cols-3 gap-2">
                            {['agent', 'manager', 'admin'].map((role) => (
                                <div 
                                    key={role}
                                    onClick={() => setFormData({...formData, role})}
                                    className={`cursor-pointer rounded-lg border p-2 text-center transition-all ${
                                        formData.role === role 
                                        ? 'bg-slate-800 border-slate-500 text-white' 
                                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                    }`}
                                >
                                    <div className="text-xs font-bold uppercase mb-1">{role === 'agent' ? 'Atendente' : role === 'manager' ? 'Gerente' : 'Admin'}</div>
                                    {formData.role === role && <div className="flex justify-center"><Check className="w-3 h-3" /></div>}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Time (opcional)</label>
                        <select
                            value={formData.team_id}
                            onChange={(e) => setFormData({...formData, team_id: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                        >
                            <option value="">Sem time</option>
                            {teams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Função (opcional)</label>
                        <select
                            value={formData.function_id}
                            onChange={(e) => setFormData({...formData, function_id: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                        >
                            <option value="">Sem função</option>
                            {functions.map(func => (
                                <option key={func.id} value={func.id}>{func.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Peso (para distribuição)</label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={formData.weight}
                            onChange={(e) => setFormData({...formData, weight: parseInt(e.target.value)})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <Button type="button" variant="ghost" disabled={submitting} onClick={() => setShowModal(false)} className="flex-1 border border-slate-700 hover:bg-slate-800">Cancelar</Button>
                        <Button type="submit" disabled={submitting} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{submitting ? 'Enviando...' : 'Enviar Convite'}</Button>

                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Config Modal */}
      <TeamConfigModal 
        isOpen={showConfigModal} 
        onClose={() => setShowConfigModal(false)} 
        onUpdate={loadAllData}
      />
    </div>
  );
};

export default Team;