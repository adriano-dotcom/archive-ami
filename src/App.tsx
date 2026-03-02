import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sidebar from './components/Sidebar';
import { CompanySettingsProvider } from './hooks/useCompanySettings';
import { AuthProvider } from './hooks/useAuth';
import { UnreadMessagesProvider } from './contexts/UnreadMessagesContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { Toaster } from 'sonner';
import { usePrefetchSeguradosData } from './hooks/useSeguradosData';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IncomingCallModal } from './components/IncomingCallModal';
import { useIncomingWhatsAppCall } from './hooks/useIncomingWhatsAppCall';

// Lazy load route components for code splitting
const Dashboard = lazy(() => import('./components/Dashboard'));
const ChatInterface = lazy(() => import('./components/ChatInterface'));
const Contacts = lazy(() => import('./components/Contacts'));
const SeguradosTab = lazy(() => import('./components/segurados/SeguradosTab').then(m => ({ default: m.SeguradosTab })));
const Settings = lazy(() => import('./components/Settings'));
const Team = lazy(() => import('./components/Team'));
const Scheduling = lazy(() => import('./components/Scheduling'));
const MeetingRoom = lazy(() => import('./components/MeetingRoom'));
const WhatsAppDashboard = lazy(() => import('./components/WhatsAppDashboard'));
const CollectionsDashboard = lazy(() => import('./components/collections').then(m => ({ default: m.CollectionsDashboard })));
const CallsPage = lazy(() => import('./components/CallsPage'));
const Auth = lazy(() => import('./pages/Auth'));

const queryClient = new QueryClient();

// Loading fallback component
const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center h-full w-full bg-slate-950">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
  </div>
);

// Default redirect component - redirects all users to /chat
const DefaultRedirect: React.FC = () => {
  return <Navigate to="/chat" replace />;
};

// Componente de Layout que envolve a aplicação principal
const AppLayout: React.FC = () => {
  // Prefetch segurados data on app load for instant navigation
  const prefetchSegurados = usePrefetchSeguradosData();
  const { incomingCall, dismissCall, stopRingtone } = useIncomingWhatsAppCall();
  
  useEffect(() => {
    // Prefetch in background after a short delay to prioritize initial render
    const timer = setTimeout(() => {
      prefetchSegurados();
    }, 1000);
    return () => clearTimeout(timer);
  }, [prefetchSegurados]);
  
  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-950 text-slate-50 overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-cyan-900/20 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-violet-900/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 z-0"></div>
      
      <Sidebar />
      
      <main className="flex-1 h-full overflow-hidden relative z-10 flex flex-col">
        {/* Top Border Gradient */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent opacity-50 z-20"></div>
        
        <div className="flex-1 w-full h-full relative overflow-hidden">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* Global WhatsApp Incoming Call Modal */}
      <IncomingCallModal call={incomingCall} onDismiss={dismissCall} onStopRingtone={stopRingtone} />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
        <CompanySettingsProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Auth Route */}
                <Route path="/auth" element={<Auth />} />
                
                {/* Rota Externa: Sala de Reunião (Sem Sidebar) */}
                <Route path="/meeting/:id" element={<MeetingRoom />} />

                {/* Rotas Internas (Com Sidebar) - Protected */}
                <Route element={
                  <ProtectedRoute>
                    <UnreadMessagesProvider>
                      <AppLayout />
                    </UnreadMessagesProvider>
                  </ProtectedRoute>
                }>
                  <Route path="/" element={<DefaultRedirect />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  
                  <Route path="/chat" element={<ChatInterface />} />
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/segurados" element={<SeguradosTab />} />
                  <Route path="/scheduling" element={<Scheduling />} />
                  <Route path="/team" element={<AdminRoute><Team /></AdminRoute>} />
                  <Route path="/collections" element={<CollectionsDashboard />} />
                  <Route path="/calls" element={<CallsPage />} />
                  <Route path="/whatsapp" element={<AdminRoute><WhatsAppDashboard /></AdminRoute>} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster 
            position="top-right"
            richColors
            theme="dark"
          />
        </CompanySettingsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
