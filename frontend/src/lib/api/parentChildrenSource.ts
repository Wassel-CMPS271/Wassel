import { getMyChildren, type Child } from "./myChildren";

// Both checks are required. Next replaces NODE_ENV at build time, so the
// development import is unreachable in production, even with the flag set.
export function isParentHomePreview(): boolean {
  return process.env.NODE_ENV === "development"
    && process.env.NEXT_PUBLIC_PARENT_HOME_PREVIEW === "true";
}

export async function loadParentChildren(): Promise<Child[]> {
  if (process.env.NODE_ENV === "development"
    && process.env.NEXT_PUBLIC_PARENT_HOME_PREVIEW === "true") {
    const { getDevelopmentChildren } = await import("./myChildren.development");
    return getDevelopmentChildren();
  }
  return getMyChildren();
}
