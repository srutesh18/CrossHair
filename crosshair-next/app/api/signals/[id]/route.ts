import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({ status: z.enum(["new", "dismissed"]) });

/** Dismiss a signal, or restore it to the inbox. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    const { data, error } = await supabase
      .from("signals")
      .update({ status: parsed.data.status })
      .eq("id", id)
      .neq("status", "promoted")
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return NextResponse.json({ error: "Signal not found or already a lead." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
