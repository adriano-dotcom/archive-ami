import React from 'react';
import { Video, ArrowLeft, Construction } from 'lucide-react';
import { Button } from './Button';
import { useParams, useNavigate } from 'react-router-dom';

const MeetingRoom: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-screen w-full bg-background text-foreground relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-cyan-900/20 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-violet-900/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2"></div>

      <div className="relative z-10 flex flex-col items-center max-w-md w-full p-8">
        <div className="w-24 h-24 bg-card rounded-full flex items-center justify-center mb-8 shadow-2xl border border-border relative group">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl group-hover:bg-primary/30 transition-all duration-1000"></div>
            <Video className="w-10 h-10 text-primary relative z-10" />
            <div className="absolute bottom-0 right-0 bg-background rounded-full p-1.5 border border-border">
                <Construction className="w-4 h-4 text-amber-500" />
            </div>
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-2 text-center">Sala de Reunião</h1>
        <p className="text-muted-foreground text-center mb-6 leading-relaxed">
          O módulo de vídeo conferência está em desenvolvimento. A integração com a API de streaming será implementada em breve.
        </p>

        <div className="bg-card/50 border border-border rounded-lg p-4 w-full mb-8 flex flex-col items-center">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-1">ID da Sessão</span>
            <code className="text-primary font-mono text-lg">{id || 'Desconhecido'}</code>
        </div>

        <Button onClick={() => navigate('/scheduling')} size="lg" className="w-full shadow-lg shadow-cyan-500/20">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Voltar para Plataforma
        </Button>
      </div>
    </div>
  );
};

export default MeetingRoom;
