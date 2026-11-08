"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import type { AddressRequest, AddressRequestsApi } from "@/lib/api/addressRequests";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

interface AddressRequestsSectionProps {
  /** null while SCRUM-269 is unmerged: renders the "coming soon" placeholder. */
  api: AddressRequestsApi | null;
  /** Called after an approval, with the student it was for, so the roster can refresh that row. */
  onApproved: (studentId: string) => void;
}

const REASON_MAX_LENGTH = 255;

function decisionErrorMessage(err: unknown): string {
  if (err instanceof ApiValidationError) {
    return Object.values(err.errors).join(" ") || "The server rejected this.";
  }
  if (err instanceof ApiError) {
    if (err.status === 401) return "Your session has expired. Please sign in again.";
    if (err.status === 403) return "You do not have permission to decide this request.";
    if (err.status < 500) return err.message || "The request could not be completed.";
  }
  return "Something went wrong. Please try again.";
}

function SkeletonRow({ delay }: { delay: number }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.li
      aria-hidden="true"
      className="list-none"
      style={{
        height: "76px",
        borderRadius: radius.md,
        border: `1px solid ${darkTheme.surface.cardBorder}`,
        backgroundColor: darkTheme.surface.skeleton,
      }}
      animate={prefersReducedMotion ? { opacity: 0.7 } : { opacity: [0.45, 0.85, 0.45] }}
      transition={
        prefersReducedMotion
          ? { duration: 0.2 }
          : { duration: 1.4, repeat: Infinity, ease: "easeInOut", delay }
      }
    />
  );
}

interface RowProps {
  request: AddressRequest;
  isDeciding: boolean;
  onApprove: () => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
}

// One pending request: the child, the address on file next to the one being
// asked for (clearly not the same thing), and Approve / Reject. Reject asks
// for confirmation first, with an optional reason, the same inline-question
// pattern as RevokeAccessControl (Escape cancels, focus goes to Confirm and
// back to the trigger).
function AddressRequestRow({ request, isDeciding, onApprove, onReject }: RowProps) {
  const [isConfirmingReject, setIsConfirmingReject] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [rowError, setRowError] = useState("");
  const rejectTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmRejectRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const shouldRestoreFocusRef = useRef(false);
  const reasonId = useId();
  const reasonErrorId = useId();

  useEffect(() => {
    if (isConfirmingReject) confirmRejectRef.current?.focus();
  }, [isConfirmingReject]);

  useEffect(() => {
    if (!isConfirmingReject && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      rejectTriggerRef.current?.focus();
    }
  }, [isConfirmingReject]);

  function openReject() {
    setReason("");
    setReasonError("");
    setRowError("");
    setIsConfirmingReject(true);
  }

  function cancelReject() {
    shouldRestoreFocusRef.current = true;
    setIsConfirmingReject(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !isDeciding) {
      event.preventDefault();
      cancelReject();
    }
  }

  async function handleApprove() {
    setRowError("");
    try {
      await onApprove();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function confirmReject() {
    const trimmed = reason.trim();
    if (trimmed.length > REASON_MAX_LENGTH) {
      setReasonError(`Reason must be ${REASON_MAX_LENGTH} characters or fewer.`);
      reasonRef.current?.focus();
      return;
    }
    setReasonError("");
    setRowError("");
    try {
      await onReject(trimmed || undefined);
      // On success the request leaves the list and this row unmounts; no
      // local state to reset.
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="list-none flex flex-col"
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        border: `1px solid ${darkTheme.surface.cardBorder}`,
        borderRadius: radius.md,
        backgroundColor: darkTheme.surface.card,
        boxShadow: darkTheme.surface.cardShadow,
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between" style={{ gap: spacing.md }}>
        <div className="flex flex-col min-w-0" style={{ gap: spacing.xs }}>
          <span className="text-base font-medium" style={{ color: darkTheme.text.primary }}>
            {request.studentName}
          </span>
          <span className="text-sm break-words" style={{ color: darkTheme.text.secondary }}>
            Current saved address: {request.currentAddress || "Not set"}
          </span>
          <span className="text-sm font-medium break-words" style={{ color: colors.warning[500] }}>
            Requested (not yet saved): {request.requestedAddress}
          </span>
          <span className="text-xs break-all" style={{ color: darkTheme.text.muted }}>
            Requested by {request.requestedBy.email}
          </span>
        </div>

        {!isConfirmingReject && (
          <div className="flex flex-wrap flex-shrink-0" style={{ gap: spacing.sm }}>
            <Button
              variant="primary"
              onClick={handleApprove}
              disabled={isDeciding}
              aria-label={`Approve address change for ${request.studentName}`}
            >
              {isDeciding ? "Approving…" : "Approve"}
            </Button>
            <Button
              ref={rejectTriggerRef}
              variant="danger"
              onClick={openReject}
              disabled={isDeciding}
              aria-label={`Reject address change for ${request.studentName}`}
            >
              Reject
            </Button>
          </div>
        )}
      </div>

      {isConfirmingReject && (
        <div
          className="flex flex-col"
          style={{ gap: spacing.sm, paddingTop: spacing.sm, borderTop: `1px solid ${darkTheme.surface.cardBorder}` }}
          onKeyDown={handleKeyDown}
        >
          <p role="status" className="text-sm" style={{ color: darkTheme.text.secondary }}>
            Reject this address change for {request.studentName}? The current saved address stays unchanged.
          </p>
          <div className="flex flex-col" style={{ gap: spacing.xs }}>
            <label htmlFor={reasonId} className="text-sm font-medium" style={{ color: darkTheme.text.secondary }}>
              Reason (optional)
            </label>
            <textarea
              ref={reasonRef}
              id={reasonId}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError) setReasonError("");
              }}
              disabled={isDeciding}
              rows={2}
              maxLength={REASON_MAX_LENGTH}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={reasonError ? reasonErrorId : undefined}
              className="w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                borderRadius: radius.md,
                padding: spacing.sm,
                border: `1px solid ${reasonError ? colors.error[500] : darkTheme.surface.inputBorder}`,
                backgroundColor: darkTheme.surface.input,
                color: darkTheme.text.primary,
                outlineColor: colors.primary[500],
                resize: "vertical",
              }}
            />
            {reasonError && (
              <span id={reasonErrorId} role="alert" className="text-sm" style={{ color: colors.error[500] }}>
                {reasonError}
              </span>
            )}
          </div>
          <div className="flex flex-wrap" style={{ gap: spacing.sm }}>
            <Button
              ref={confirmRejectRef}
              variant="danger"
              onClick={confirmReject}
              disabled={isDeciding}
              aria-label={`Confirm reject address change for ${request.studentName}`}
            >
              {isDeciding ? "Rejecting…" : "Confirm reject"}
            </Button>
            <Button variant="ghost" onClick={cancelReject} disabled={isDeciding}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rowError && (
        <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
          {rowError}
        </p>
      )}
    </motion.li>
  );
}

export function AddressRequestsSection({ api, onApproved }: AddressRequestsSectionProps) {
  const [requests, setRequests] = useState<AddressRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [decidingIds, setDecidingIds] = useState<Set<string>>(new Set());
  // A decided row unmounts with its buttons, so focus would fall to <body>:
  // move it to the section heading instead.
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    if (!api) return;
    setIsLoading(true);
    setLoadError("");
    try {
      const data = await api.list();
      // Defensive: this section only ever shows requests still awaiting a
      // decision, even if the API answers with more than that.
      setRequests(data.filter((request) => request.status === "pending"));
    } catch {
      setLoadError("Couldn't load address requests. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove(id: string) {
    if (!api) return;
    const request = requests.find((item) => item.id === id);
    if (!request) return;
    setNotice("");
    setDecidingIds((prev) => new Set(prev).add(id));
    try {
      await api.approve(id);
      setRequests((prev) => prev.filter((item) => item.id !== id));
      setNotice(`Address approved for ${request.studentName}.`);
      headingRef.current?.focus();
      onApproved(request.studentId);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        setNotice(
          err.status === 409
            ? "This request was already decided by someone else. Refreshed the list."
            : "This request is no longer available. Refreshed the list.",
        );
        await load();
        headingRef.current?.focus();
        return;
      }
      throw new Error(decisionErrorMessage(err));
    } finally {
      setDecidingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleReject(id: string, reason?: string) {
    if (!api) return;
    const request = requests.find((item) => item.id === id);
    if (!request) return;
    setNotice("");
    setDecidingIds((prev) => new Set(prev).add(id));
    try {
      await api.reject(id, reason);
      setRequests((prev) => prev.filter((item) => item.id !== id));
      setNotice(`Address request rejected for ${request.studentName}.`);
      headingRef.current?.focus();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        setNotice(
          err.status === 409
            ? "This request was already decided by someone else. Refreshed the list."
            : "This request is no longer available. Refreshed the list.",
        );
        await load();
        headingRef.current?.focus();
        return;
      }
      throw new Error(decisionErrorMessage(err));
    } finally {
      setDecidingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <section aria-labelledby="address-requests-heading">
      <div className="flex items-center" style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
        <span
          aria-hidden="true"
          className="inline-flex items-center justify-center flex-shrink-0 rounded-full"
          style={{ width: "24px", height: "24px", backgroundColor: darkTheme.surface.pendingBadge }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5" stroke={colors.warning[500]} strokeOpacity="0.6" fill="none" />
            <path d="M7 4v3l2 1.4" stroke={colors.warning[500]} strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <h2
          ref={headingRef}
          id="address-requests-heading"
          tabIndex={-1}
          className="text-lg font-semibold"
          style={{ color: darkTheme.text.primary }}
        >
          Address requests
        </h2>
      </div>
      <div
        aria-hidden="true"
        style={{
          height: "1px",
          background: `linear-gradient(90deg, ${darkTheme.surface.cardBorder}, transparent)`,
          marginBottom: spacing.md,
        }}
      />

      {!api && (
        <div
          aria-disabled="true"
          className="flex items-center flex-wrap"
          style={{
            gap: spacing.sm,
            padding: spacing.md,
            border: `1px dashed ${darkTheme.surface.cardBorder}`,
            borderRadius: radius.lg,
            backgroundColor: darkTheme.surface.recede,
          }}
        >
          <span className="text-sm flex-1" style={{ color: darkTheme.text.muted }}>
            Address change requests from parents will appear here (SCRUM-269).
          </span>
          <span
            className="text-xs font-medium flex-shrink-0"
            style={{
              padding: `2px ${spacing.sm}`,
              borderRadius: radius.full,
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              color: darkTheme.text.muted,
            }}
          >
            Soon
          </span>
        </div>
      )}

      {api && (
        <>
          {isLoading && (
            <>
              <span className="sr-only" role="status">
                Loading address requests…
              </span>
              <ul aria-hidden="true" className="flex flex-col" style={{ gap: spacing.sm, padding: 0, margin: 0 }}>
                <SkeletonRow delay={0} />
                <SkeletonRow delay={0.15} />
              </ul>
            </>
          )}

          {!isLoading && loadError && (
            <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
              <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
                {loadError}
              </p>
              <Button variant="secondary" onClick={load}>
                Try again
              </Button>
            </div>
          )}

          <p
            role="status"
            className="text-sm"
            style={{ color: darkTheme.text.secondary, marginBottom: notice ? spacing.sm : 0 }}
          >
            {notice}
          </p>

          {!isLoading && !loadError && (
            <>
              {requests.length === 0 && (
                <div
                  className="flex flex-col items-center text-center"
                  style={{
                    padding: spacing.xl,
                    border: `1px dashed ${darkTheme.surface.cardBorder}`,
                    borderRadius: radius.lg,
                    backgroundColor: darkTheme.surface.emptyState,
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: darkTheme.text.primary }}>
                    No pending address requests.
                  </p>
                </div>
              )}

              {requests.length > 0 && (
                <ul role="list" className="flex flex-col" style={{ gap: spacing.sm, padding: 0, margin: 0 }}>
                  <AnimatePresence initial={false}>
                    {requests.map((request) => (
                      <AddressRequestRow
                        key={request.id}
                        request={request}
                        isDeciding={decidingIds.has(request.id)}
                        onApprove={() => handleApprove(request.id)}
                        onReject={(reason) => handleReject(request.id, reason)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
