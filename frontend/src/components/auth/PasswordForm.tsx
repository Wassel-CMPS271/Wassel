"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthCard, authFieldProps } from "@/components/auth/AuthCard";
import { CtaButton } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { setPassword as savePassword } from "@/lib/api/auth";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { colors, spacing } from "@/styles/tokens";

type PasswordFormMode = "setup" | "reset";

const MIN_PASSWORD_LENGTH = 10;
const MISSING_TOKEN = "This link is missing its token. Open the link from your email again.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

interface PasswordFormProps {
  mode: PasswordFormMode;
  // From the ?token= of the emailed link.
  token?: string;
}

export function PasswordForm({ mode, token }: PasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [passwordError, setPasswordError] = useState<string>();
  const [confirmPasswordError, setConfirmPasswordError] =
    useState<string>();
  const [formError, setFormError] = useState<string>();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSetup = mode === "setup";
  const message = token ? formError : MISSING_TOKEN;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPasswordError(undefined);
    setConfirmPasswordError(undefined);
    setFormError(undefined);

    let hasError = false;

    if (!password) {
      setPasswordError("Please enter a new password.");
      hasError = true;
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      hasError = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Please confirm your new password.");
      hasError = true;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match.");
      hasError = true;
    }

    if (hasError || !token) {
      return;
    }

    setIsSubmitting(true);

    try {
      await savePassword(token, password);
      // Stay disabled after success: the page is still navigating, and a second
      // submit would only hit the used token and flash an error.
      router.replace("/login?passwordSet=1");
    } catch (error) {
      setIsSubmitting(false);
      if (error instanceof ApiValidationError) {
        // A message for a field this form doesn't show must not vanish.
        if (error.errors.password) setPasswordError(error.errors.password);
        else setFormError(GENERIC_ERROR);
      } else if (error instanceof ApiError && error.status === 400) {
        // One generic answer for a bad, expired or already used link.
        setFormError(error.message);
      } else {
        setFormError(GENERIC_ERROR);
      }
    }
  }

  return (
    <AuthCard
      title={isSetup ? "Set your password" : "Reset your password"}
      description={
        isSetup
          ? "Create a password to finish setting up your account."
          : "Enter a new password for your account."
      }
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing.md,
        }}
      >
        <PasswordInput
          label="New password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={passwordError}
          placeholder="Enter your new password"
          {...authFieldProps}
        />

        <PasswordInput
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={confirmPasswordError}
          placeholder="Confirm your new password"
          {...authFieldProps}
        />

        {message && (
          <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
            {message}
          </p>
        )}

        <CtaButton type="submit" disabled={isSubmitting || !token} className="w-full">
          {isSubmitting
            ? "Saving..."
            : isSetup
              ? "Set password"
              : "Reset password"}
        </CtaButton>
      </form>
    </AuthCard>
  );
}
