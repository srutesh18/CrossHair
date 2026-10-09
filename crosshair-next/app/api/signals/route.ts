import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(2000),
  status: z.enum(["new", "dismissed"]),
});

/** Bulk dismiss / restore. Leads already made into leads are left alone. */
export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Select at least one lead." }, { status: 400 });
    const { data, error } = await supabase
      .from("signals")
      .update({ status: parsed.data.status })
      .in("id", parsed.data.ids)
      .neq("status", "promoted")
      .select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ updated: data?.length ?? 0 });
  } catch (err) {
    return errorResponse(err);
  }
}
