import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, LogIn, UserPlus, Check, X, KeyRound, ArrowLeft } from "lucide-react";
import logo from "@/assets/jacometo-logo.png";

const validatePassword = (password: string) => {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password)
  };
};

const isPasswordValid = (password: string) => {
  const checks = validatePassword(password);
  return checks.minLength && checks.hasUppercase && checks.hasNumber && checks.hasSpecial;
};

export default function Auth() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResetMode, setIsResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    // Check if this is a password reset callback
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const type = hashParams.get('type');
    
    if (accessToken && type === 'recovery') {
      setIsResetMode(true);
    }
  }, []);

  useEffect(() => {
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Don't redirect if in reset mode
      if (isResetMode) return;
      
      if (session?.user) {
        navigate("/", {
          replace: true
        });
      }
    });

    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      // Don't redirect if in reset mode
      if (isResetMode) return;
      
      if (session?.user) {
        navigate("/", {
          replace: true
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, isResetMode]);

  // Function to accept pending invite after auth
  const acceptInvite = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('accept-invite');
      if (error) {
        console.error('Error accepting invite:', error);
        return;
      }
      if (data?.accepted) {
        console.log('Invite accepted:', data);
      }
    } catch (err) {
      console.error('Failed to accept invite:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }
    setIsLoading(true);
    const {
      error
    } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    
    if (error) {
      setIsLoading(false);
      if (error.message.includes("Invalid login credentials")) {
        toast.error("Email ou senha incorretos");
      } else if (error.message.includes("Email not confirmed")) {
        toast.error("Por favor, confirme seu email antes de fazer login");
      } else {
        toast.error(error.message);
      }
      return;
    }
    
    // Accept invite after successful login
    await acceptInvite();
    setIsLoading(false);
    toast.success("Login realizado com sucesso!");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }
    if (!isPasswordValid(password)) {
      toast.error("A senha não atende aos requisitos de segurança");
      return;
    }
    setIsLoading(true);
    const redirectUrl = `${window.location.origin}/`;
    const {
      data,
      error
    } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    
    if (error) {
      setIsLoading(false);
      if (error.message.includes("already registered")) {
        toast.error("Este email já está registrado. Tente fazer login.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    
    // If user was auto-confirmed (no email verification needed), accept invite
    if (data?.user && data?.session) {
      await acceptInvite();
    }
    
    setIsLoading(false);
    toast.success("Conta criada! Verifique seu email para confirmar.");
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      toast.error("Por favor, informe seu email");
      return;
    }
    
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/auth`,
    });
    
    setIsLoading(false);
    
    if (error) {
      toast.error(error.message);
      return;
    }
    
    toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
    setShowResetPassword(false);
    setResetEmail("");
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(newPassword)) {
      toast.error("A senha não atende aos requisitos de segurança");
      return;
    }
    
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    
    setIsLoading(false);
    
    if (error) {
      toast.error(error.message);
      return;
    }
    
    toast.success("Senha atualizada com sucesso!");
    setIsResetMode(false);
    setNewPassword("");
    // Clear URL hash
    window.history.replaceState(null, '', window.location.pathname);
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-3 sm:p-4">
      {/* Background Image - Truck Fleet - Using img tag for better LCP */}
      <img 
        src="https://images.unsplash.com/photo-1492168732976-2676c584c675?auto=format&fit=crop&w=1920&q=60"
        alt=""
        width={1920}
        height={1280}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover scale-105"
      />
      
      {/* Dark Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/85 via-slate-900/80 to-indigo-900/85" />
      
      {/* Decorative Blur Orbs */}
      <div className="absolute top-1/4 -left-20 w-48 sm:w-72 h-48 sm:h-72 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-64 sm:w-96 h-64 sm:h-96 bg-blue-500/15 rounded-full blur-3xl animate-pulse" />

      {/* Login Card */}
      <Card className="w-full max-w-md relative z-10 bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl shadow-black/20 animate-fade-in">
        <CardHeader className="text-center pb-2 px-4 sm:px-6 pt-5 sm:pt-6">
          {/* Logo */}
          <div className="flex justify-center mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 bg-white/10 rounded-xl sm:rounded-2xl backdrop-blur-sm border border-white/10">
              <img src={logo} alt="Jacometo Seguros" width={46} height={48} className="h-9 sm:h-12 w-auto" />
            </div>
          </div>
          
          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Jacometo Cobranças</h1>
          
          {/* SDR Badge */}
          <div className="mt-2 sm:mt-3 flex items-center justify-center gap-2 sm:gap-3">
            <div className="h-px w-8 sm:w-12 bg-gradient-to-r from-transparent to-white/40" />
            <span className="text-cyan-400 font-semibold text-xs sm:text-sm uppercase tracking-[0.15em] sm:tracking-[0.2em]">ÓMEGA</span>
            <div className="h-px w-8 sm:w-12 bg-gradient-to-l from-transparent to-white/40" />
          </div>
          
          <p className="text-white/60 text-xs sm:text-sm mt-3 sm:mt-4">
            {isResetMode 
              ? "Defina sua nova senha para continuar" 
              : "Faça login ou crie sua conta para continuar"}
          </p>
        </CardHeader>
        
        <CardContent className="pt-2 px-4 sm:px-6 pb-5 sm:pb-6">
          {isResetMode ? (
            // Password Reset Form
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <KeyRound className="h-5 w-5 text-cyan-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">Nova Senha</h2>
              </div>
              
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="new-password" className="text-white/90 text-xs sm:text-sm font-medium">
                  Digite sua nova senha
                </Label>
                <Input 
                  id="new-password" 
                  type="password" 
                  placeholder="••••••••" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  disabled={isLoading} 
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-cyan-400/50 focus:ring-cyan-400/20 transition-all h-10 sm:h-11 text-sm sm:text-base" 
                />
                {newPassword && (
                  <div className="mt-2 space-y-1 text-xs">
                    {(() => {
                      const checks = validatePassword(newPassword);
                      return (
                        <>
                          <div className={`flex items-center gap-1.5 ${checks.minLength ? 'text-green-400' : 'text-white/50'}`}>
                            {checks.minLength ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            Mínimo 8 caracteres
                          </div>
                          <div className={`flex items-center gap-1.5 ${checks.hasUppercase ? 'text-green-400' : 'text-white/50'}`}>
                            {checks.hasUppercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            Letra maiúscula
                          </div>
                          <div className={`flex items-center gap-1.5 ${checks.hasNumber ? 'text-green-400' : 'text-white/50'}`}>
                            {checks.hasNumber ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            Número
                          </div>
                          <div className={`flex items-center gap-1.5 ${checks.hasSpecial ? 'text-green-400' : 'text-white/50'}`}>
                            {checks.hasSpecial ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            Caractere especial
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
              
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-lg shadow-cyan-500/25 border-0 transition-all duration-300 h-10 sm:h-11 text-sm sm:text-base mt-2" 
                disabled={isLoading || !isPasswordValid(newPassword)}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Atualizar Senha
                  </>
                )}
              </Button>
            </form>
          ) : (
            // Normal Login/Signup Tabs
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-white/10 border border-white/10 p-1 h-10 sm:h-11">
                <TabsTrigger value="login" className="data-[state=active]:bg-white/20 data-[state=active]:text-white data-[state=active]:shadow-lg text-white/70 transition-all text-sm sm:text-base h-8 sm:h-9">
                  Entrar
                </TabsTrigger>
                <TabsTrigger value="signup" className="data-[state=active]:bg-white/20 data-[state=active]:text-white data-[state=active]:shadow-lg text-white/70 transition-all text-sm sm:text-base h-8 sm:h-9">
                  Criar Conta
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="login" className="mt-4 sm:mt-6">
                <form onSubmit={handleLogin} className="space-y-3 sm:space-y-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="login-email" className="text-white/90 text-xs sm:text-sm font-medium">
                      Email
                    </Label>
                    <Input id="login-email" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} disabled={isLoading} className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-cyan-400/50 focus:ring-cyan-400/20 transition-all h-10 sm:h-11 text-sm sm:text-base" />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="login-password" className="text-white/90 text-xs sm:text-sm font-medium">
                      Senha
                    </Label>
                    <Input id="login-password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} disabled={isLoading} className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-cyan-400/50 focus:ring-cyan-400/20 transition-all h-10 sm:h-11 text-sm sm:text-base" />
                  </div>
                  <Button type="submit" className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-lg shadow-cyan-500/25 border-0 transition-all duration-300 h-10 sm:h-11 text-sm sm:text-base mt-1 sm:mt-2" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      <>
                        <LogIn className="mr-2 h-4 w-4" />
                        Entrar
                      </>
                    )}
                  </Button>
                  
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(true)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2 w-full text-center mt-2 transition-colors"
                  >
                    Esqueceu sua senha?
                  </button>
                </form>
              </TabsContent>
              
              <TabsContent value="signup" className="mt-4 sm:mt-6">
                <form onSubmit={handleSignUp} className="space-y-3 sm:space-y-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="signup-email" className="text-white/90 text-xs sm:text-sm font-medium">
                      Email
                    </Label>
                    <Input id="signup-email" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} disabled={isLoading} className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-cyan-400/50 focus:ring-cyan-400/20 transition-all h-10 sm:h-11 text-sm sm:text-base" />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="signup-password" className="text-white/90 text-xs sm:text-sm font-medium">
                      Senha
                    </Label>
                    <Input id="signup-password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} disabled={isLoading} className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-cyan-400/50 focus:ring-cyan-400/20 transition-all h-10 sm:h-11 text-sm sm:text-base" />
                    {password && (
                      <div className="mt-2 space-y-1 text-xs">
                        {(() => {
                          const checks = validatePassword(password);
                          return (
                            <>
                              <div className={`flex items-center gap-1.5 ${checks.minLength ? 'text-green-400' : 'text-white/50'}`}>
                                {checks.minLength ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                Mínimo 8 caracteres
                              </div>
                              <div className={`flex items-center gap-1.5 ${checks.hasUppercase ? 'text-green-400' : 'text-white/50'}`}>
                                {checks.hasUppercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                Letra maiúscula
                              </div>
                              <div className={`flex items-center gap-1.5 ${checks.hasNumber ? 'text-green-400' : 'text-white/50'}`}>
                                {checks.hasNumber ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                Número
                              </div>
                              <div className={`flex items-center gap-1.5 ${checks.hasSpecial ? 'text-green-400' : 'text-white/50'}`}>
                                {checks.hasSpecial ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                Caractere especial
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <Button type="submit" className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-lg shadow-cyan-500/25 border-0 transition-all duration-300 h-10 sm:h-11 text-sm sm:text-base mt-1 sm:mt-2" disabled={isLoading || !isPasswordValid(password)}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Criando conta...
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Criar Conta
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Password Reset Modal */}
      {showResetPassword && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm bg-slate-900/95 border-slate-700 animate-fade-in">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetPassword(false)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-white/70" />
                </button>
                <h2 className="text-xl font-bold text-white">Recuperar Senha</h2>
              </div>
              <p className="text-slate-400 text-sm mt-2">
                Informe seu email para receber um link de recuperação
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowResetPassword(false)}
                    className="flex-1 border-slate-700 text-white hover:bg-slate-800"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isLoading || !resetEmail}
                    className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
