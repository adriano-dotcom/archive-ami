import React from 'react';
import { Play } from 'lucide-react';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';

interface VideoThumbnailPreviewProps {
  videoUrl: string;
}

export function VideoThumbnailPreview({ videoUrl }: VideoThumbnailPreviewProps) {
  const { thumbnail, isLoading, error } = useVideoThumbnail(videoUrl);

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-7 h-5 bg-muted rounded animate-pulse" />
        <span>Vídeo</span>
      </span>
    );
  }

  if (error || !thumbnail) {
    return <span>🎬 Vídeo</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative w-7 h-5 rounded overflow-hidden flex-shrink-0">
        <img 
          src={thumbnail} 
          alt="Video preview" 
          className="w-full h-full object-cover"
        />
        <span className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <Play className="w-2.5 h-2.5 text-white fill-white" />
        </span>
      </span>
      <span>Vídeo</span>
    </span>
  );
}
