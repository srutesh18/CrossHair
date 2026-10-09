"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="rounded-[9px] px-3 py-2 text-sm font-medium whitespace-nowrap transition hover:bg-white/10 hover:text-white"
      style={
        active
          ? { background: "rgba(255,255,255,.1)", color: "#fff", boxShadow: "inset 3px 0 0 #f2a07d" }
          : undefined
      }
    >
      {label}
    </Link>
  );
}
