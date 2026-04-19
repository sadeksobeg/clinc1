import { NextResponse, type NextRequest } from "next/server";
import { verifyOpsToken } from "./lib/jwt";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("ops_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const payload = await verifyOpsToken(token);
  if (!payload?.sub) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("ops_session");
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/inbox",
    "/inbox/:path*",
    "/analytics",
    "/secretary",
    "/secretary/:path*",
    "/doctor",
    "/doctor/:path*",
    "/api/inbox",
    "/api/conversations/:path*",
    "/api/secretary/:path*",
    "/api/doctor/:path*",
  ],
};
