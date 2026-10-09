import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

/** Delete a doc; its chunks cascade. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireSession();
    const { data, error } = await supabase.from("docs").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return NextResponse.json({ error: "Doc not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
