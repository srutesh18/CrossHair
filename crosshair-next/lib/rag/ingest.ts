import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedAll } from "./embed";

/** Split on blank lines, then pack into ~800-character chunks. */
export function chunk(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + p.length > 800) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** First markdown heading, else the fallback. */
export function titleFrom(markdown: string, fallback: string): string {
  const heading = /^#\s+(.+)$/m.exec(markdown);
  return heading?.[1]?.trim() || fallback;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/\.md$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "doc"
  );
}

export interface IngestResult {
  id: string;
  title: string;
  slug: string;
  chunks: number;
}

/**
 * Upsert one doc and replace its embedded chunks. Works with either a
 * user-session client (RLS limits it to their org) or the service client used
 * by scripts/embed-docs.ts.
 */
export async function ingestDoc(
  supabase: SupabaseClient,
  orgId: string,
  doc: { title: string; slug: string; content: string },
): Promise<IngestResult> {
  const content = doc.content.trim();
  if (!content) throw new Error(`${doc.slug}: the doc is empty`);

  // Embed first, so a failure never leaves a doc with no chunks.
  const pieces = chunk(content);
  const vectors = await embedAll(pieces);

  const { data: saved, error } = await supabase
    .from("docs")
    .upsert(
      { org_id: orgId, title: doc.title, slug: doc.slug, content },
      { onConflict: "org_id,slug" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`${doc.slug}: ${error.message}`);
  const docId = saved.id as string;

  const { error: delErr } = await supabase.from("doc_chunks").delete().eq("doc_id", docId);
  if (delErr) throw new Error(`${doc.slug}: ${delErr.message}`);

  const rows = pieces.map((text, i) => ({
    org_id: orgId,
    doc_id: docId,
    content: text,
    embedding: vectors[i],
  }));
  const { error: insErr } = await supabase.from("doc_chunks").insert(rows);
  if (insErr) throw new Error(`${doc.slug}: ${insErr.message}`);

  return { id: docId, title: doc.title, slug: doc.slug, chunks: pieces.length };
}
