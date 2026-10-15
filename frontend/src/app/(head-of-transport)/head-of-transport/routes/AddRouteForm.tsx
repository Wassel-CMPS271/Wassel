"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import type { RouteInput } from "@/lib/api/routes";
import { RouteFormDialog } from "./RouteFormDialog";

interface AddRouteFormProps {
  onAdd: (data: RouteInput) => Promise<void>;
}

const EMPTY_ROUTE: RouteInput = { name: "", vehicleId: "", driverId: "" };

export function AddRouteForm({ onAdd }: AddRouteFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocusRef = useRef(false);

  useEffect(() => {
    if (!isOpen && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  function closeForm() {
    shouldRestoreFocusRef.current = true;
    setIsOpen(false);
  }

  return (
    <>
      <Button ref={triggerRef} variant="primary" onClick={() => setIsOpen(true)}>
        Create route
      </Button>

      <AnimatePresence>
        {isOpen && (
          <RouteFormDialog
            title="Create route"
            submitLabel="Create route"
            submittingLabel="Creating..."
            initial={EMPTY_ROUTE}
            onSubmit={onAdd}
            onClose={closeForm}
          />
        )}
      </AnimatePresence>
    </>
  );
}
