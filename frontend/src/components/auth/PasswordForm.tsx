"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  darkTheme,
  spacing,
  typography,
} from "@/styles/tokens";

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
    <Card
      style={{
        width: "100%",
        maxWidth: "420px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing.lg,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              color: darkTheme.text.primary,
              fontSize: typography.fontSize["2xl"].size,
              lineHeight: typography.fontSize["2xl"].lineHeight,
              fontWeight: typography.fontWeight.bold,
            }}
          >
            {isSetup ? "Set your password" : "Reset your password"}
          </h1>

          <p
            style={{
              margin: `${spacing.sm} 0 0`,
              color: darkTheme.text.secondary,
              fontSize: typography.fontSize.sm.size,
              lineHeight: typography.fontSize.sm.lineHeight,
            }}
          >
            {isSetup
              ? "Create a password to finish setting up your account."
              : "Enter a new password for your account."}
          </p>
        </div>

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
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={passwordError}
            placeholder="Enter your new password"
          />

          <Input
            label="Confirm password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={confirmPasswordError}
            placeholder="Confirm your new password"
          />

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            style={{ width: "100%" }}
          >
            {isSubmitting
              ? "Saving..."
              : isSetup
                ? "Set password"
                : "Reset password"}
          </Button>
        </form>
      </div>
    </Card>
  );
}