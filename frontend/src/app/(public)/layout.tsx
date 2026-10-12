"use client";

import { MotionConfig } from "framer-motion";
import { darkPageBackground, darkTheme } from "@/styles/tokens";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <div
        className="min-h-screen"
        style={{ background: darkPageBackground, color: darkTheme.text.primary }}
      >
        {children}
      </div>
    </MotionConfig>
  );
}
