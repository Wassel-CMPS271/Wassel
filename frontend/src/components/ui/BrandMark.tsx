import Link from "next/link";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { brand, colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";

interface BrandMarkProps {
  size?: string;
  /** Accessible name. Omit when the mark sits next to the visible "Wassel" text. */
  label?: string;
}

// Amber badge with a front-facing school bus in front of a sunrise arc.
// src/app/icon.svg draws the same shape with literal values; keep them in sync.
export function BrandMark({ size = spacing.xl, label }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className="flex-shrink-0"
      focusable="false"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <rect width="32" height="32" rx="8" fill={brand.badge} />
      <path d="M4 21a12 12 0 0 1 24 0z" fill={brand.sun} />
      <g fill={brand.ink}>
        <rect x="7.1" y="12.6" width="1.8" height="3.6" rx="0.8" />
        <rect x="23.1" y="12.6" width="1.8" height="3.6" rx="0.8" />
        <rect x="8.4" y="13.6" width="1.6" height="0.9" />
        <rect x="22" y="13.6" width="1.6" height="0.9" />
        <rect x="9.5" y="10" width="13" height="14.5" rx="2.6" />
        <rect x="10.8" y="23.4" width="2.6" height="3.2" rx="0.8" />
        <rect x="18.6" y="23.4" width="2.6" height="3.2" rx="0.8" />
      </g>
      <rect x="11" y="11.6" width="10" height="1.3" rx="0.65" fill={brand.badge} />
      <rect x="11" y="14.2" width="10" height="5.2" rx="1" fill={brand.sun} />
      <circle cx="12.7" cy="21.8" r="1.1" fill={brand.sun} />
      <circle cx="19.3" cy="21.8" r="1.1" fill={brand.sun} />
    </svg>
  );
}

// Home link: brand mark plus the "Wassel" wordmark with an amber underline
// that grows on hover and keyboard focus.
export function BrandLink() {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center ${focusRingClass}`}
      style={{
        ...focusRingStyle,
        gap: spacing.sm,
        minHeight: sizing.tapTarget,
        borderRadius: radius.md,
      }}
    >
      <BrandMark />
      <span className="relative text-xl font-bold tracking-wide" style={{ color: darkTheme.text.primary }}>
        Wassel
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-0.5 h-0.5 origin-left scale-x-0 transition-transform duration-200 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none"
          style={{ backgroundColor: colors.accent[400], borderRadius: radius.full }}
        />
      </span>
    </Link>
  );
}
