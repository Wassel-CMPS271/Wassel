import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROLE_HOME: Record<string, string> = {
  driver: "/driver",
  parent: "/parent",
  "head-of-transport": "/head-of-transport",
  admin: "/admin",
};

// Routing skeleton only. Not a real auth check.
// TODO(SCRUM-176, Wassim): verify the JWT signature/expiry and read the role
// from the verified payload instead of trusting a plain cookie.
function getRole(req: NextRequest): string | undefined {
  return req.cookies.get("role")?.value;
}

export function middleware(req: NextRequest) {
  const role = getRole(req);
  const home = role ? ROLE_HOME[role] : undefined;
  const { pathname } = req.nextUrl;

  // No/unknown role: nothing to route to yet (login UI arrives in SCRUM-173).
  if (!home) return NextResponse.next();

  // Send "/" and any other role's area to the user's own route group.
  const inOwnArea = pathname === home || pathname.startsWith(`${home}/`);
  const inRoleArea = Object.values(ROLE_HOME).some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (pathname === "/" || (inRoleArea && !inOwnArea)) {
    return NextResponse.redirect(new URL(home, req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\..*).*)"],
};
