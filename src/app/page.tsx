import Link from "next/link";
import { ArrowRight, BookOpen, CircleDollarSign, Clock3, FileCheck2, Play, RadioTower } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { StatusPill } from "@/components/status-pill";
import { getDashboardData } from "@/lib/data";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const data = await getDashboardData();
  return <div className="page">
    <header className="topbar"><div><p className="eyebrow">Wednesday, 14 October</p><h1>Good afternoon, Tammy.</h1><p>Keep the message faithful. We’ll handle the production rhythm.</p></div><Link href="/studio/genesis-1" className="button button-primary"><Play size={16} fill="currentColor" /> Continue Genesis 1</Link></header>
    <section className="metrics" aria-label="Production summary">
      <MetricCard label="Chapters" value={data.chapters} detail={`${data.completed} completed`} icon={BookOpen} />
      <MetricCard label="Active workflows" value={data.active} detail="across production" icon={RadioTower} />
      <MetricCard label="Awaiting review" value={data.pendingScripts} detail="scripts need your voice" icon={FileCheck2} />
      <MetricCard label="Production spend" value={formatMoney(data.costs)} detail="this workspace" icon={CircleDollarSign} />
    </section>
    <div className="dashboard-grid">
      <section className="panel focus-panel"><div className="panel-heading"><div><p className="eyebrow">In production</p><h2>Genesis 1</h2></div><StatusPill status={data.recent[0]?.status ?? "DRAFT"} /></div>
        <div className="chapter-art"><div className="orb orb-one"/><div className="orb orb-two"/><span>01</span><blockquote>“In the beginning God created the heavens and the earth.”</blockquote></div>
        <div className="progress-wrap"><div><span>Production progress</span><strong>{Math.round(((data.recent[0]?.currentStage ?? 1) / 6) * 100)}%</strong></div><div className="progress"><i style={{ width: `${((data.recent[0]?.currentStage ?? 1) / 6) * 100}%` }} /></div></div>
        <Link href="/studio/genesis-1" className="text-link">Open chapter studio <ArrowRight size={16}/></Link>
      </section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Queue</p><h2>Editorial attention</h2></div><Clock3 size={20}/></div>
        <div className="queue-list">
          <div className="queue-item"><span className="queue-icon">01</span><div><strong>Review generated script</strong><small>Genesis 1 · Long form</small></div><span>Now</span></div>
          <div className="queue-item muted"><span className="queue-icon">02</span><div><strong>Approve narration</strong><small>Unlocks after script approval</small></div><span>Next</span></div>
          <div className="queue-item muted"><span className="queue-icon">03</span><div><strong>Schedule publications</strong><small>5 platform variants</small></div><span>Later</span></div>
        </div>
      </section>
    </div>
  </div>;
}
