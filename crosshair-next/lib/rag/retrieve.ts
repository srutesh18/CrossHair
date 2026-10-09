import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "./embed";

export interface RetrievedDoc {
  title: string;
  content: string;
  similarity: number;
}

/**
 * Vector search over the org's product docs. The RPC is security invoker, so
 * RLS still scopes results to the caller's org.
 */
export async function retrieveDocs(
  supabase: SupabaseClient,
  query: string,
  k = 3,
): Promise<RetrievedDoc[]> {
  const embedding = await embed(query);
  const { data, error } = await supabase.rpc("match_doc_chunks", {
    query_embedding: embedding,
    match_count: k,
  });
  if (error) throw new Error(`Doc retrieval failed: ${error.message}`);

  const rows = (data ?? []) as Array<{ title: string; content: string; similarity: number }>;
  return rows.map((r) => ({
    title: r.title,
    content: r.content,
    similarity: r.similarity,
  }));
}
