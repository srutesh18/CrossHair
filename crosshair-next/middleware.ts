import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/supabase/env";

const PROTECTED = ["/radar", "/finder", "/templates", "/signals", "/news", "/companies", "/pipeline", "/setup"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Without credentials there is no session to refresh; let the page render
  // and surface a clear configuration error there.
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: { name: string; value: string; options?: CookieOptions }[]) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const needsAuth = PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p));
  if (needsAuth && !data.user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirect);
  }
  if (data.user && request.nextUrl.pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/finder";
    home.search = "";
    return NextResponse.redirect(home);
  }
  return response;
}

// Only pages that need a session (and /login, to bounce signed-in users).
// API routes check the session themselves; the public landing page needs none.
// Skipping the rest saves a ~0.5s auth round trip on every one of them.
export const config = {
  matcher: [
    "/finder/:path*", "/pipeline/:path*", "/templates/:path*", "/radar/:path*",
    "/signals/:path*", "/news/:path*", "/companies/:path*", "/setup/:path*", "/login",
  ],
};
