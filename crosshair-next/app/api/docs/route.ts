import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { ingestDoc, slugify, titleFrom, type IngestResult } from "@/lib/rag/ingest";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_DOC_CHARS = 60_000;

const Upload = z.object({
  docs: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        content: z.string().min(1, "A doc is empty").max(MAX_DOC_CHARS, "A doc is over 60k characters"),
      }),
    )
    .min(1)
    .max(20),
});

/** The org's docs with their embedded chunk counts. */
export async function GET() {
  try {
    const { supabase } = await requireSession();
    const { data, error } = await supabase
      .from("docs")
      .select("id, title, slug, doc_chunks(count)")
      .order("title");
    if (error) throw new Error(error.message);
    return NextResponse.json({ docs: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Upload markdown or text docs about your product and embed them under
 * the signed-in user's session. RLS keeps every row inside their org.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, orgId } = await requireSession();
    const body: unknown = await request.json().catch(() => ({}));

    const parsed = Upload.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    const inputs = parsed.data.docs;

    const results: IngestResult[] = [];
    for (const doc of inputs) {
      const base = doc.name.replace(/\.md$/i, "");
      results.push(
        await ingestDoc(supabase, orgId, {
          title: titleFrom(doc.content, base),
          slug: slugify(base),
          content: doc.content,
        }),
      );
    }
    return NextResponse.json({ docs: results });
  } catch (err) {
    return errorResponse(err);
  }
}
