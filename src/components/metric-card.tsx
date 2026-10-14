import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: LucideIcon }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><Icon size={18} /></div><strong>{value}</strong><small>{detail}</small></article>;
}
