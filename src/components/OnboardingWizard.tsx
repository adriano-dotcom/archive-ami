import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Button } from '@/components/Button';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { StepIdentity } from './onboarding/StepIdentity';
import { StepWhatsApp } from './onboarding/StepWhatsApp';
import { StepAgent } from './onboarding/StepAgent';
import { StepFinish } from './onboarding/StepFinish';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import PromptGeneratorSheet from './settings/PromptGeneratorSheet';

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

// Premium cinematic step transitions with blur + scale
const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
    scale: 0.9,
    filter: 'blur(10px)',
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
    scale: 0.9,
    filter: 'blur(10px)',
  }),
};

// Modal animations
const modalVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 30 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.9, y: 30 },
};

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

// Animated checkmark SVG component with draw effect
const AnimatedCheckmark = () => (
  <motion.svg 
    viewBox="0 0 24 24" 
    className="w-4 h-4"
    initial="hidden"
    animate="visible"
  >
    <motion.path
      d="M5 13l4 4L19 7"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      variants={{
        hidden: { pathLength: 0, opacity: 0 },
        visible: { 
          pathLength: 1, 
          opacity: 1,
          transition: { 
            pathLength: { duration: 0.4, ease: "easeOut" },
            opacity: { duration: 0.1 }
          }
        }
      }}
    />
  </motion.svg>
);

// Step circle component (without label)
const StepCircle = ({ 
  index, 
  activeStep, 
  onClick 
}: { 
  index: number; 
  activeStep: number; 
  onClick: () => void;
}) => {
  const isCompleted = index < activeStep;
  const isActive = index === activeStep;

  return (
    <motion.button
      onClick={onClick}
      className="relative z-10 flex-shrink-0"
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.95 }}
    >
      {/* Outer glow ring for active step */}
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-full bg-cyan-500/30"
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.5, 0, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{ margin: '-4px' }}
        />
      )}
      
      {/* Main circle */}
      <motion.div
        className={`
          relative flex items-center justify-center w-10 h-10 rounded-full 
          border-2 transition-colors duration-300
          ${isCompleted 
            ? 'bg-gradient-to-br from-cyan-400 to-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-500/40' 
            : isActive 
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/20' 
              : 'border-slate-700 text-slate-500 bg-slate-800/50'
          }
        `}
        animate={isActive ? {
          boxShadow: [
            '0 0 0px rgba(6,182,212,0.4)',
            '0 0 25px rgba(6,182,212,0.6)',
            '0 0 0px rgba(6,182,212,0.4)',
          ],
        } : {}}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        {isCompleted ? (
          <AnimatedCheckmark />
        ) : (
          <motion.span 
            key={index}
            className="text-sm font-semibold"
            initial={{ rotateY: -90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {index + 1}
          </motion.span>
        )}
      </motion.div>
    </motion.button>
  );
};

// Connecting line between steps (inline with circles)
const ConnectingLine = ({ isCompleted }: { isCompleted: boolean }) => (
  <div className="relative flex-1 h-0.5 mx-2 bg-slate-700/50 rounded-full overflow-hidden self-center">
    <motion.div
      className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-cyan-500"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: isCompleted ? 1 : 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{ transformOrigin: 'left' }}
    />
    {isCompleted && (
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
        animate={{ x: ['-100%', '200%'] }}
        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
      />
    )}
  </div>
);

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ isOpen, onClose }) => {
  const { steps, currentStep, refetch, markWizardSeen } = useOnboardingStatus();
  const [activeStep, setActiveStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showPromptGenerator, setShowPromptGenerator] = useState(false);

  // Form state
  const [companyName, setCompanyName] = useState('');
  const [sdrName, setSdrName] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [aiModelMode, setAiModelMode] = useState('flash');
  
  // WABA registration status
  const [registrationStatus, setRegistrationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [registrationError, setRegistrationError] = useState('');
  
  // Connection test state
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [connectionTestStatus, setConnectionTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionTestError, setConnectionTestError] = useState('');

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  // Load initial data
  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase
        .from('nina_settings')
        .select('*')
        .maybeSingle();

      if (data) {
        setCompanyName(data.company_name || '');
        setSdrName(data.sdr_name || '');
        setAccessToken(data.whatsapp_access_token || '');
        setPhoneNumberId(data.whatsapp_phone_number_id || '');
        setVerifyToken(data.whatsapp_verify_token || '');
        setWabaId(data.whatsapp_waba_id || '');
        setSystemPrompt(data.system_prompt_override || '');
        setAiModelMode(data.ai_model_mode || 'flash');
      }
    };

    if (isOpen) {
      loadSettings();
      setActiveStep(currentStep);
      setRegistrationStatus('idle');
      setRegistrationError('');
      setConnectionTestStatus('idle');
      setConnectionTestError('');
    }
  }, [isOpen, currentStep]);

  const saveSettings = useCallback(async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from('nina_settings')
        .select('id')
        .maybeSingle();

      const settings = {
        company_name: companyName || null,
        sdr_name: sdrName || null,
        whatsapp_access_token: accessToken || null,
        whatsapp_phone_number_id: phoneNumberId || null,
        whatsapp_verify_token: verifyToken || null,
        whatsapp_waba_id: wabaId || null,
        system_prompt_override: systemPrompt || null,
        ai_model_mode: aiModelMode,
      };

      if (existing) {
        await supabase
          .from('nina_settings')
          .update(settings)
          .eq('id', existing.id);
      } else {
        await supabase
          .from('nina_settings')
          .insert(settings);
      }

      await refetch();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  }, [companyName, sdrName, accessToken, phoneNumberId, verifyToken, wabaId, systemPrompt, aiModelMode, refetch]);

  const registerWaba = useCallback(async (): Promise<boolean> => {
    if (!wabaId || !accessToken) {
      return true; // Skip if no WABA ID configured
    }

    setRegistrationStatus('loading');
    setRegistrationError('');

    try {
      const { data, error } = await supabase.functions.invoke('register-whatsapp-number', {});

      if (error) {
        throw error;
      }

      if (data?.success) {
        setRegistrationStatus('success');
        toast.success('WhatsApp configurado e registrado com sucesso!');
        return true;
      } else {
        throw new Error(data?.error || 'Erro desconhecido ao registrar WABA');
      }
    } catch (error: any) {
      console.error('Error registering WABA:', error);
      setRegistrationStatus('error');
      setRegistrationError(error.message || 'Erro ao registrar WABA');
      toast.error('Erro ao registrar WABA. Você pode continuar e tentar novamente depois.');
      return false;
    }
  }, [wabaId, accessToken]);

  const testConnection = useCallback(async () => {
    if (!accessToken || !phoneNumberId || !testPhoneNumber) {
      toast.error('Preencha as credenciais e o número de teste');
      return;
    }

    // Save settings first so edge function can read them
    await saveSettings();

    setConnectionTestStatus('testing');
    setConnectionTestError('');

    try {
      const { data, error } = await supabase.functions.invoke('test-whatsapp-message', {
        body: {
          phone_number: testPhoneNumber,
          message: '🧪 Teste de conexão do WhatsApp - Sistema CRM Jacometo'
        }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        setConnectionTestStatus('success');
        toast.success('Mensagem de teste enviada com sucesso!');
      } else {
        throw new Error(data?.error || 'Erro desconhecido ao enviar mensagem');
      }
    } catch (error: any) {
      console.error('Error testing connection:', error);
      setConnectionTestStatus('error');
      setConnectionTestError(error.message || 'Erro ao testar conexão');
      toast.error('Falha ao enviar mensagem de teste');
    }
  }, [accessToken, phoneNumberId, testPhoneNumber, saveSettings]);

  const handleNext = async () => {
    await saveSettings();
    
    // If leaving WhatsApp step (step 1), try to register WABA
    if (activeStep === 1 && wabaId && accessToken) {
      await registerWaba();
    }
    
    if (activeStep < steps.length - 1) {
      setDirection(1);
      setActiveStep(activeStep + 1);
    }
  };

  const handlePrev = () => {
    if (activeStep > 0) {
      setDirection(-1);
      setActiveStep(activeStep - 1);
    }
  };

  const handleStepClick = (index: number) => {
    setDirection(index > activeStep ? 1 : -1);
    setActiveStep(index);
  };

  const fireConfetti = () => {
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999,
    };

    function fire(particleRatio: number, opts: any) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 45 });
  };

  const handleComplete = async () => {
    await saveSettings();
    markWizardSeen();
    fireConfetti();
    toast.success('Configuração concluída! Bem-vindo ao sistema.');
    onClose();
  };

  const handlePromptGenerated = (prompt: string) => {
    setSystemPrompt(prompt);
    setShowPromptGenerator(false);
  };

  const renderStep = () => {
    switch (activeStep) {
      case 0:
        return (
          <StepIdentity
            companyName={companyName}
            sdrName={sdrName}
            onCompanyNameChange={setCompanyName}
            onSdrNameChange={setSdrName}
          />
        );
      case 1:
        return (
          <StepWhatsApp
            accessToken={accessToken}
            phoneNumberId={phoneNumberId}
            verifyToken={verifyToken}
            wabaId={wabaId}
            testPhoneNumber={testPhoneNumber}
            onAccessTokenChange={setAccessToken}
            onPhoneNumberIdChange={setPhoneNumberId}
            onVerifyTokenChange={setVerifyToken}
            onWabaIdChange={setWabaId}
            onTestPhoneNumberChange={setTestPhoneNumber}
            onTestConnection={testConnection}
            webhookUrl={webhookUrl}
            registrationStatus={registrationStatus}
            registrationError={registrationError}
            connectionTestStatus={connectionTestStatus}
            connectionTestError={connectionTestError}
          />
        );
      case 2:
        return (
          <StepAgent
            systemPrompt={systemPrompt}
            aiModelMode={aiModelMode}
            onSystemPromptChange={setSystemPrompt}
            onAiModelModeChange={setAiModelMode}
            onGeneratePrompt={() => setShowPromptGenerator(true)}
          />
        );
      case 3:
        return (
          <StepFinish
            steps={steps}
            companyName={companyName}
            sdrName={sdrName}
            onComplete={handleComplete}
          />
        );
      default:
        return null;
    }
  };

  const progressPercentage = ((activeStep + 1) / steps.length) * 100;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop with blur */}
            <motion.div 
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
              onClick={onClose}
            />

            {/* Modal */}
            <motion.div 
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ 
                duration: 0.4, 
                type: "spring", 
                stiffness: 260, 
                damping: 25 
              }}
              className="relative w-full max-w-2xl max-h-[90vh] mx-4 bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Gradient Progress Bar at top */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
                <motion.div
                  className="absolute top-0 h-full w-20 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={{ 
                    left: ['0%', '100%'],
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity,
                    ease: "linear"
                  }}
                />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between p-6 pt-7 border-b border-slate-800/50">
                <div className="flex items-center gap-3">
                  <motion.div
                    className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30"
                    animate={{ 
                      boxShadow: [
                        '0 0 0px rgba(6,182,212,0.3)',
                        '0 0 15px rgba(6,182,212,0.4)',
                        '0 0 0px rgba(6,182,212,0.3)',
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                  </motion.div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Configuração Inicial</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm text-slate-400">Passo</span>
                      <motion.span 
                        key={activeStep}
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="text-sm font-semibold text-cyan-400"
                      >
                        {activeStep + 1}
                      </motion.span>
                      <span className="text-sm text-slate-400">de {steps.length}</span>
                    </div>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>

              {/* Progress Steps */}
              <div className="px-6 py-5 border-b border-slate-800/30 bg-slate-900/50">
                {/* Row 1: Circles + Connecting Lines */}
                <div className="flex items-center justify-center max-w-md mx-auto">
                  {steps.map((step, index) => (
                    <React.Fragment key={step.id}>
                      <StepCircle
                        index={index}
                        activeStep={activeStep}
                        onClick={() => handleStepClick(index)}
                      />
                      {index < steps.length - 1 && (
                        <ConnectingLine isCompleted={index < activeStep} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
                
                {/* Row 2: Labels */}
                <div className="flex justify-between max-w-md mx-auto mt-3 px-1">
                  {steps.map((step, index) => (
                    <motion.span
                      key={step.id}
                      className={`
                        text-xs font-medium text-center w-16 truncate
                        transition-colors duration-300
                        ${index === activeStep 
                          ? 'text-cyan-400' 
                          : index < activeStep 
                            ? 'text-slate-400' 
                            : 'text-slate-600'
                        }
                      `}
                      animate={{
                        scale: index === activeStep ? 1.05 : 1,
                        y: index === activeStep ? -2 : 0,
                      }}
                      transition={{ duration: 0.2 }}
                    >
                      {step.title}
                    </motion.span>
                  ))}
                </div>
              </div>

              {/* Content with cinematic transitions */}
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar overflow-x-hidden">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={activeStep}
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                      x: { type: "spring", stiffness: 200, damping: 25 },
                      opacity: { duration: 0.3 },
                      scale: { duration: 0.3 },
                      filter: { duration: 0.3 },
                    }}
                  >
                    {renderStep()}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer with premium buttons */}
              {activeStep < steps.length - 1 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center justify-between p-6 border-t border-slate-800/50 bg-slate-900/80 backdrop-blur-sm"
                >
                  <motion.div
                    whileHover={{ scale: 1.02, x: -3 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      variant="ghost"
                      onClick={handlePrev}
                      disabled={activeStep === 0}
                      className="gap-2 group"
                    >
                      <motion.div
                        animate={{ x: [0, -3, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1 }}
                      >
                        <ChevronLeft className="w-4 h-4 group-hover:text-cyan-400 transition-colors" />
                      </motion.div>
                      Anterior
                    </Button>
                  </motion.div>

                  {/* Saving indicator */}
                  <AnimatePresence>
                    {isSaving && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-2 text-xs text-slate-400"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Loader2 className="w-3 h-3" />
                        </motion.div>
                        <motion.span
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          Salvando...
                        </motion.span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.div
                    whileHover={{ scale: 1.02, x: 3 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      variant="primary"
                      onClick={handleNext}
                      disabled={isSaving}
                      className="gap-2 group bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all"
                    >
                      Próximo
                      <motion.div
                        animate={{ x: [0, 3, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1 }}
                      >
                        <ChevronRight className="w-4 h-4 group-hover:text-white transition-colors" />
                      </motion.div>
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PromptGeneratorSheet
        open={showPromptGenerator}
        onOpenChange={setShowPromptGenerator}
        onPromptGenerated={handlePromptGenerated}
      />
    </>
  );
};
