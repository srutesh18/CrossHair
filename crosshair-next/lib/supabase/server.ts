import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseEnv } from "./env";

/** Request-scoped client. Every query runs as the signed-in user, so RLS applies. */
export async function createClient(): Promise<SupabaseClient> {
  const store = await cookies();
  const { url, key } = assertSupabaseEnv();
  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options?: CookieOptions }[]) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Called from a Server Component; middleware refreshes the session.
          }
        },
      },
    },
  );
}

export interface SessionContext {
  supabase: SupabaseClient;
  userId: string;
  orgId: string;
}

/**
 * The signed-in user, verified with Supabase once per request. The layout and
 * the page both need it; React's cache() makes the second call free instead of
 * another network round trip.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
});

/** The user's workspace id, also once per request. */
const getOrgId = cache(async (userId: string): Promise<string | null> => {
  const { supabase } = await getAuthUser();
  const { data, error } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.org_id as string | undefined) ?? null;
});

/**
 * Resolve the signed-in user and their org. Throws if not signed in, so route
 * handlers fail closed rather than leaking another org's rows.
 */
export async function requireSession(): Promise<SessionContext> {
  const { supabase, user } = await getAuthUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  const orgId = await getOrgId(user.id);
  if (!orgId) throw new Error("NO_ORG");
  return { supabase, userId: user.id, orgId };
}
