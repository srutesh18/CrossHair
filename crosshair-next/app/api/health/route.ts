import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { modelName } from "@/lib/ai";
import { typesafeEnabled } from "@/lib/ai/typesafe";
import { sendingEnabled } from "@/lib/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Configuration check for deploys. Reports what is set, never the values.
 * `schema` is true once the migrations have created the tables.
 */
export async function GET() {
  let schema = false;
  if (SUPABASE_URL && SUPABASE_PUBLIC_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      auth: { persistSession: false },
    });
    // RLS returns zero rows to an anonymous caller, but no error once the table exists.
    const { error } = await supabase.from("orgs").select("id").limit(1);
    schema = !error;
  }
  const ok = Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY && process.env.GROQ_API_KEY && schema);
  return NextResponse.json(
    {
      ok,
      supabase: Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY),
      schema,
      ai: Boolean(process.env.GROQ_API_KEY),
      model: modelName(),
      crossCheck: typesafeEnabled(),
      sending: sendingEnabled(),
    },
    { status: ok ? 200 : 503 },
  );
}
