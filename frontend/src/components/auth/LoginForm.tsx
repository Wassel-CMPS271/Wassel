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
            Sign in to Wassel
          </h1>

          <p
            style={{
              margin: `${spacing.sm} 0 0`,
              color: darkTheme.text.secondary,
              fontSize: typography.fontSize.sm.size,
              lineHeight: typography.fontSize.sm.lineHeight,
            }}
          >
            Use your account credentials to continue.
          </p>
        </div>

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
          />

          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={passwordError}
            placeholder="Enter your password"
          />

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            style={{ width: "100%" }}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </Card>
  );
}