"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { ApiError } from "@/lib/api/errors";
import type { Child } from "@/lib/api/myChildren";
import { isParentHomePreview, loadParentChildren } from "@/lib/api/parentChildrenSource";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";
import { ChildTransportCard } from "./ChildTransportCard";

type LoadState = { kind: "loading" } | { kind: "loaded"; children: Child[] }
  | { kind: "failed"; reason: "expired" | "forbidden" | "unavailable" };

const pageStyle = {
  "--parent-page-phone": spacing.md,
  "--parent-page-wide": spacing.xl,
  maxWidth: sizing.pageMaxWidth,
  gap: spacing.lg,
} as CSSProperties;

export default function ParentHome() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const preview = isParentHomePreview();

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    loadParentChildren().then(children => {
      if (active) setState({ kind: "loaded", children });
    }).catch(error => {
      if (!active) return;
      const reason = error instanceof ApiError && error.status === 401 ? "expired"
        : error instanceof ApiError && error.status === 403 ? "forbidden" : "unavailable";
      setState({ kind: "failed", reason });
    });
    return () => { active = false; };
  }, [attempt]);

  return (
    <main className="mx-auto flex w-full min-w-0 flex-col p-[var(--parent-page-phone)] sm:p-[var(--parent-page-wide)]" style={pageStyle}>
      <header className="flex flex-col" style={{ gap: spacing.sm }}>
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: colors.accent[300] }}>Your family</p>
        <h1 ref={heading} tabIndex={-1} className="text-3xl font-semibold focus:outline-none" style={{ color: darkTheme.text.primary }}>My children</h1>
        <p className="text-base" style={{ color: darkTheme.text.secondary }}>School transport, at a glance.</p>
      </header>

      {preview && <p role="status" className="text-sm font-medium" style={{ color: colors.warning[500] }}>Development preview — sample children, not live school records.</p>}

      {state.kind === "loading" && (
        <div role="status" aria-live="polite" className="flex flex-col" style={{ gap: spacing.md }}>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>Loading your children&apos;s transport details…</p>
          {[0, 1].map(index => <Card key={index} aria-hidden="true" className="flex flex-col" style={{ gap: spacing.md }}>
            <div style={{ width: "50%", height: spacing.lg, backgroundColor: darkTheme.surface.skeleton }} />
            <div style={{ width: "75%", height: spacing.md, backgroundColor: darkTheme.surface.skeleton }} />
            <div style={{ width: "60%", height: spacing.md, backgroundColor: darkTheme.surface.skeleton }} />
          </Card>)}
        </div>
      )}

      {state.kind === "failed" && (
        <Card className="flex flex-col items-start" style={{ gap: spacing.md }}>
          <div role="alert" className="flex flex-col" style={{ gap: spacing.sm }}>
            <h2 className="text-lg font-semibold" style={{ color: darkTheme.text.primary }}>{state.reason === "expired" ? "Your sign-in has expired" : "Couldn't load transport details"}</h2>
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>{state.reason === "expired" ? "Sign in again to see your children's transport details."
              : state.reason === "forbidden" ? "You don't have access to these details. Contact your school if this seems wrong."
                : "Something went wrong. Please try again."}</p>
          </div>
          {state.reason === "expired" ? (
            <Link href="/login" className={`inline-flex items-center text-sm font-medium ${focusRingClass}`} style={{ ...focusRingStyle, minHeight: sizing.tapTarget, color: colors.primary[300] }}>Sign in</Link>
          ) : (
            <Button variant="secondary" style={{ minHeight: sizing.tapTarget }} onClick={() => { heading.current?.focus(); setAttempt(value => value + 1); }}>Try again</Button>
          )}
        </Card>
      )}

      {state.kind === "loaded" && (state.children.length === 0 ? (
        <Card className="flex flex-col" style={{ gap: spacing.sm }}>
          <h2 className="text-lg font-semibold" style={{ color: darkTheme.text.primary }}>No children linked yet</h2>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>Once your school links your children to this account, their transport details will appear here. Contact your school if you expected to see a child.</p>
        </Card>
      ) : (
        <section aria-label="Your children's transport" className="flex flex-col" style={{ gap: spacing.md }}>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>{state.children.length} {state.children.length === 1 ? "child" : "children"} linked to your account</p>
          <ul className="grid min-w-0 grid-cols-1 sm:grid-cols-2" style={{ gap: spacing.lg, padding: 0, margin: 0 }}>
            {state.children.map(child => <ChildTransportCard key={child.studentId} child={child} />)}
          </ul>
        </section>
      ))}
    </main>
  );
}
