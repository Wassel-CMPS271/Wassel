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
            Verify your account
          </h1>

          <p
            style={{
              margin: `${spacing.sm} 0 0`,
              color: darkTheme.text.secondary,
              fontSize: typography.fontSize.sm.size,
              lineHeight: typography.fontSize.sm.lineHeight,
            }}
          >
            Enter the verification code to continue.
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
            label="Verification code"
            name="verificationCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            error={codeError}
            placeholder="Enter verification code"
          />

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            style={{ width: "100%" }}
          >
            {isSubmitting ? "Verifying..." : "Verify"}
          </Button>
        </form>
      </div>
    </Card>
  );
}