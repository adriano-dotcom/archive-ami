"use client";

import { cn } from "@/lib/utils";
import { Link, LinkProps } from "react-router-dom";
import React, { useState, createContext, useContext, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, Pin, PinOff } from "lucide-react";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
  pinned: boolean;
  setPinned: React.Dispatch<React.SetStateAction<boolean>>;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);
  const [pinned, setPinned] = useState(() => {
    const saved = localStorage.getItem('sidebar-pinned');
    return saved === 'true';
  });

  // Persist pinned state
  useEffect(() => {
    localStorage.setItem('sidebar-pinned', String(pinned));
  }, [pinned]);

  // When pinned, keep sidebar open
  useEffect(() => {
    if (pinned && setOpenProp) {
      setOpenProp(true);
    } else if (pinned) {
      setOpenState(true);
    }
  }, [pinned, setOpenProp]);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate, pinned, setPinned }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <>
      <DesktopSidebar className={className}>{children}</DesktopSidebar>
      <MobileSidebar className={className}>{children}</MobileSidebar>
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  const { open, setOpen, animate, pinned, setPinned } = useSidebar();
  
  const handleMouseEnter = () => {
    if (!pinned) setOpen(true);
  };
  
  const handleMouseLeave = () => {
    if (!pinned) setOpen(false);
  };

  const togglePin = () => {
    setPinned(!pinned);
  };
  
  return (
    <motion.div
      className={cn(
        "h-full px-4 py-4 hidden md:flex md:flex-col w-[260px] flex-shrink-0 relative",
        // iOS 26 Glassmorphism
        "bg-gradient-to-b from-slate-950/95 via-slate-900/90 to-slate-950/98",
        "backdrop-blur-2xl border-r border-white/[0.06]",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]",
        className
      )}
      animate={{
        width: animate ? (open || pinned ? "260px" : "76px") : "260px",
      }}
      transition={{
        duration: 0.3,
        ease: "easeInOut",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.02] via-transparent to-violet-500/[0.02] pointer-events-none" />
      
      {/* Pin Button */}
      {open && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={togglePin}
          className={cn(
            "absolute top-4 right-4 z-20 p-1.5 rounded-lg transition-all duration-200",
            pinned 
              ? "bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30" 
              : "bg-white/[0.03] text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
          )}
          title={pinned ? "Desafixar sidebar" : "Fixar sidebar aberta"}
        >
          {pinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
        </motion.button>
      )}
      
      <div className="relative z-10 flex flex-col h-full">
        {children}
      </div>
    </motion.div>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  return (
    <>
      <div
        className={cn(
          "h-14 px-4 py-4 flex flex-row md:hidden items-center justify-between",
          "bg-gradient-to-r from-slate-950/95 to-slate-900/95 backdrop-blur-2xl",
          "w-full border-b border-white/[0.06]"
        )}
        {...props}
      >
        <div className="flex justify-end z-20 w-full">
          <Menu
            className="text-slate-200 cursor-pointer hover:text-cyan-400 transition-colors"
            onClick={() => setOpen(!open)}
          />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed h-full w-full inset-0 p-10 z-[100] flex flex-col justify-between",
                "bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950",
                className
              )}
            >
              <div
                className="absolute right-10 top-10 z-50 text-slate-200 cursor-pointer hover:text-cyan-400 transition-colors"
                onClick={() => setOpen(!open)}
              >
                <X />
              </div>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

// Menu item color scheme for iOS 26 vibrant effect
const menuColors: Record<string, { gradient: string; glow: string; border: string; text: string }> = {
  dashboard: { gradient: 'from-violet-500/20 via-purple-500/15 to-transparent', glow: 'shadow-violet-500/20', border: 'ring-violet-400/30', text: 'text-violet-300' },
  kanban: { gradient: 'from-blue-500/20 via-indigo-500/15 to-transparent', glow: 'shadow-blue-500/20', border: 'ring-blue-400/30', text: 'text-blue-300' },
  chat: { gradient: 'from-cyan-500/20 via-teal-500/15 to-transparent', glow: 'shadow-cyan-500/20', border: 'ring-cyan-400/30', text: 'text-cyan-300' },
  contacts: { gradient: 'from-emerald-500/20 via-green-500/15 to-transparent', glow: 'shadow-emerald-500/20', border: 'ring-emerald-400/30', text: 'text-emerald-300' },
  scheduling: { gradient: 'from-amber-500/20 via-yellow-500/15 to-transparent', glow: 'shadow-amber-500/20', border: 'ring-amber-400/30', text: 'text-amber-300' },
  campaigns: { gradient: 'from-orange-500/20 via-red-500/15 to-transparent', glow: 'shadow-orange-500/20', border: 'ring-orange-400/30', text: 'text-orange-300' },
  prospecting: { gradient: 'from-pink-500/20 via-rose-500/15 to-transparent', glow: 'shadow-pink-500/20', border: 'ring-pink-400/30', text: 'text-pink-300' },
  team: { gradient: 'from-sky-500/20 via-blue-500/15 to-transparent', glow: 'shadow-sky-500/20', border: 'ring-sky-400/30', text: 'text-sky-300' },
  functions: { gradient: 'from-fuchsia-500/20 via-purple-500/15 to-transparent', glow: 'shadow-fuchsia-500/20', border: 'ring-fuchsia-400/30', text: 'text-fuchsia-300' },
  settings: { gradient: 'from-slate-400/20 via-gray-500/15 to-transparent', glow: 'shadow-slate-500/20', border: 'ring-slate-400/30', text: 'text-slate-300' },
};

const getMenuColors = (href: string) => {
  const id = href.replace('/', '');
  return menuColors[id] || menuColors.chat;
};

export const SidebarLink = ({
  link,
  className,
  isActive,
  onClick,
  badge,
  ...props
}: {
  link: Links;
  className?: string;
  isActive?: boolean;
  onClick?: () => void;
  badge?: number;
  props?: Omit<LinkProps, 'to'>;
}) => {
  const { open, animate, setOpen } = useSidebar();
  const colors = getMenuColors(link.href);
  
  // Close mobile sidebar on navigation
  const handleClick = () => {
    if (window.innerWidth < 768) {
      setOpen(false);
    }
    onClick?.();
  };
  
  return (
    <Link
      to={link.href}
      onClick={handleClick}
      className={cn(
        "flex items-center justify-start gap-3 group/sidebar py-3 px-3 rounded-xl transition-all duration-300 relative overflow-hidden",
        isActive
          ? `bg-gradient-to-r ${colors.gradient} backdrop-blur-xl ${colors.text} shadow-lg ${colors.glow} ring-1 ${colors.border} scale-[1.01]`
          : "text-slate-400 hover:bg-white/[0.04] hover:backdrop-blur-lg hover:text-slate-100 hover:scale-[1.02]",
        className
      )}
      {...props}
    >
      {/* Active indicator bar with gradient */}
      {isActive && (
        <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-gradient-to-b from-cyan-400 via-teal-400 to-cyan-500 rounded-full shadow-[0_0_12px_rgba(6,182,212,0.6)]" />
      )}
      
      <span className={cn(
        "flex-shrink-0 transition-all duration-300 relative",
        isActive 
          ? `${colors.text} drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]` 
          : "text-slate-500 group-hover/sidebar:text-cyan-300"
      )}>
        {link.icon}
        {/* Badge when collapsed - iOS 26 style */}
        {badge && badge > 0 && !open && (
          <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-full px-1 shadow-lg shadow-rose-500/40 ring-2 ring-rose-400/30 animate-pulse">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{
          duration: 0.2,
          ease: "easeInOut",
        }}
        className={cn(
          "text-sm font-medium group-hover/sidebar:translate-x-1 transition-all duration-200 whitespace-pre flex-1",
          isActive ? "text-white font-semibold" : ""
        )}
      >
        {link.label}
      </motion.span>
      {/* Badge when expanded - iOS 26 style */}
      {badge && badge > 0 && open && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="min-w-[22px] h-[22px] flex items-center justify-center text-[11px] font-bold bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-full px-1.5 shadow-lg shadow-rose-500/40 ring-2 ring-rose-400/30"
        >
          {badge > 99 ? '99+' : badge}
        </motion.span>
      )}
    </Link>
  );
};
