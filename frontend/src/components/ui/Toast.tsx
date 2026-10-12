"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

export interface ToastItem {
  id: string;
  message: string;
}

const TOAST_DURATION_MS = 3200;

// Shared toast for role areas outside head-of-transport. The vehicles page
// keeps its own copy (vehicles/Toast.tsx) so this ticket doesn't touch it;
// it can switch to this one whenever convenient.
export function useToastQueue() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  const pushToast = useCallback((message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      timers.current.delete(id);
    }, TOAST_DURATION_MS);
    timers.current.set(id, timer);
  }, []);

  return { toasts, pushToast };
}

// aria-live region announces each message as it's added; the visual
// card is decorative on top of that, so screen readers aren't affected
// by the entrance/exit animation itself.
export function ToastViewport({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div
      aria-live="polite"
      role="status"
      className="fixed z-50 flex flex-col pointer-events-none"
      style={{ bottom: spacing.lg, right: spacing.lg, gap: spacing.sm }}
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex items-center text-sm font-medium"
            style={{
              gap: spacing.sm,
              padding: `${spacing.sm} ${spacing.md}`,
              borderRadius: radius.md,
              backgroundColor: darkTheme.surface.card,
              border: `1px solid ${darkTheme.surface.cardBorder}`,
              boxShadow: darkTheme.surface.cardShadow,
              color: darkTheme.text.primary,
              maxWidth: "320px",
            }}
          >
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center flex-shrink-0 rounded-full"
              style={{ width: "20px", height: "20px", backgroundColor: "rgba(18, 183, 106, 0.16)" }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 6.5L5 9L9.5 3.5"
                  stroke={colors.success[500]}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            {toast.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
