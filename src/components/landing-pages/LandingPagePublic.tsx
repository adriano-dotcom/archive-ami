import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { CheckCircle, Heart, Shield, Star, PawPrint, Loader2, Award } from 'lucide-react';
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
  primary_color: string | null;
  secondary_color: string | null;
  button_style: string | null;
  form_fields: string[] | null;
  hero_bg_color: string | null;
  section_bg_color: string | null;
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
  check: <CheckCircle className="w-6 h-6" />,
  award: <Award className="w-6 h-6" />,
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

  // Meta Pixel
  useEffect(() => {
    const script = document.createElement('script');
    script.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','1235863101537115');fbq('track','PageView');`;
    document.head.appendChild(script);
    const noscript = document.createElement('noscript');
    const img = document.createElement('img');
    img.height = 1; img.width = 1; img.style.display = 'none';
    img.src = 'https://www.facebook.com/tr?id=1235863101537115&ev=PageView&noscript=1';
    noscript.appendChild(img);
    document.head.appendChild(noscript);
    return () => { document.head.removeChild(script); document.head.removeChild(noscript); };
  }, []);

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
        (window as any).fbq?.('track', 'Lead');
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

  const pc = page.primary_color || '#6A0DAD';
  const sc = page.secondary_color || '#F3E8FF';
  const buttonRadius = page.button_style === 'pill' ? '9999px' : page.button_style === 'square' ? '8px' : '12px';
  const benefits = (page.benefits && page.benefits.length > 0) ? page.benefits : defaultBenefits;
  const testimonials = Array.isArray(page.testimonials) ? page.testimonials : [];
  const formFields = Array.isArray(page.form_fields) ? page.form_fields : ['name', 'email', 'phone', 'pet_name'];
  const heroBg = page.hero_bg_color || '#FFFFFF';
  const sectionBg = page.section_bg_color || '#F9FAFB';

  return (
    <div className="min-h-screen bg-white text-gray-800">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={orbepetLogo} alt="OrbePet" className="w-10 h-10" />
            <span className="font-bold text-lg" style={{ color: pc }}>OrbePet</span>
          </div>
          <a href="https://orbepet.com.br" target="_blank" rel="noopener noreferrer"
            className="text-sm font-medium hover:underline" style={{ color: pc }}>
            Conheça nossos planos →
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="py-12 md:py-20 px-4" style={{ backgroundColor: heroBg, background: `linear-gradient(135deg, ${pc}08, ${heroBg}, ${sc})` }}>
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
          <div>
            {page.hero_image_url && (
              <img src={page.hero_image_url} alt={page.title} className="rounded-xl mb-6 max-h-72 object-cover w-full" />
            )}
            <div className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-1 rounded-full mb-4"
              style={{ backgroundColor: `${pc}15`, color: pc }}>
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
              <p className="text-md font-medium mb-4" style={{ color: pc }}>
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
                    className="inline-flex items-center gap-2 text-white px-6 py-3 font-semibold transition-colors"
                    style={{ backgroundColor: pc, borderRadius: buttonRadius }}>
                    Baixar Material
                  </a>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-xl font-bold text-gray-900 mb-1">{page.cta_text}</h3>
                <p className="text-sm text-gray-500 mb-4">Preencha seus dados para receber o material gratuitamente.</p>

                {formFields.includes('name') && (
                  <div>
                    <Label htmlFor="name" className="text-gray-700">Seu nome</Label>
                    <Input id="name" placeholder="Maria Silva" value={name} onChange={e => setName(e.target.value)}
                      className="mt-1 border-gray-200 bg-white text-gray-900 placeholder:text-gray-400"
                      style={{ '--tw-ring-color': `${pc}33` } as any} required />
                  </div>
                )}
                {formFields.includes('email') && (
                  <div>
                    <Label htmlFor="email" className="text-gray-700">E-mail</Label>
                    <Input id="email" type="email" placeholder="maria@email.com" value={email} onChange={e => setEmail(e.target.value)}
                      className="mt-1 border-gray-200 bg-white text-gray-900 placeholder:text-gray-400" required />
                  </div>
                )}
                {formFields.includes('phone') && (
                  <div>
                    <Label htmlFor="phone" className="text-gray-700">WhatsApp</Label>
                    <PhoneInput id="phone" placeholder="+55 11 99999-9999" value={phone} onChange={setPhone}
                      className="mt-1 border-gray-200 bg-white text-gray-900 placeholder:text-gray-400" />
                  </div>
                )}
                {formFields.includes('pet_name') && (
                  <div>
                    <Label htmlFor="petName" className="text-gray-700">Nome do seu pet 🐾</Label>
                    <Input id="petName" placeholder="Rex, Luna, Mimi..." value={petName} onChange={e => setPetName(e.target.value)}
                      className="mt-1 border-gray-200 bg-white text-gray-900 placeholder:text-gray-400" />
                  </div>
                )}

                <button type="submit" disabled={submitting}
                  className="w-full text-white font-bold py-3.5 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: pc, borderRadius: buttonRadius, boxShadow: `0 8px 24px -8px ${pc}50` }}>
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
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${pc}15`, color: pc }}>
                  {iconMap[b.icon] || <PawPrint className="w-6 h-6" />}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{b.title}</h3>
                <p className="text-sm text-gray-600">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <section className="py-16 px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-10">
              O que dizem nossos clientes
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((t: any, i: number) => (
                <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <p className="text-gray-600 mb-4 italic leading-relaxed">"{t.text}"</p>
                  <div className="flex items-center gap-3">
                    {t.avatar ? (
                      <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: pc }}>
                        {(t.name || '?')[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="font-semibold text-gray-900">{t.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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

      {/* Floating WhatsApp Button */}
      <a
        href={`https://wa.me/5543991562099?text=${encodeURIComponent(`Olá! Vim pela página "${page.title}" e gostaria de saber mais sobre os planos OrbePet 🐾`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 bg-[#25D366] hover:bg-[#1da851] text-white rounded-full w-14 h-14 md:w-16 md:h-16 flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 animate-pulse hover:animate-none"
        aria-label="Fale conosco no WhatsApp"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 md:w-8 md:h-8">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>
    </div>
  );
};

export default LandingPagePublic;
