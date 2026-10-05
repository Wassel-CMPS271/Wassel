"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthCard, authFieldProps } from "@/components/auth/AuthCard";
import { CtaButton } from "@/components/ui/Button";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { login } from "@/lib/api/auth";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";

const GENERIC_ERROR = "Something went wrong. Please try again.";

// A 429 only comes after a correct password: a code went out under a minute
// ago. It sets no cookie, so that code may not belong to this browser. Say so
// and offer the code step, rather than sending the user there blind.
const CODE_ALREADY_SENT =
  "A sign-in code was sent less than a minute ago. Enter it, or wait a minute and sign in again.";

const NOTICES = {
  expired: "Your sign-in has expired. Please sign in again.",
  passwordSet: "Your password is set. Sign in to continue.",
};

interface LoginFormProps {
  notice?: keyof typeof NOTICES;
}

export function LoginForm({ notice }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [codeAlreadySent, setCodeAlreadySent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let hasError = false;

    setEmailError(undefined);
    setPasswordError(undefined);
    setFormError(undefined);
    setCodeAlreadySent(false);

    if (!email.trim()) {
      setEmailError("Please enter your email.");
      hasError = true;
    }

    if (!password) {
      setPasswordError("Please enter your password.");
      hasError = true;
    }

    if (hasError) {
      return;
    }

    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
      // Stay disabled after success: the page is still navigating, and a second
      // submit would only be refused (429).
      router.push("/verify-2fa");
    } catch (error) {
      setIsSubmitting(false);
      if (error instanceof ApiValidationError) {
        const { email: emailMessage, password: passwordMessage } = error.errors;
        setEmailError(emailMessage);
        setPasswordError(passwordMessage);
        // A message for a field this form doesn't show must not vanish.
        if (!emailMessage && !passwordMessage) setFormError(GENERIC_ERROR);
      } else if (error instanceof ApiError && error.status === 401) {
        setFormError(error.message);
      } else if (error instanceof ApiError && error.status === 429) {
        setFormError(CODE_ALREADY_SENT);
        setCodeAlreadySent(true);
      } else {
        setFormError(GENERIC_ERROR);
      }
    }
  }

  return (
    <AuthCard title="Sign in to Wassel" description="Use your account credentials to continue.">
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing.md,
        }}
        noValidate
      >
        {notice && (
          <p role="status" className="text-sm" style={{ color: darkTheme.text.secondary }}>
            {NOTICES[notice]}
          </p>
        )}

        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailError}
          placeholder="Enter your email"
          {...authFieldProps}
        />

        <PasswordInput
          label="Password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={passwordError}
          placeholder="Enter your password"
          {...authFieldProps}
        />

        {formError && (
          <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
            {formError}
          </p>
        )}

        {codeAlreadySent && (
          <Link
            href="/verify-2fa"
            className={`inline-flex items-center self-start text-sm font-medium underline ${focusRingClass}`}
            style={{
              ...focusRingStyle,
              color: colors.primary[300],
              minHeight: sizing.tapTarget,
              borderRadius: radius.md,
            }}
          >
            Enter the code you were sent
          </Link>
        )}

        <CtaButton type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </CtaButton>
      </form>
    </AuthCard>
  );
}
