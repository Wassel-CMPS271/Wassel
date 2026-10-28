"use client";

import { MotionConfig } from "framer-motion";
import { inviteHeadOfTransport } from "@/lib/api/headOfTransport";
import { HeadOfTransportForm } from "./HeadOfTransportForm";
import { ToastViewport, useToastQueue } from "@/components/ui/Toast";
import { colors, darkTheme, spacing } from "@/styles/tokens";

export default function HeadOfTransportPage() {
  const { toasts, pushToast } = useToastQueue();

  // Errors propagate to the form, which shows them next to the field.
  async function handleInvite(email: string) {
    await inviteHeadOfTransport(email);
    pushToast("Invite sent.");
  }

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="mx-auto flex flex-col"
        style={{ padding: spacing.xl, gap: spacing.xl, maxWidth: "768px" }}
      >
        <header>
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: colors.accent[300], marginBottom: spacing.xs }}
          >
            School settings
          </p>
          <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
            Invite a head of transportation
          </h1>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
            Send an invite so they can set up their account and start managing routes, drivers,
            and vehicles.
          </p>
        </header>

        <HeadOfTransportForm onInvite={handleInvite} />
      </main>

      <ToastViewport toasts={toasts} />
    </MotionConfig>
  );
}
