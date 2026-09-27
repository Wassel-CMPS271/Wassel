"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import type { NewVehicle } from "@/lib/api/vehicles";
import { darkTheme, spacing } from "@/styles/tokens";

interface FormErrors {
  plateNumber?: string;
  capacity?: string;
}

// Lebanese private plate format: 1-3 letters, a space, then 1-6 digits
// (e.g. "A 123456").
const LEBANESE_PLATE_PATTERN = /^[A-Za-z]{1,3} \d{1,6}$/;

interface AddVehicleFormProps {
  onAdd: (data: NewVehicle) => Promise<void>;
}

export function AddVehicleForm({ onAdd }: AddVehicleFormProps) {
  const [plateNumber, setPlateNumber] = useState("");
  const [capacity, setCapacity] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): FormErrors {
    const next: FormErrors = {};
    const trimmedPlate = plateNumber.trim();
    if (!trimmedPlate) {
      next.plateNumber = "Plate number is required.";
    } else if (!LEBANESE_PLATE_PATTERN.test(trimmedPlate)) {
      next.plateNumber = 'Use a format like "A 123456" (1-3 letters, space, 1-6 digits).';
    }
    const capacityNumber = Number(capacity);
    if (!capacity.trim() || !Number.isFinite(capacityNumber) || capacityNumber <= 0) {
      next.capacity = "Capacity must be a positive number.";
    }
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onAdd({
        plateNumber: plateNumber.trim(),
        capacity: Number(capacity),
        isActive: true,
      });
      setPlateNumber("");
      setCapacity("");
      setErrors({});
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate aria-labelledby="add-vehicle-heading">
        <h2
          id="add-vehicle-heading"
          className="text-lg font-semibold"
          style={{ marginBottom: spacing.md, color: darkTheme.text.primary }}
        >
          Add vehicle
        </h2>
        <div className="flex flex-col sm:flex-row" style={{ gap: spacing.md }}>
          <Input
            label="Plate number"
            value={plateNumber}
            onChange={(event) => setPlateNumber(event.target.value)}
            error={errors.plateNumber}
            placeholder="e.g. A 123456"
            autoComplete="off"
          />
          <Input
            label="Capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            error={errors.capacity}
            placeholder="e.g. 14"
          />
        </div>
        <div style={{ marginTop: spacing.md }}>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add vehicle"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
