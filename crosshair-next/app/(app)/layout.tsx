import { Sidebar, type SidebarStats } from "@/components/ui/Sidebar";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { getAuthUser } from "@/lib/supabase/server";

const WEEKLY_GOAL = 20;

/** Live numbers for the sidebar. Every query runs as the user (RLS). */
async function sidebarData(): Promise<{ email: string | null; stats: SidebarStats | null }> {
  try {
    // Shared with the page via cache(): one auth round trip per request.
    const { supabase, user } = await getAuthUser();
    if (!user) return { email: null, stats: null };
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);

    const [review, strong, due, pipeline, sent, run] = await Promise.all([
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "audited"),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "audited").gte("score", 60),
      supabase.from("outreach").select("id", { count: "exact", head: true }).eq("stage", "emailed").lte("next_step", 2).lte("next_action_at", now.toISOString()),
      supabase.from("outreach").select("id", { count: "exact", head: true }).in("stage", ["to_contact", "emailed", "replied"]),
      supabase.from("outreach_emails").select("id", { count: "exact", head: true }).gte("sent_at", weekStart.toISOString()),
      supabase.from("crawl_runs").select("finished_at, started_at").eq("query", "auto-discovery").order("started_at", { ascending: false }).limit(1),
    ]);
    const last = (run.data ?? [])[0] as { finished_at: string | null; started_at: string } | undefined;
    return {
      email: user.email ?? null,
      stats: {
        toReview: review.count ?? 0,
        strong: strong.count ?? 0,
        due: due.count ?? 0,
        inPipeline: pipeline.count ?? 0,
        sentThisWeek: sent.count ?? 0,
        weeklyGoal: WEEKLY_GOAL,
        lastScan: last ? last.finished_at ?? last.started_at : null,
      },
    };
  } catch {
    return { email: null, stats: null };
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email, stats } = await sidebarData();
  return (
    <div className="grid min-h-screen md:grid-cols-[256px_minmax(0,1fr)]">
      <Sidebar email={email} stats={stats} />
      <main className="ch-rise flex min-h-0 min-w-0 flex-col">{children}</main>
      <CommandPalette />
    </div>
  );
}
