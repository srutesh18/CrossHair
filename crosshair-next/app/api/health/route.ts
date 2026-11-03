import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { modelName } from "@/lib/ai";
import { typesafeEnabled } from "@/lib/ai/typesafe";
import { sendingEnabled } from "@/lib/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Is GOOGLE_API_KEY present AND accepted by Google? A key that exists but has
 * the wrong APIs enabled fails silently inside the audit, so this asks.
 * Only runs with ?verify=1 because it spends a real API call.
 */
async function checkGoogleKey(): Promise<string> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return "missing";
  try {
    const res = await fetch(
      "https://www.googleapis.com/pagespeedonline/v5/runPagespeed" +
        `?url=${encodeURIComponent("https://example.com")}&strategy=mobile&category=performance&key=${key}`,
      { signal: AbortSignal.timeout(60_000), cache: "no-store" },
    );
    if (res.ok) return "ok";
    if (res.status === 400 || res.status === 403) return "rejected: enable the PageSpeed Insights API for this key";
    return `error ${res.status}`;
  } catch {
    return "unreachable";
  }
}

/**
 * Configuration check for deploys. Reports what is set, never the values.
 * `schema` is true once the migrations have created the tables.
 * Add ?verify=1 to actually test the Google key.
 */
export async function GET(request: Request) {
  let schema = false;
  if (SUPABASE_URL && SUPABASE_PUBLIC_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      auth: { persistSession: false },
    });
    // RLS returns zero rows to an anonymous caller, but no error once the table exists.
    const { error } = await supabase.from("orgs").select("id").limit(1);
    schema = !error;
  }
  // Groq is optional: discovery, audits, scoring and email templates work without it.
  const ok = Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY && schema);
  return NextResponse.json(
    {
      ok,
      supabase: Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY),
      schema,
      ai: Boolean(process.env.GROQ_API_KEY),
      model: modelName(),
      crossCheck: typesafeEnabled(),
      sending: sendingEnabled(),
      // Powers Places discovery (finding local businesses) and PageSpeed.
      google: Boolean(process.env.GOOGLE_API_KEY),
      googleCheck: new URL(request.url).searchParams.get("verify") ? await checkGoogleKey() : "not checked",
    },
    { status: ok ? 200 : 503 },
  );
}
