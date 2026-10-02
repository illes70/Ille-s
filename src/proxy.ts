import { NextResponse, type NextRequest } from "next/server";
import { sessionToken } from "@/lib/session";

// Password gate. With OCP_PASSWORD set, every page and API needs the login cookie –
// except the Meta webhook (verified by signature) and the cron endpoint (own secret).

const PUBLIC = ["/login", "/api/login", "/api/webhooks/meta", "/api/cron/scan"];

export async function proxy(req: NextRequest) {
  const password = process.env.OCP_PASSWORD;
  if (!password) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  if (req.cookies.get("ocp_session")?.value === (await sessionToken(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Belépés szükséges" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
