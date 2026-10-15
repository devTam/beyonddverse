import Link from "next/link";
import { BookOpenText, CalendarDays, ChartNoAxesCombined, Clapperboard, Images, LayoutDashboard, Settings2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/studio/genesis-1", label: "Chapter studio", icon: Clapperboard, active: true },
  { href: "/library", label: "Bible library", icon: BookOpenText },
  { href: "/assets", label: "Media library", icon: Images },
  { href: "/calendar", label: "Publishing", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
];

export function Nav() {
  return (
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="Beyond the Verse home">
        <span className="brand-mark"><Sparkles size={18} /></span>
        <span><strong>Beyond</strong><small>the Verse</small></span>
      </Link>
      <nav aria-label="Primary navigation">
        <p className="nav-label">Workspace</p>
        {items.map(({ href, label, icon: Icon, active }) => (
          <Link className={cn("nav-item", active && "nav-item-active")} href={href} key={href}>
            <Icon size={18} strokeWidth={1.7} />{label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Link className="nav-item" href="/settings"><Settings2 size={18} />Settings</Link>
        <div className="profile"><span>TC</span><div><strong>Tammy</strong><small>Creator workspace</small></div></div>
      </div>
    </aside>
  );
}
