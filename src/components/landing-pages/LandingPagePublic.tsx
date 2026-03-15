import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { CheckCircle, Heart, Shield, Star, PawPrint, Loader2 } from 'lucide-react';
import orbepetLogo from '@/assets/orbepet-logo.png';

interface LandingPage {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cta_text: string;
  hero_image_url: string | null;
  lead_magnet_type: string;
  lead_magnet_title: string | null;
  lead_magnet_file_url: string | null;
  thank_you_message: string | null;
  benefits: any[];
  testimonials: any[];
}

const defaultBenefits = [
  { icon: 'shield', title: 'Cobertura Completa', description: 'Consultas, exames, internações e cirurgias para seu pet.' },
  { icon: 'heart', title: 'Sem Carência', description: 'Atendimento imediato após a contratação do plano.' },
  { icon: 'star', title: 'Rede Credenciada', description: 'Mais de 500 clínicas e hospitais veterinários parceiros.' },
];

const iconMap: Record<string, React.ReactNode> = {
  shield: <Shield className="w-6 h-6" />,
  heart: <Heart className="w-6 h-6" />,
  star: <Star className="w-6 h-6" />,
  paw: <PawPrint className="w-6 h-6" />,
};

export const LandingPagePublic: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState<LandingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leadMagnetUrl, setLeadMagnetUrl] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [petName, setPetName] = useState('');

  useEffect(() => {
    const fetchPage = async () => {
      if (!slug) { setNotFound(true); setLoading(false); return; }
      const { data, error } = await supabase
        .from('landing_pages')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();
      if (error || !data) { setNotFound(true); } else {
        setPage(data as unknown as LandingPage);
      }
      setLoading(false);
    };
    fetchPage();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email && !phone) return;
    setSubmitting(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/capture-lead`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name, email, phone, pet_name: petName,
            landing_page_slug: slug,
            utm_source: searchParams.get('utm_source') || page?.slug,
            utm_campaign: searchParams.get('utm_campaign'),
            utm_content: searchParams.get('utm_content'),
            utm_term: searchParams.get('utm_term'),
          }),
        }
      );
      const result = await response.json();
      if (result.success) {
        setSubmitted(true);
        if (result.lead_magnet_url) setLeadMagnetUrl(result.lead_magnet_url);
      }
    } catch (err) {
      console.error('Submission error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-[#6A0DAD]" />
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white text-gray-800 p-6">
        <img src={orbepetLogo} alt="OrbePet" className="w-16 h-16 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Página não encontrada</h1>
        <p className="text-gray-500">Esta landing page não existe ou não está ativa.</p>
      </div>
    );
  }

  const benefits = (page.benefits && page.benefits.length > 0) ? page.benefits : defaultBenefits;

  return (
    <div className="min-h-screen bg-white text-gray-800">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={orbepetLogo} alt="OrbePet" className="w-10 h-10" />
            <span className="font-bold text-lg text-[#6A0DAD]">OrbePet</span>
          </div>
          <a href="https://orbepet.com.br" target="_blank" rel="noopener noreferrer"
            className="text-sm text-[#6A0DAD] hover:underline font-medium">
            Conheça nossos planos →
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#6A0DAD]/5 via-white to-purple-50 py-12 md:py-20 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#6A0DAD]/10 text-[#6A0DAD] text-sm font-semibold px-3 py-1 rounded-full mb-4">
              <PawPrint className="w-4 h-4" />
              {page.lead_magnet_type === 'ebook' ? 'E-book Gratuito' :
               page.lead_magnet_type === 'guide' ? 'Guia Gratuito' :
               page.lead_magnet_type === 'checklist' ? 'Checklist Gratuito' : 'Material Gratuito'}
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-4">
              {page.title}
            </h1>
            {page.subtitle && (
              <p className="text-lg text-gray-600 mb-6 leading-relaxed">{page.subtitle}</p>
            )}
            {page.lead_magnet_title && (
              <p className="text-md font-medium text-[#6A0DAD] mb-4">
                📖 {page.lead_magnet_title}
              </p>
            )}
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 md:p-8">
            {submitted ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Pronto!</h3>
                <p className="text-gray-600 mb-4">{page.thank_you_message}</p>
                {leadMagnetUrl && (
                  <a href={leadMagnetUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#6A0DAD] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#5a0b91] transition-colors">
                    Baixar Material
                  </a>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-xl font-bold text-gray-900 mb-1">
                  {page.cta_text}
                </h3>
                <p className="text-sm text-gray-500 mb-4">Preencha seus dados para receber o material gratuitamente.</p>

                <div>
                  <Label htmlFor="name" className="text-gray-700">Seu nome</Label>
                  <Input id="name" placeholder="Maria Silva" value={name} onChange={e => setName(e.target.value)}
                    className="mt-1 border-gray-200 focus:border-[#6A0DAD] focus:ring-[#6A0DAD]/20 bg-white text-gray-900 placeholder:text-gray-400" required />
                </div>
                <div>
                  <Label htmlFor="email" className="text-gray-700">E-mail</Label>
                  <Input id="email" type="email" placeholder="maria@email.com" value={email} onChange={e => setEmail(e.target.value)}
                    className="mt-1 border-gray-200 focus:border-[#6A0DAD] focus:ring-[#6A0DAD]/20 bg-white text-gray-900 placeholder:text-gray-400" required />
                </div>
                <div>
                  <Label htmlFor="phone" className="text-gray-700">WhatsApp</Label>
                  <PhoneInput id="phone" placeholder="+55 11 99999-9999" value={phone} onChange={setPhone}
                    className="mt-1 border-gray-200 focus:border-[#6A0DAD] focus:ring-[#6A0DAD]/20 bg-white text-gray-900 placeholder:text-gray-400" />
                </div>
                <div>
                  <Label htmlFor="petName" className="text-gray-700">Nome do seu pet 🐾</Label>
                  <Input id="petName" placeholder="Rex, Luna, Mimi..." value={petName} onChange={e => setPetName(e.target.value)}
                    className="mt-1 border-gray-200 focus:border-[#6A0DAD] focus:ring-[#6A0DAD]/20 bg-white text-gray-900 placeholder:text-gray-400" />
                </div>

                <button type="submit" disabled={submitting}
                  className="w-full bg-[#6A0DAD] hover:bg-[#5a0b91] text-white font-bold py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-[#6A0DAD]/30 disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  {submitting ? 'Enviando...' : page.cta_text}
                </button>

                <p className="text-xs text-gray-400 text-center">
                  Seus dados estão seguros. Não enviamos spam.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-10">
            Por que cuidar da saúde do seu pet?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {benefits.map((b: any, i: number) => (
              <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-[#6A0DAD]/10 rounded-xl flex items-center justify-center text-[#6A0DAD] mb-4">
                  {iconMap[b.icon] || <PawPrint className="w-6 h-6" />}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{b.title}</h3>
                <p className="text-sm text-gray-600">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={orbepetLogo} alt="OrbePet" className="w-8 h-8" />
            <span className="font-bold text-white">OrbePet</span>
          </div>
          <p className="text-sm">© {new Date().getFullYear()} OrbePet. Todos os direitos reservados.</p>
          <a href="https://orbepet.com.br" target="_blank" rel="noopener noreferrer"
            className="text-sm text-purple-400 hover:text-purple-300">orbepet.com.br</a>
        </div>
      </footer>
    </div>
  );
};

export default LandingPagePublic;
