"use client";

import { FormEvent, useState } from "react";

import { AuthCard, authFieldProps } from "@/components/auth/AuthCard";
import { CtaButton } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { spacing } from "@/styles/tokens";

type PasswordFormMode = "setup" | "reset";

interface PasswordFormProps {
  mode: PasswordFormMode;
}

export function PasswordForm({ mode }: PasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [passwordError, setPasswordError] = useState<string>();
  const [confirmPasswordError, setConfirmPasswordError] =
    useState<string>();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSetup = mode === "setup";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPasswordError(undefined);
    setConfirmPasswordError(undefined);

    let hasError = false;

    if (!password) {
      setPasswordError("Please enter a new password.");
      hasError = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Please confirm your new password.");
      hasError = true;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match.");
      hasError = true;
    }

    if (hasError) {
      return;
    }

    setIsSubmitting(true);

    try {
      // SCRUM-174:
      // Backend integration will be added once Hashem's
      // password setup/reset contract is available.
    } finally {
      setIsSubmitting(false);
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

        <CtaButton type="submit" disabled={isSubmitting} className="w-full">
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
