"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthCard, authFieldProps } from "@/components/auth/AuthCard";
import { CtaButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { login } from "@/lib/api/auth";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { colors, darkTheme, spacing } from "@/styles/tokens";

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let hasError = false;

    setEmailError(undefined);
    setPasswordError(undefined);
    setFormError(undefined);

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
      router.push("/verify-2fa");
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setEmailError(error.errors.email);
        setPasswordError(error.errors.password);
      } else if (error instanceof ApiError && error.status === 401) {
        setFormError(error.message);
      } else if (error instanceof ApiError && error.status === 429) {
        // A code went out under a minute ago and its cookie is usually still good.
        router.push("/verify-2fa");
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
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

        <CtaButton type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </CtaButton>
      </form>
    </AuthCard>
  );
}
