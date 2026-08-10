import React from 'react';
import { useResolvedMediaUrl } from '@/lib/mediaUrl';

interface SignedMediaProps {
  url: string | null | undefined;
  children: (resolvedUrl: string | null) => React.ReactNode;
}

/**
 * Render-prop que entrega a URL de mídia pronta para uso.
 * Buckets privados (whatsapp-media, nina-audio) são assinados sob demanda.
 */
export const SignedMedia: React.FC<SignedMediaProps> = ({ url, children }) => {
  const resolved = useResolvedMediaUrl(url);
  return <>{children(resolved)}</>;
};

export default SignedMedia;
