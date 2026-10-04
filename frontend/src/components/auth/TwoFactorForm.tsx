"use client";

import { FormEvent, useState } from "react";

import { AuthCard, authFieldProps } from "@/components/auth/AuthCard";
import { CtaButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { spacing } from "@/styles/tokens";

export function TwoFactorForm() {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setCodeError(undefined);

    if (!code.trim()) {
      setCodeError("Please enter your verification code.");
      return;
    }

    setIsSubmitting(true);

    try {
      // SCRUM-175:
      // Connect to Hashem's 2FA verification contract
      // once the backend endpoint and payload are available.
    } finally {
      setIsSubmitting(false);
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

        <CtaButton type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Verifying..." : "Verify"}
        </CtaButton>
      </form>
    </AuthCard>
  );
}
