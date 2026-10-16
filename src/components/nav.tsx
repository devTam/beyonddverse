"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useLinkStatus } from "next/link";
import Link from "next/link";
import { Activity, BookOpenText, CalendarDays, ChartNoAxesCombined, Clapperboard, Images, LayoutDashboard, Settings2, Sparkles, Menu, X, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/studio", label: "Chapter studio", icon: Clapperboard },
  { href: "/library", label: "Bible library", icon: BookOpenText },
  { href: "/assets", label: "Media library", icon: Images },
  { href: "/calendar", label: "Publishing", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
  { href: "/operations", label: "Operations", icon: Activity },
];

function LinkProgress() {
  const { pending } = useLinkStatus();
  return pending ? <LoaderCircle size={14} className="spin nav-progress" aria-label="Loading page"/> : null;
}

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <aside className={`sidebar${open ? " sidebar-open" : ""}`}>
      <Link href="/" className="brand" aria-label="Beyond the Verse home">
        <span className="brand-mark"><Sparkles size={18} /></span>
        <span><strong>Beyond</strong><small>the Verse</small></span>
      </Link>
      <button className="mobile-nav-toggle" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button>
      <nav id="primary-navigation" aria-label="Primary navigation">
        <p className="nav-label">Workspace</p>
        {items.map(({ href, label, icon: Icon }) => (
          <Link className={cn("nav-item", isActive(href) && "nav-item-active")} href={href} key={href} aria-current={isActive(href) ? "page" : undefined} title={label} onNavigate={() => setOpen(false)}>
            <Icon size={18} strokeWidth={1.7} /><span className="nav-text">{label}</span><LinkProgress/>
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Link className={cn("nav-item", isActive("/settings") && "nav-item-active")} href="/settings" title="Settings" aria-current={isActive("/settings") ? "page" : undefined} onNavigate={() => setOpen(false)}><Settings2 size={18} /><span className="nav-text">Settings</span><LinkProgress/></Link>
        <div className="profile"><span>TC</span><div><strong>Tammy</strong><small>Creator workspace</small></div></div>
      </div>
    </aside>
  );
}
