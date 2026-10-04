"use client";

import { FormEvent, useState } from "react";

import { AuthCard, authFieldProps } from "@/components/auth/AuthCard";
import { CtaButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { spacing } from "@/styles/tokens";

export function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [identifierError, setIdentifierError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let hasError = false;

    setIdentifierError(undefined);
    setPasswordError(undefined);

    if (!identifier.trim()) {
      setIdentifierError("Please enter your account identifier.");
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
      // SCRUM-173:
      // Connect this form to Hashem's authentication mock once
      // its exact request/response contract is confirmed.
      console.log("Login submitted", {
        identifier: identifier.trim(),
      });
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
        <Input
          label="Account identifier"
          name="identifier"
          autoComplete="username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          error={identifierError}
          placeholder="Enter your account identifier"
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

        <CtaButton type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </CtaButton>
      </form>
    </AuthCard>
  );
}
