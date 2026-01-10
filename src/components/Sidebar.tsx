import React, { useState } from 'react';
import { LayoutDashboard, MessageSquare, Users, Settings as SettingsIcon, LogOut, ShieldCheck, Calendar, Kanban, Receipt, MessageCircle } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from '@/components/ui/sidebar';
import { motion } from 'framer-motion';
import jacometoLogo from '@/assets/jacometo-logo.png';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadMessages } from '@/contexts/UnreadMessagesContext';

const allMenuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { id: 'kanban', label: 'Pipeline', icon: Kanban, adminOnly: false },
  { id: 'chat', label: 'Chat Ao Vivo', icon: MessageSquare, adminOnly: false },
  { id: 'contacts', label: 'Contatos', icon: Users, adminOnly: false },
  { id: 'scheduling', label: 'Agendamentos', icon: Calendar, adminOnly: false },
  { id: 'collections', label: 'Cobrança', icon: Receipt, adminOnly: false },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, adminOnly: true },
  { id: 'team', label: 'Equipe', icon: ShieldCheck, adminOnly: true },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon, adminOnly: false },
];

const Logo = () => {
  return (
    <Link to="/dashboard" className="flex items-center space-x-3 py-1 group">
      <div className="relative w-11 h-11 flex items-center justify-center flex-shrink-0">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/30 to-teal-500/30 blur-xl rounded-full animate-pulse" />
        {/* Ring */}
        <div className="absolute inset-0 rounded-xl ring-1 ring-white/10 group-hover:ring-cyan-500/30 transition-all" />
        <img src={jacometoLogo} alt="Jacometo" className="relative w-10 h-10 object-contain rounded-xl" />
      </div>
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 25,
        }}
        className="flex flex-col overflow-hidden"
      >
        <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-white to-slate-300 bg-clip-text text-transparent whitespace-nowrap">
          Jacometo
        </span>
        <span className="text-[10px] uppercase tracking-wider bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent font-bold">
          Íris Sdr
        </span>
      </motion.div>
    </Link>
  );
};

const LogoIcon = () => {
  return (
    <Link to="/dashboard" className="flex items-center py-1 group">
      <div className="relative w-11 h-11 flex items-center justify-center flex-shrink-0">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/30 to-teal-500/30 blur-xl rounded-full animate-pulse" />
        {/* Ring */}
        <div className="absolute inset-0 rounded-xl ring-1 ring-white/10 group-hover:ring-cyan-500/30 transition-all" />
        <img src={jacometoLogo} alt="Jacometo" className="relative w-10 h-10 object-contain rounded-xl" />
      </div>
    </Link>
  );
};

const UnreadPreviewPanel = () => {
  const { unreadConversations, totalUnread } = useUnreadMessages();
  const { open } = useSidebar();
  const location = useLocation();
  const isOnChatPage = location.pathname === '/chat';

  // Não mostrar se está na página de chat, sidebar fechada, ou sem mensagens
  if (isOnChatPage || !open || totalUnread === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 25,
      }}
      className="mt-4 pt-4"
    >
      {/* Divider with gradient */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />
      
      <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-3 px-2 font-medium flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 animate-pulse" />
        Mensagens não lidas
      </h4>
      <div className="space-y-1.5">
        {unreadConversations.slice(0, 5).map(conv => (
          <Link
            key={conv.id}
            to={`/chat?conversation=${conv.id}`}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-transparent border border-white/[0.03] hover:border-cyan-500/20 backdrop-blur-sm transition-all duration-300 group"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-800 to-slate-800 flex items-center justify-center text-xs font-bold text-cyan-200 ring-2 ring-cyan-500/20 group-hover:ring-cyan-400/40 shadow-lg shadow-cyan-500/10 transition-all flex-shrink-0">
              {conv.contactInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                {conv.contactName}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {conv.lastMessage.length > 30 ? conv.lastMessage.slice(0, 30) + '...' : conv.lastMessage}
              </p>
            </div>
            <span className="min-w-[22px] h-[22px] flex items-center justify-center text-[11px] font-bold bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-full px-1.5 shadow-lg shadow-rose-500/40 ring-2 ring-rose-400/30 flex-shrink-0">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          </Link>
        ))}
      </div>
      {unreadConversations.length > 5 && (
        <Link
          to="/chat"
          className="block text-center text-xs bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent font-medium hover:from-cyan-300 hover:to-teal-300 mt-3 py-2 hover:bg-white/[0.03] rounded-lg transition-all"
        >
          Ver todas ({totalUnread} mensagens)
        </Link>
      )}
    </motion.div>
  );
};

const SidebarContent = () => {
  const location = useLocation();
  const currentPath = location.pathname.substring(1) || 'dashboard';
  const { open } = useSidebar();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { user, signOut } = useAuth();
  const { totalUnread } = useUnreadMessages();

  // Filter menu items based on user role
  const menuItems = allMenuItems.filter(item => !item.adminOnly || isAdmin);

  const links = menuItems.map(item => ({
    id: item.id,
    label: item.label,
    href: `/${item.id}`,
    icon: <item.icon className="h-5 w-5" />,
  }));

  // Get display name from email
  const displayName = user?.email 
    ? user.email.split('@')[0].split('.').map(
        word => word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    : 'Usuário';
  const displayEmail = user?.email || '';
  const initials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <>
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mb-6">
          {open ? <Logo /> : <LogoIcon />}
        </div>
        
        <nav className="flex flex-col gap-1.5">
          {links.map((link, idx) => (
            <SidebarLink
              key={idx}
              link={link}
              isActive={currentPath.startsWith(link.href.slice(1))}
              badge={link.id === 'chat' ? totalUnread : undefined}
            />
          ))}
        </nav>

        {/* Preview de mensagens não lidas */}
        <UnreadPreviewPanel />
      </div>

      {/* User Footer */}
      <div className="pt-4">
        {/* Divider with gradient */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />
        
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-transparent border border-white/[0.03] hover:border-cyan-500/20 transition-all duration-300 group">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-800 to-slate-900 flex items-center justify-center text-xs font-bold text-cyan-300 border border-white/10 ring-2 ring-transparent group-hover:ring-cyan-500/30 transition-all flex-shrink-0 shadow-lg shadow-black/20">
            {initials}
          </div>
          <motion.div
            animate={{
              display: open ? "block" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{
              type: "spring",
              stiffness: 350,
              damping: 28,
            }}
            className="flex-1 overflow-hidden"
          >
            <p className="text-sm font-semibold text-slate-200 group-hover:text-white whitespace-nowrap transition-colors">{displayName}</p>
            <p className="text-xs text-slate-500 truncate">{displayEmail}</p>
          </motion.div>
          <motion.button
            animate={{
              display: open ? "flex" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{
              type: "spring",
              stiffness: 350,
              damping: 28,
              delay: 0.05,
            }}
            onClick={handleLogout}
            className="p-2 rounded-lg bg-white/[0.03] hover:bg-rose-500/20 hover:text-rose-400 border border-transparent hover:border-rose-500/30 transition-all duration-200 flex items-center justify-center"
            title="Sair"
          >
            <LogOut className="w-4 h-4 text-slate-400 group-hover:text-rose-400 transition-colors" />
          </motion.button>
        </div>
      </div>
    </>
  );
};

const AppSidebar: React.FC = () => {
  const [open, setOpen] = useState(() => {
    const savedPinned = localStorage.getItem('sidebar-pinned');
    return savedPinned === 'true';
  });

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between gap-6">
        <SidebarContent />
      </SidebarBody>
    </Sidebar>
  );
};

export default AppSidebar;
