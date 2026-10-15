"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthCard, authFieldProps } from "@/components/auth/AuthCard";
import { CtaButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { forgotPassword } from "@/lib/api/auth";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const pending = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (sent) confirmation.current?.focus();
  }, [sent]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || sent) return;
    setEmailError(undefined);
    setFormError(undefined);
    const address = email.trim();
    if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setEmailError(address ? "Please enter a valid email address." : "Please enter your email.");
      emailInput.current?.focus();
      return;
    }
    pending.current = true;
    setIsSubmitting(true);
    try {
      await forgotPassword(address);
      setSent(true);
    } catch {
      // Never display backend details that might disclose account status.
      setFormError("Something went wrong. Please try again.");
    } finally {
      pending.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title="Forgot password?" description="Enter your email to request a password reset link.">
      <form onSubmit={handleSubmit} noValidate aria-busy={isSubmitting} className="flex flex-col" style={{ gap: spacing.md }}>
        <Input
          ref={emailInput}
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailError}
          disabled={isSubmitting || sent}
          placeholder="Enter your email"
          {...authFieldProps}
        />
        {sent && (
          <p ref={confirmation} tabIndex={-1} role="status" className={`text-sm ${focusRingClass}`} style={{ ...focusRingStyle, color: darkTheme.text.secondary }}>
            If an account with that email exists, you will receive an email with a link to set your password. Check your inbox and spam folder.
          </p>
        )}
        {formError && (
          <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>{formError}</p>
        )}
        <CtaButton disabled={isSubmitting || sent} className="w-full">
          {isSubmitting ? "Sending..." : sent ? "Request submitted" : "Send reset link"}
        </CtaButton>
        <Link
          href="/login"
          className={`inline-flex items-center self-start text-sm font-medium underline ${focusRingClass}`}
          style={{ ...focusRingStyle, color: colors.primary[300], minHeight: sizing.tapTarget, borderRadius: radius.md }}
        >
          Back to sign in
        </Link>
      </form>
    </AuthCard>
  );
}
