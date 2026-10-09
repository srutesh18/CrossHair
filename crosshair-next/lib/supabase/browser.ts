"use client";
import { createBrowserClient } from "@supabase/ssr";
import { assertSupabaseEnv } from "./env";

export function createClient() {
  const { url, key } = assertSupabaseEnv();
  return createBrowserClient(url, key);
}
