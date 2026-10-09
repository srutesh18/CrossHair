import Link from "next/link";
import { NavLink } from "@/components/ui/NavLink";
import { createClient } from "@/lib/supabase/server";

const NAV = [
  { href: "/finder", label: "Radar" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/setup", label: "Setup" },
];

async function currentEmail(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const email = await currentEmail();
  return (
    <div className="grid min-h-screen md:grid-cols-[224px_minmax(0,1fr)]">
      <aside
        className="flex flex-row items-center gap-1 overflow-x-auto p-3 md:flex-col md:items-stretch md:p-4"
        style={{ background: "var(--color-side)", color: "var(--color-side-fg)" }}
      >
        <Link
          href="/"
          className="hidden px-2 pb-4 text-2xl font-extrabold tracking-tight text-white md:block"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Crosshair
        </Link>
        {NAV.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} />
        ))}
        <div className="hidden md:mt-auto md:block">
          <div
            className="border-t pt-3 text-xs"
            style={{ borderColor: "rgba(255,255,255,.1)" }}
          >
            <b className="block text-[13px] text-white">Public data only</b>
            Companies come from public posts and their own websites. Nothing is sent without you.
          </div>
          {email ? (
            <form action="/auth/signout" method="post" className="mt-3 border-t pt-3 text-xs" style={{ borderColor: "rgba(255,255,255,.1)" }}>
              <span className="block truncate" title={email}>{email}</span>
              <button type="submit" className="mt-1 font-semibold text-white hover:underline">
                Sign out
              </button>
            </form>
          ) : null}
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col">{children}</main>
    </div>
  );
}
