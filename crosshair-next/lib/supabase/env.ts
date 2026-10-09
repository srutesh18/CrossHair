/**
 * Supabase credentials, tolerant of both key generations.
 *
 * New projects issue a publishable key (sb_publishable_...) exposed as
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Older ones issue an anon JWT as
 * NEXT_PUBLIC_SUPABASE_ANON_KEY. Either is safe in the browser - RLS is what
 * protects the data.
 *
 * These must be read as full literal process.env.X expressions, not via a
 * helper taking a variable name, because Next inlines NEXT_PUBLIC_* at build
 * time by static text match.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export function assertSupabaseEnv(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart the dev server.",
    );
  }
  return { url: SUPABASE_URL, key: SUPABASE_PUBLIC_KEY };
}
