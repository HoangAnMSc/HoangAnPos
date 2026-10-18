import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { productThumbnailUrl } from "../../lib/productImage";
import { loadCachedProductImage } from "../../lib/productImageCache";

type Props = ImgHTMLAttributes<HTMLImageElement> & { thumbnailWidth?: number; cacheVersion?: string };

export function ProductThumbnail({ src, thumbnailWidth = 384, cacheVersion = "", onError, ...props }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [failedSource, setFailedSource] = useState<string>();
  const [loaded, setLoaded] = useState<{ key: string; url: string }>();
  const optimized = src && src !== failedSource ? productThumbnailUrl(src, thumbnailWidth) : src;
  const key = JSON.stringify([optimized, cacheVersion]);
  const eager = props.loading === "eager";
  useEffect(() => {
    if (!optimized) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    const load = async () => {
      const blob = await loadCachedProductImage(optimized, cacheVersion);
      if (cancelled) return;
      objectUrl = blob ? URL.createObjectURL(blob) : undefined;
      setLoaded({ key, url: objectUrl ?? optimized });
    };
    const observer = !eager && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            void load();
          }
        }, { rootMargin: "300px" })
      : null;
    if (observer && imageRef.current) observer.observe(imageRef.current);
    else void load();
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cacheVersion, eager, key, optimized]);
  return <img
    loading="lazy"
    decoding="async"
    {...props}
    ref={imageRef}
    src={loaded?.key === key ? loaded.url : undefined}
    onError={(event) => {
      if (optimized !== src) setFailedSource(src);
      onError?.(event);
    }}
  />;
}
