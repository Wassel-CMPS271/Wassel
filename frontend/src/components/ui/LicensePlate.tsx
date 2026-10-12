import { colors, radius, spacing, typography } from "@/styles/tokens";

export interface LicensePlateProps {
  plateNumber: string;
  className?: string;
}

// Stylized like a Lebanese private vehicle plate: white body, bold black
// lettering, and a narrow blue stripe on the left edge carrying a cedar
// tree mark. Purely decorative chrome around the plate number — the
// number itself stays as real text so it's still announced normally.
export function LicensePlate({ plateNumber, className = "" }: LicensePlateProps) {
  return (
    <div
      className={`inline-flex items-stretch overflow-hidden ${className}`}
      style={{
        borderRadius: radius.sm,
        border: `1px solid ${colors.neutral[300]}`,
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.15)",
        backgroundColor: "#ffffff",
      }}
    >
      <div
        aria-hidden="true"
        className="flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: colors.primary[700], width: "16px" }}
      >
        <CedarTreeMark />
      </div>
      <span
        className="font-bold"
        style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          color: "#111111",
          fontFamily: typography.fontFamily.serif,
          fontSize: typography.fontSize.base.size,
          letterSpacing: "0.06em",
        }}
      >
        {plateNumber}
      </span>
    </div>
  );
}

function CedarTreeMark() {
  return (
    <svg
      width="9"
      height="13"
      viewBox="0 0 9 13"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
    >
      <path d="M4.5 0L5.8 2.6H4.9L6.6 5.2H5.4L7.2 7.8H1.8L3.6 5.2H2.4L4.1 2.6H3.2L4.5 0Z" fill="#ffffff" />
      <rect x="3.9" y="7.8" width="1.2" height="2.6" fill="#ffffff" />
      <path d="M1.8 10.8H7.2L8.1 12.2H0.9L1.8 10.8Z" fill="#ffffff" />
    </svg>
  );
}
