"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthCard, authFieldProps } from "@/components/auth/AuthCard";
import { Button, CtaButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ROLE_HOME, resendCode, verifyCode } from "@/lib/api/auth";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { colors, darkTheme, spacing } from "@/styles/tokens";

const GENERIC_ERROR = "Something went wrong. Please try again.";

// The server allows a new code once a minute per account, and the login that
// brought the user here has just sent one.
const RESEND_LOCK_MS = 60_000;

export function TwoFactorForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [resendNotice, setResendNotice] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendLocked, setResendLocked] = useState(true);
  const lockTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    lockTimer.current = setTimeout(() => setResendLocked(false), RESEND_LOCK_MS);
    return () => clearTimeout(lockTimer.current);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setCodeError(undefined);
    setFormError(undefined);
    setResendNotice(undefined);

    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setCodeError("Enter the 6-digit code.");
      return;
    }

    setIsSubmitting(true);

    try {
      const user = await verifyCode(trimmed);
      // Stay disabled after success: the page is still navigating, and a second
      // submit would be refused (the code is used and the pending cookie is gone),
      // and its 401 would race this redirect and bounce a signed-in user to /login.
      router.replace(ROLE_HOME[user.role]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // The pending login is gone. Leave the button disabled while leaving.
        router.replace("/login?expired=1");
        return;
      }
      setIsSubmitting(false);
      if (error instanceof ApiValidationError) {
        // A message for a field this form doesn't show must not vanish.
        if (error.errors.code) setCodeError(error.errors.code);
        else setFormError(GENERIC_ERROR);
      } else if (error instanceof ApiError && error.status === 400) {
        // Wrong or expired code: stay and retry, or ask for a new one.
        setCodeError(error.message);
      } else {
        setFormError(GENERIC_ERROR);
      }
    }
  }

  async function handleResend() {
    setFormError(undefined);
    setResendNotice(undefined);
    setIsResending(true);

    try {
      await resendCode();
      setResendNotice("A new code is on its way. Your old code no longer works.");
      setResendLocked(true);
      clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(() => setResendLocked(false), RESEND_LOCK_MS);
      // The button disables itself, which would drop keyboard focus to the page.
      codeInput.current?.focus();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login?expired=1");
      } else if (error instanceof ApiError && error.status === 429) {
        setFormError(error.message);
      } else {
        setFormError(GENERIC_ERROR);
      }
    } finally {
      setIsResending(false);
    }
  }

  return (
    <AuthCard title="Verify your account" description="Enter the verification code to continue.">
      <form
        onSubmit={handleSubmit}
        noValidate
        style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing.md,
        }}
      >
        <Input
          ref={codeInput}
          label="Verification code"
          name="verificationCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          error={codeError}
          placeholder="Enter verification code"
          {...authFieldProps}
        />

        {resendNotice && (
          <p role="status" className="text-sm" style={{ color: darkTheme.text.secondary }}>
            {resendNotice}
          </p>
        )}

        {formError && (
          <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
            {formError}
          </p>
        )}

        <CtaButton type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Verifying..." : "Verify"}
        </CtaButton>

        <Button
          variant="ghost"
          onClick={handleResend}
          disabled={resendLocked || isResending}
          aria-describedby={resendLocked ? "resend-help" : undefined}
          className={`w-full ${authFieldProps.className}`}
          style={authFieldProps.style}
        >
          {isResending ? "Sending..." : "Send a new code"}
        </Button>
        {resendLocked && (
          <p id="resend-help" className="text-sm" style={{ color: darkTheme.text.secondary }}>
            You can ask for a new code after a minute.
          </p>
        )}
      </form>
    </AuthCard>
  );
}
