"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { ApiError } from "@/lib/api/errors";
import type { Child } from "@/lib/api/myChildren";
import { loadParentChildren } from "@/lib/api/parentChildrenSource";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";
import { ChildTransportCard } from "./ChildTransportCard";
import { AbsencesPanel } from "./AbsencesPanel";

type LoadState = { kind: "loading" } | { kind: "loaded"; children: Child[] }
  | { kind: "failed"; reason: "expired" | "forbidden" | "unavailable" };

const pageStyle = {
  "--parent-page-phone": spacing.md,
  "--parent-page-wide": spacing.xl,
  maxWidth: sizing.pageMaxWidth,
  gap: spacing.lg,
} as CSSProperties;

type View = { kind: "children" } | { kind: "absences" | "tracking"; childId: string } | { kind: "inbox" };
export interface ParentHomeProps {
  // A UI lifetime key only. Identity is never sent as an API authorization parameter.
  accountKey?: string;
  renderTracking?: (child: Child) => ReactNode;
  renderInbox?: () => ReactNode;
}

// Optional compositions are supplied only after their real integrations are ready.
// The production page supplies neither; unavailable destinations stay non-interactive.
export function ParentHome({ accountKey = "current-parent", ...features }: ParentHomeProps) {
  return <ParentHomeContent key={accountKey} {...features} />;
}
function ParentHomeContent({ renderTracking, renderInbox }: Omit<ParentHomeProps, "accountKey">) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>({ kind: "children" });
  const selectedChild = state.kind === "loaded" && (view.kind === "absences" || view.kind === "tracking")
    ? state.children.find(child => child.studentId === view.childId) ?? null : null;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

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

  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true); setRefreshError(false);
    try {
      const children = await loadParentChildren();
      if (mounted.current) setState({ kind: "loaded", children });
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        setState({ kind: "failed", reason: error.status === 401 ? "expired" : "forbidden" });
      } else setRefreshError(true);
    } finally { busy.current = false; if (mounted.current) setRefreshing(false); }
  }

  function navigate(next: View) {
    setView(next);
    requestAnimationFrame(() => heading.current?.focus());
  }
  const children = state.kind === "loaded" ? state.children : [];
  function choose(kind: "absences" | "tracking") {
    const child = selectedChild ?? children[0];
    if (child) navigate({ kind, childId: child.studentId });
  }
  const navStyle = { ...focusRingStyle, minHeight: sizing.tapTarget };
  const unavailable = (label: string) => <span aria-disabled="true" className="inline-flex items-center text-sm" style={{ gap: spacing.sm, minHeight: sizing.tapTarget, color: darkTheme.text.muted }}>{label}<span className="text-xs">Soon</span></span>;

  return (
    <main className="mx-auto flex w-full min-w-0 flex-col p-[var(--parent-page-phone)] sm:p-[var(--parent-page-wide)]" style={pageStyle}>
      <header className="flex flex-col" style={{ gap: spacing.sm }}>
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: colors.accent[300] }}>Your family</p>
        <h1 ref={heading} tabIndex={-1} className="text-3xl font-semibold focus:outline-none" style={{ color: darkTheme.text.primary }}>{view.kind === "tracking" ? "Bus tracking" : view.kind === "inbox" ? "Transport updates" : view.kind === "absences" ? "Absences" : "My children"}</h1>
        <p className="text-base" style={{ color: darkTheme.text.secondary }}>School transport, at a glance.</p>
      </header>

      <nav aria-label="Family views" className="flex flex-wrap" style={{ gap: spacing.sm }}>
        <Button variant="secondary" style={navStyle} aria-current={view.kind === "children" ? "page" : undefined} onClick={() => navigate({ kind: "children" })}>My children</Button>
        <Button variant="secondary" style={navStyle} disabled={!children.length} aria-current={view.kind === "absences" ? "page" : undefined} onClick={() => choose("absences")}>Absences</Button>
        {renderTracking ? <Button variant="secondary" style={navStyle} disabled={!children.length} aria-current={view.kind === "tracking" ? "page" : undefined} onClick={() => choose("tracking")}>Bus tracking</Button> : unavailable("Bus tracking")}
        {renderInbox ? <Button variant="secondary" style={navStyle} disabled={state.kind !== "loaded"} aria-current={view.kind === "inbox" ? "page" : undefined} onClick={() => navigate({ kind: "inbox" })}>Inbox</Button> : unavailable("Inbox")}
      </nav>

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

      {state.kind === "loaded" && (view.kind === "absences" || view.kind === "tracking") && <div className="flex min-w-0 flex-col" style={{ gap: spacing.md }}>
        <label className="flex min-w-0 flex-col text-sm" style={{ gap: spacing.sm }}>Choose child for {view.kind === "tracking" ? "bus tracking" : "absences"}
          <select value={selectedChild?.studentId ?? ""} className={`w-full min-w-0 rounded-md ${focusRingClass}`} style={{ ...focusRingStyle, minHeight: sizing.tapTarget, padding: spacing.sm, backgroundColor: darkTheme.surface.input, color: darkTheme.text.primary }} onChange={event => {
            // Only identifiers from this authenticated parent's loaded list are selectable.
            if (children.some(child => child.studentId === event.target.value)) navigate({ kind: view.kind, childId: event.target.value });
          }}>
            {!selectedChild && <option value="">Choose a child</option>}
            {children.map(child => <option key={child.studentId} value={child.studentId}>{child.firstName} {child.lastName}</option>)}
          </select>
        </label>
        {selectedChild ? view.kind === "tracking" ? <div key={`tracking-${selectedChild.studentId}`}>{renderTracking ? renderTracking(selectedChild) : <p role="status">Live tracking is not available yet.</p>}</div> : <AbsencesPanel key={selectedChild.studentId} child={selectedChild} onBack={() => {
          const id = selectedChild.studentId; setView({ kind: "children" });
          requestAnimationFrame(() => document.getElementById(`absences-${id}`)?.focus());
        }} /> : <p role="status">Choose one of your linked children.</p>}
      </div>}
      {view.kind === "inbox" && state.kind === "loaded" && <div key="inbox">{renderInbox ? renderInbox() : <p role="status">Inbox is not available yet.</p>}</div>}
      {view.kind === "children" && state.kind === "loaded" && (
        <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
          <Button variant="secondary" disabled={refreshing} onClick={refresh} style={{ minHeight: sizing.tapTarget }}>{refreshing ? "Refreshing…" : "Refresh transport details"}</Button>
          {refreshError && <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>Couldn&apos;t refresh transport details. Showing the last loaded details; try refreshing again.</p>}
        </div>
      )}
      {view.kind === "children" && state.kind === "loaded" && (state.children.length === 0 ? (
        <Card className="flex flex-col" style={{ gap: spacing.sm }}>
          <h2 className="text-lg font-semibold" style={{ color: darkTheme.text.primary }}>No children linked yet</h2>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>Once your school links your children to this account, their transport details will appear here. Contact your school if you expected to see a child.</p>
        </Card>
      ) : (
        <section aria-label="Your children's transport" className="flex flex-col" style={{ gap: spacing.md }}>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>{state.children.length} {state.children.length === 1 ? "child" : "children"} linked to your account</p>
          <ul className="grid min-w-0 grid-cols-1 sm:grid-cols-2" style={{ gap: spacing.lg, padding: 0, margin: 0 }}>
            {state.children.map(child => <ChildTransportCard key={child.studentId} child={child} onAbsences={() => navigate({ kind: "absences", childId: child.studentId })} />)}
          </ul>
        </section>
      ))}
    </main>
  );
}
