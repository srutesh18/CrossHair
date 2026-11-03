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

    // One round trip instead of six; RLS still scopes every count to this org.
    const { data, error } = await supabase.rpc("sidebar_stats");
    if (error) throw new Error(error.message);
    const s = (data ?? {}) as {
      to_review?: number;
      strong?: number;
      due?: number;
      in_pipeline?: number;
      sent_this_week?: number;
      last_scan?: string | null;
    };

    return {
      email: user.email ?? null,
      stats: {
        toReview: s.to_review ?? 0,
        strong: s.strong ?? 0,
        due: s.due ?? 0,
        inPipeline: s.in_pipeline ?? 0,
        sentThisWeek: s.sent_this_week ?? 0,
        weeklyGoal: WEEKLY_GOAL,
        lastScan: s.last_scan ?? null,
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
