"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface RevealProps {
  children: ReactNode;
  /** Position in a staggered group; each step adds 80ms. */
  index?: number;
  className?: string;
}

type Phase = "static" | "waiting" | "revealed";

// Entrance fade-slide for content below the fold. The server HTML is always
// visible (no JS, crawlers); only elements that start off screen are hidden
// after hydration and faded in when they scroll into view. The parent
// MotionConfig (reducedMotion="user") drops the slide and keeps the fade.
export function Reveal({ children, index = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("static");

  useEffect(() => {
    const element = ref.current;
    if (!element || element.getBoundingClientRect().top < window.innerHeight) return;
    setPhase("waiting");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPhase("revealed");
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={phase === "waiting" ? { opacity: 0, y: 16 } : { opacity: 1, y: 0 }}
      transition={
        phase === "revealed"
          ? { duration: 0.35, ease: "easeOut", delay: index * 0.08 }
          : { duration: 0 }
      }
    >
      {children}
    </motion.div>
  );
}
