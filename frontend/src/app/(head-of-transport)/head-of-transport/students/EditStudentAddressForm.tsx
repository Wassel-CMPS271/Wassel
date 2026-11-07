"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { StudentParentForm } from "./StudentParentForm";
import { MapView, type Coordinates } from "@/components/map/MapView";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import type { Student } from "@/lib/api/students";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";

interface Props {
  onLinked?: (student: Student) => void;
  student: Student;
  onSave: (studentId: string, address: string) => Promise<void>;
  onSaveLocation: (studentId: string, latitude: number, longitude: number) => Promise<void>;
}

interface FormErrors {
  address?: string;
  form?: string;
}

// Central Beirut, the service area. A student with no pin opens here (in
// pin mode MapView needs a `center` to show a map rather than its empty
// state), zoomed out far enough to find the right neighbourhood.
export const FALLBACK_MAP_CENTER: Coordinates = { latitude: 33.8938, longitude: 35.5018 };
export const FALLBACK_MAP_ZOOM = 13;

function pinFromStudent(student: Student): Coordinates | null {
  const { latitude, longitude } = student;
  return typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : null;
}

function samePin(a: Coordinates | null, b: Coordinates | null): boolean {
  return a?.latitude === b?.latitude && a?.longitude === b?.longitude;
}

function addressErrorMessage(err: unknown): string {
  if (err instanceof ApiValidationError) {
    return err.errors.address || "The address was rejected. Check it and try again.";
  }
  if (err instanceof ApiError && err.status === 401) return "Your session has expired. Please sign in again.";
  if (err instanceof ApiError && err.status === 403) return "You do not have permission to change this address.";
  return "Something went wrong. Please try again.";
}

function locationErrorMessage(err: unknown): string {
  if (err instanceof ApiValidationError) {
    return err.errors.latitude || err.errors.longitude || "The pin was rejected. Move it and try again.";
  }
  if (err instanceof ApiError && err.status === 401) return "Your session has expired. Please sign in again.";
  if (err instanceof ApiError && err.status === 403) return "You do not have permission to change this location.";
  return "Something went wrong. Please try again.";
}

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

export function EditStudentAddressForm({ student, onSave, onSaveLocation, onLinked }: Props) {
  const [savingParent, setSavingParent] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [address, setAddress] = useState(student.address ?? "");
  const [pin, setPin] = useState<Coordinates | null>(() => pinFromStudent(student));
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  // Set when Save should get focus back once it is enabled again.
  const focusSubmitAfterSave = useRef(false);
  // The address this dialog already saved, so a retry after the pin failed
  // doesn't send it again even if the server stored it reformatted.
  const savedAddress = useRef<string | null>(null);
  const headingId = useId();

  const initialPin = pinFromStudent(student);
  const [view, setView] = useState(() => ({ center: initialPin ?? FALLBACK_MAP_CENTER, zoom: initialPin ? undefined : FALLBACK_MAP_ZOOM }));

  useEffect(() => {
    if (isOpen) addressRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isSaving && focusSubmitAfterSave.current) {
      focusSubmitAfterSave.current = false;
      submitRef.current?.focus();
    }
  }, [isSaving]);

  function open() {
    setAddress(student.address ?? "");
    setPin(initialPin);
    setView({ center: initialPin ?? FALLBACK_MAP_CENTER, zoom: initialPin ? undefined : FALLBACK_MAP_ZOOM });
    setErrors({});
    savedAddress.current = null;
    setIsOpen(true);
  }

  function close() {
    restoreFocus.current = true;
    setIsOpen(false);
  }

  // Address first, then the pin, one after the other. If the address saves
  // and the pin doesn't, the dialog stays open, says so, and the next Save
  // only retries the pin.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || savingParent) return;
    const trimmed = address.trim();
    if (!trimmed) {
      setErrors({ address: "Pickup address is required." });
      addressRef.current?.focus();
      return;
    }
    setErrors({});
    setIsSaving(true);
    try {
      let addressSavedNow = false;
      if (trimmed !== (student.address ?? "") && trimmed !== savedAddress.current) {
        try {
          await onSave(student.id, trimmed);
        } catch (err) {
          setErrors({ address: addressErrorMessage(err) });
          addressRef.current?.focus();
          return;
        }
        savedAddress.current = trimmed;
        addressSavedNow = true;
        setAddress(trimmed);
      }

      if (pin && !samePin(pin, initialPin)) {
        try {
          await onSaveLocation(student.id, pin.latitude, pin.longitude);
        } catch (err) {
          const reason = locationErrorMessage(err);
          const addressAlreadySaved = addressSavedNow || savedAddress.current !== null;
          setErrors({
            form: addressAlreadySaved ? `The pickup address was saved, but the pin was not. ${reason}` : `The pin was not saved. ${reason}`,
          });
          focusSubmitAfterSave.current = true;
          return;
        }
      }

      close();
    } finally {
      setIsSaving(false);
    }
  }

  // Escape closes the dialog (not mid-save); Tab is trapped to the enabled
  // controls inside the panel, the map's own controls included.
  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isSaving && !savingParent) close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="secondary"
        onClick={open}
        aria-label={`Edit pickup details for ${student.firstName} ${student.lastName}`}
      >
        Edit pickup details
      </Button>
      <AnimatePresence>
        {isOpen && (
          // Scrolls when the panel is taller than the screen (the map is),
          // and m-auto centres it without clipping its top when it does.
          <motion.div
            className="fixed inset-0 z-50 flex overflow-y-auto"
            style={{ backgroundColor: darkTheme.surface.overlay, padding: spacing.md }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onKeyDown={handleKeys}
          >
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={headingId}
              className="m-auto w-full"
              style={{ maxWidth: sizing.dialogWideMaxWidth }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Card>
                <form onSubmit={submit} noValidate aria-labelledby={headingId}>
                  <h2 id={headingId} className="text-lg font-semibold" style={{ color: darkTheme.text.primary, marginBottom: spacing.md }}>
                    Edit pickup details
                  </h2>
                  <Input
                    ref={addressRef}
                    label="Pickup address"
                    maxLength={255}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    error={errors.address}
                    autoComplete="street-address"
                    placeholder="Street, building, area, city"
                  />
                  <div className="flex flex-col" style={{ gap: spacing.xs, marginTop: spacing.md }}>
                    <span aria-hidden="true" className="text-sm font-medium" style={{ color: darkTheme.text.secondary }}>
                      Pickup location
                    </span>
                    <MapView
                      label={`Pickup location for ${student.firstName} ${student.lastName}`}
                      pin={pin}
                      onPinChange={(latitude, longitude) => setPin({ latitude, longitude })}
                      pinLabel="Pickup pin"
                      center={view.center}
                      zoom={view.zoom}
                    />
                  </div>
                  {errors.form && (
                    <p role="alert" className="text-sm" style={{ color: colors.error[500], marginTop: spacing.md }}>
                      {errors.form}
                    </p>
                  )}
                  <div className="flex flex-wrap" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                    <Button ref={submitRef} type="submit" disabled={isSaving || savingParent}>{isSaving ? "Saving..." : "Save"}</Button>
                    <Button type="button" variant="ghost" onClick={close} disabled={isSaving || savingParent}>Cancel</Button>
                  </div>
                </form>
                {onLinked && <fieldset disabled={isSaving}><StudentParentForm student={student} onLinked={onLinked} onBusyChange={setSavingParent} /></fieldset>}
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
