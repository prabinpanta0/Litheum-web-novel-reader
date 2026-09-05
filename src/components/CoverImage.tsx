import { useEffect, useState } from 'react';
import { initials } from '@/util/id';

/**
 * CoverImage
 *
 * Renders a novel cover that degrades gracefully: if the source URL is
 * missing or fails to load, it swaps itself for a quiet initials fallback.
 * Covers are loaded with `referrerpolicy="no-referrer"` so hotlink guards on
 * source CDNs don't reject requests that carry the app's own origin.
 */
interface CoverImageProps {
  src?: string | null;
  name: string;
  imgClassName?: string;
  fallbackClassName?: string;
  alt?: string;
}

export default function CoverImage({
  src,
  name,
  imgClassName,
  fallbackClassName,
  alt,
}: CoverImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <span
        className={
          fallbackClassName
            ? `${fallbackClassName} cover-fallback`
            : 'cover-fallback'
        }
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <img
      className={imgClassName}
      src={src}
      alt={alt ?? ''}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
