// TEMPORARY SCRUM-248 preview while SCRUM-240 is unavailable. Never a fallback
// for an HTTP failure. Remove with parentChildrenSource's preview path when the
// real parent endpoint has been verified.
import sample from "../../../../docs/contracts/samples/runs/parent-children.json";
import type { Child } from "./myChildren";

const children = sample satisfies Child[];

export async function getDevelopmentChildren(): Promise<Child[]> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Parent fixtures are restricted to development");
  }
  return structuredClone(children);
}
