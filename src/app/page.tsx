import Link from "next/link";
import { ArrowRight, BookOpen, CircleDollarSign, Clock3, FileCheck2, Play, RadioTower } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { StatusPill } from "@/components/status-pill";
import { getDashboardData } from "@/lib/data";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const data = await getDashboardData();
  const focus = data.recent[0];
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Lagos" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return <div className="page">
    <header className="topbar"><div><p className="eyebrow">{date}</p><h1>{greeting}.</h1><p>Keep the message faithful. We’ll handle the production rhythm.</p></div>{focus ? <Link href={`/studio/genesis-1?project=${focus.id}`} className="button button-primary"><Play size={16} fill="currentColor" /> Continue {focus.chapter.book.name} {focus.chapter.number}</Link> : <Link href="/library" className="button button-primary"><BookOpen size={16}/> Choose a chapter</Link>}</header>
    <section className="metrics" aria-label="Production summary">
      <MetricCard label="Chapters" value={data.chapters} detail={`${data.completed} completed`} icon={BookOpen} />
      <MetricCard label="Active workflows" value={data.active} detail="across production" icon={RadioTower} />
      <MetricCard label="Awaiting review" value={data.pendingScripts} detail="scripts need your voice" icon={FileCheck2} />
      <MetricCard label="Production spend" value={formatMoney(data.costs)} detail="this workspace" icon={CircleDollarSign} />
    </section>
    <div className="dashboard-grid">
      <section className="panel focus-panel"><div className="panel-heading"><div><p className="eyebrow">{focus ? "In production" : "Start producing"}</p><h2>{focus ? `${focus.chapter.book.name} ${focus.chapter.number}` : "Choose a Bible chapter"}</h2></div>{focus ? <StatusPill status={focus.status}/> : null}</div>
        <div className="chapter-art"><div className="orb orb-one"/><div className="orb orb-two"/><span>{String(focus?.chapter.number ?? 1).padStart(2, "0")}</span><blockquote>{focus?.title ?? "Genesis through Revelation is ready in the Scripture library."}</blockquote></div>
        {focus ? <><div className="progress-wrap"><div><span>Production progress</span><strong>{Math.round((focus.currentStage / 6) * 100)}%</strong></div><div className="progress"><i style={{ width: `${(focus.currentStage / 6) * 100}%` }} /></div></div><Link href={`/studio/genesis-1?project=${focus.id}`} className="text-link">Open chapter studio <ArrowRight size={16}/></Link></> : <Link href="/library" className="text-link">Open Scripture library <ArrowRight size={16}/></Link>}
      </section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Queue</p><h2>Editorial attention</h2></div><Clock3 size={20}/></div>
        <div className="queue-list">
          <div className="queue-item"><span className="queue-icon">01</span><div><strong>Review generated scripts</strong><small>Human approval required</small></div><span>{data.pendingScripts}</span></div>
          <div className="queue-item"><span className="queue-icon">02</span><div><strong>Approve completed videos</strong><small>Ready for final review</small></div><span>{data.pendingVideos}</span></div>
          <div className="queue-item"><span className="queue-icon">03</span><div><strong>Scheduled publications</strong><small>{data.failed ? `${data.failed} failed publication${data.failed === 1 ? "" : "s"}` : "No publishing failures"}</small></div><span>{data.scheduled}</span></div>
        </div>
      </section>
    </div>
    <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Distribution</p><h2>Recent publications</h2></div></div><div className="queue-list">{data.recentPublished.length ? data.recentPublished.map((post) => <div className="queue-item" key={post.id}><div><strong>{post.scheduledPost.variant.contentPackage.project.title}</strong><small>{post.scheduledPost.socialAccount.platform} · {post.publishedAt.toISOString().slice(0, 10)}</small></div><a className="text-link" href={post.url} target="_blank" rel="noreferrer">View</a></div>) : <p className="empty-note">No official publications yet.</p>}</div></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Official API data</p><h2>Platform performance</h2></div></div><div className="queue-list">{data.platformPerformance.length ? data.platformPerformance.map((row) => <div className="queue-item" key={row.platform}><div><strong>{row.platform}</strong><small>{row.likes.toLocaleString()} likes · {row.comments.toLocaleString()} comments</small></div><span>{row.views.toLocaleString()} views</span></div>) : <p className="empty-note">Performance summaries appear after analytics collection.</p>}</div></section></div>
  </div>;
}
