import { ChartNoAxesCombined, Clock3, Eye, Heart, MessageCircle } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
export default async function AnalyticsPage(){
  const snapshots = await prisma.analyticsSnapshot.findMany({ include: { publishedPost: { include: { scheduledPost: { include: { socialAccount: true, variant: { include: { contentPackage: { include: { project: true } } } } } } } } }, orderBy: { capturedAt: "desc" } });
  const latest = [...new Map(snapshots.map((snapshot) => [snapshot.publishedPostId, snapshot])).values()];
  const totals = latest.reduce((sum, snapshot) => { const metrics = snapshot.metrics as Record<string, unknown>; sum.views += number(metrics.views); sum.watch += number(metrics.watchTimeMinutes); sum.likes += number(metrics.likes); sum.comments += number(metrics.comments); return sum; }, { views: 0, watch: 0, likes: 0, comments: 0 });
  return <div className="page"><header className="topbar"><div><p className="eyebrow">Learning loop</p><h1>Performance analytics</h1><p>Only metrics collected from connected official platform APIs are shown.</p></div></header>
    <section className="metrics"><MetricCard label="Views" value={totals.views.toLocaleString()} detail="Latest provider snapshots" icon={Eye}/><MetricCard label="Watch time" value={`${Math.round(totals.watch)}m`} detail="Minutes watched" icon={Clock3}/><MetricCard label="Likes" value={totals.likes.toLocaleString()} detail="Across connected platforms" icon={Heart}/><MetricCard label="Comments" value={totals.comments.toLocaleString()} detail="Across connected platforms" icon={MessageCircle}/></section>
    {latest.length ? <section className="panel analytics-table"><div className="panel-heading"><div><p className="eyebrow">Latest snapshots</p><h2>Published content</h2></div><ChartNoAxesCombined size={20}/></div>{latest.map((snapshot) => { const metrics = snapshot.metrics as Record<string, unknown>; const scheduled = snapshot.publishedPost.scheduledPost; return <article key={snapshot.id}><div><strong>{scheduled.variant.contentPackage.project.title}</strong><small>{scheduled.socialAccount.platform} · {snapshot.capturedAt.toISOString().slice(0,10)}</small></div><span>{number(metrics.views).toLocaleString()} views</span><span>{number(metrics.likes).toLocaleString()} likes</span><span>{number(metrics.comments).toLocaleString()} comments</span></article>; })}</section> : <section className="empty-state"><ChartNoAxesCombined size={30}/><h2>Publish to begin learning</h2><p>Analytics appear after an official publisher has reconciled a live post.</p></section>}
  </div>;
}
