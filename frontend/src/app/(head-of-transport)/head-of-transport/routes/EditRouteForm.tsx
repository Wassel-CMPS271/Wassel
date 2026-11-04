"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import type { RouteInput, RouteSummary } from "@/lib/api/routes";
import { RouteFormDialog } from "./RouteFormDialog";

interface EditRouteFormProps {
  route: RouteSummary;
  onEdit: (routeId: string, data: RouteInput) => Promise<void>;
}

export function EditRouteForm({ route, onEdit }: EditRouteFormProps) {
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
      <Button
        ref={triggerRef}
        variant="secondary"
        onClick={() => setIsOpen(true)}
        aria-label={`Edit ${route.name}`}
      >
        Edit
      </Button>

      <AnimatePresence>
        {isOpen && (
          <RouteFormDialog
            title="Edit route"
            submitLabel="Save"
            submittingLabel="Saving..."
            initial={{ name: route.name, vehicleId: route.vehicle.id, driverId: route.driver.id }}
            current={{ vehicle: route.vehicle, driver: route.driver }}
            onSubmit={(data) => onEdit(route.id, data)}
            onClose={closeForm}
          />
        )}
      </AnimatePresence>
    </>
  );
}
