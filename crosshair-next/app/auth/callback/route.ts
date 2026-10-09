import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for email confirmation and magic links. Handles both the PKCE
 * `code` flow and the `token_hash` flow, then forwards to `next`.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") ?? "/finder";
  // Only same-site relative paths, never an open redirect.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/finder";

  const supabase = await createClient();
  let error: string | null = null;
  if (code) {
    const res = await supabase.auth.exchangeCodeForSession(code);
    error = res.error?.message ?? null;
  } else if (tokenHash && type) {
    const res = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    error = res.error?.message ?? null;
  } else {
    error = "This confirmation link is incomplete.";
  }

  const target = url.clone();
  target.search = "";
  if (error) {
    target.pathname = "/login";
    // Supabase confirms the email before redirecting here; the code exchange
    // fails when the link is opened in another browser or too late. The
    // account is usually confirmed already, so say so rather than alarm.
    const friendly = /flow state|code verifier|expired/i.test(error)
      ? "That link expired or was opened in a different browser. Your email is most likely confirmed already, so try signing in."
      : error;
    target.searchParams.set("error", friendly);
  } else {
    target.pathname = next;
  }
  return NextResponse.redirect(target);
}
