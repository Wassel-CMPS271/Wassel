"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { useReducedMotion } from "framer-motion";

interface AmbientVideoProps {
  /** Path without extension; expects `${src}.webm` and `${src}.mp4`. */
  src: string;
  /** First frame of the clip, shown by the <video> before it plays. */
  poster: string;
  /** Shown under the video, and on its own when reduced motion is on. */
  fallbackImage: string;
  sizes: string;
  priority?: boolean;
  /** Fade out over the last second so the loop restart isn't a hard cut. */
  fadeAtEnd?: boolean;
  /** CSS object-position for the image and video, to keep the subject in frame on narrow screens. */
  mediaPosition?: string;
  /** Rendered between the video and the content (e.g. a scrim). */
  overlay?: ReactNode;
  /** Content laid over the media. */
  children?: ReactNode;
  className?: string;
}

// Muted decorative loop with no controls. Plays continuously while on
// screen, pauses off screen, and never plays when the user prefers reduced
// motion (then only the still image shows).
export function AmbientVideo({
  src,
  poster,
  fallbackImage,
  sizes,
  priority = false,
  fadeAtEnd = false,
  mediaPosition = "center",
  overlay,
  children,
  className = "",
}: AmbientVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduceMotion = useReducedMotion();
  // A priority (above-the-fold) video starts as visible instead of waiting for the observer.
  const [inView, setInView] = useState(priority);
  const [nearEnd, setNearEnd] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.25,
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reduceMotion || !inView) {
      video.pause();
    } else {
      // Autoplay can still be refused (e.g. battery saver); the poster stays.
      video.play().catch(() => {});
    }
  }, [reduceMotion, inView]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-0">
        <Image
          src={fallbackImage}
          alt=""
          fill
          priority={priority}
          sizes={sizes}
          unoptimized
          className="object-cover"
          style={{ objectPosition: mediaPosition }}
        />
        <video
          ref={videoRef}
          aria-hidden="true"
          tabIndex={-1}
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
          onTimeUpdate={
            fadeAtEnd
              ? (event) => {
                  const { duration, currentTime } = event.currentTarget;
                  setNearEnd(duration - currentTime < 1.2);
                }
              : undefined
          }
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-out motion-reduce:hidden"
          style={{ opacity: nearEnd ? 0 : 1, objectPosition: mediaPosition }}
        >
          <source src={`${src}.webm`} type="video/webm" />
          <source src={`${src}.mp4`} type="video/mp4" />
        </video>
        {overlay}
      </div>
      {children}
    </div>
  );
}
