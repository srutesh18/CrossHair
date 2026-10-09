import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORY_KEYS, type Category } from "./classify";
import { SOURCE_KEYS, type SourceKey } from "./run";

export interface Signal {
  id: string;
  source: SourceKey;
  source_name: string;
  source_url: string;
  author: string;
  title: string;
  body: string;
  posted_at: string | null;
  competitor: string;
  service: string;
  category: Category;
  category_confidence: number;
  category_by: "rules" | "typesafe";
  intent: number;
  matched: string[];
  status: "new" | "promoted" | "dismissed";
  lead_id: string | null;
  created_at: string;
}

export interface SignalFilters {
  q: string;
  source: SourceKey | "all";
  category: Category | "all";
  competitor: string;
  service: string;
  minIntent: number;
  days: number;
  status: "new" | "promoted" | "dismissed" | "all";
  sort: "intent" | "recent";
}

type Params = URLSearchParams | Record<string, string | undefined>;

function get(params: Params, key: string): string {
  if (params instanceof URLSearchParams) return params.get(key) ?? "";
  return params[key] ?? "";
}

export function parseSignalFilters(params: Params): SignalFilters {
  const source = get(params, "source");
  const category = get(params, "category");
  const status = get(params, "status");
  const minIntent = Number(get(params, "minIntent"));
  const days = Number(get(params, "days"));
  return {
    q: get(params, "q").slice(0, 100),
    source: (SOURCE_KEYS as readonly string[]).includes(source) ? (source as SourceKey) : "all",
    category: (CATEGORY_KEYS as readonly string[]).includes(category) ? (category as Category) : "all",
    competitor: get(params, "competitor").slice(0, 100),
    service: get(params, "service").slice(0, 100),
    minIntent: Number.isFinite(minIntent) ? Math.max(0, Math.min(100, minIntent)) : 0,
    days: [7, 30, 90, 365].includes(days) ? days : 0,
    status: status === "promoted" || status === "dismissed" || status === "all" ? status : "new",
    sort: get(params, "sort") === "recent" ? "recent" : "intent",
  };
}

export function filtersToQuery(f: SignalFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.source !== "all") p.set("source", f.source);
  if (f.category !== "all") p.set("category", f.category);
  if (f.competitor) p.set("competitor", f.competitor);
  if (f.service) p.set("service", f.service);
  if (f.minIntent) p.set("minIntent", String(f.minIntent));
  if (f.days) p.set("days", String(f.days));
  if (f.status !== "new") p.set("status", f.status);
  if (f.sort !== "intent") p.set("sort", f.sort);
  return p.toString();
}

/** Runs as the signed-in user, so RLS limits rows to their org. */
/** Specific signals by id (RLS still applies), newest intent first. */
export async function getSignalsByIds(supabase: SupabaseClient, ids: string[]): Promise<Signal[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .in("id", ids)
    .order("intent", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Signal[];
}

export async function getSignals(
  supabase: SupabaseClient,
  f: SignalFilters,
  limit = 300,
): Promise<Signal[]> {
  let query = supabase.from("signals").select("*");
  if (f.status !== "all") query = query.eq("status", f.status);
  if (f.source !== "all") query = query.eq("source", f.source);
  if (f.category !== "all") query = query.eq("category", f.category);
  if (f.competitor) query = query.ilike("competitor", f.competitor);
  if (f.service) query = query.ilike("service", f.service);
  if (f.minIntent) query = query.gte("intent", f.minIntent);
  if (f.days) {
    const since = new Date(Date.now() - f.days * 24 * 3600 * 1000).toISOString();
    query = query.or(`posted_at.gte.${since},and(posted_at.is.null,created_at.gte.${since})`);
  }
  if (f.q.trim()) {
    const term = `%${f.q.trim().replace(/[%,()*\\]/g, " ")}%`;
    query = query.or(`title.ilike.${term},body.ilike.${term},author.ilike.${term}`);
  }
  query =
    f.sort === "recent"
      ? query.order("posted_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })
      : query.order("intent", { ascending: false }).order("posted_at", { ascending: false, nullsFirst: false });
  const { data, error } = await query.limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Signal[];
}
