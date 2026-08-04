import { Role, type Role as RoleType } from "@/lib/roles";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isApproved } from "@/lib/auth/permissions";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isAuthRoute = pathname.startsWith("/api/auth");
  const isPublicAuth = pathname === "/login" || pathname === "/register";

  if (isAuthRoute) {
    return NextResponse.next();
  }

  if (isPublicAuth) {
    if (session) {
      if (session.user.role === Role.PENDING || session.user.role === Role.REJECTED) {
        return NextResponse.redirect(new URL("/pending", req.url));
      }
      if (isApproved(session.user.role)) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { role } = session.user;

  if (role === Role.PENDING || role === Role.REJECTED) {
    if (pathname !== "/pending") {
      return NextResponse.redirect(new URL("/pending", req.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/pending") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (pathname.startsWith("/admin") && role !== Role.ADMIN) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
