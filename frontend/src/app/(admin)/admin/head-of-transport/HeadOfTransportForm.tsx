"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ApiValidationError } from "@/lib/api/errors";
import { colors, darkTheme, spacing } from "@/styles/tokens";

// Same pattern as CreateAccountRequest on the backend, so both sides agree.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  email?: string;
}

interface HeadOfTransportFormProps {
  onInvite: (email: string) => Promise<void>;
}

export function HeadOfTransportForm({ onInvite }: HeadOfTransportFormProps) {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): FormErrors {
    const next: FormErrors = {};
    const trimmed = email.trim();
    if (!trimmed) {
      next.email = "Email is required";
    } else if (!EMAIL_PATTERN.test(trimmed)) {
      next.email = "Enter a valid email address";
    }
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setFormError(undefined);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onInvite(email.trim());
      setEmail("");
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setErrors(error.errors);
      } else {
        setFormError("Couldn't send the invite. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate aria-labelledby="head-of-transport-heading">
        <h2
          id="head-of-transport-heading"
          className="text-lg font-semibold"
          style={{ marginBottom: spacing.xs, color: darkTheme.text.primary }}
        >
          Invite a head of transportation
        </h2>
        <p
          className="text-sm"
          style={{ marginBottom: spacing.md, color: darkTheme.text.secondary }}
        >
          They&apos;ll get an email to set their password and sign in.
        </p>
        <Input
          label="Email address"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          className="w-full"
        />
        {formError && (
          <p
            role="alert"
            className="text-sm"
            style={{ marginTop: spacing.md, color: colors.error[500] }}
          >
            {formError}
          </p>
        )}
        <div style={{ marginTop: spacing.md }}>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send invite"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
