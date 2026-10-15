import { ChartNoAxesCombined, Clock3, Eye, Heart, MessageCircle } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const day = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const selected = (key: string) => typeof params[key] === "string" ? params[key] : "";
  const from = day(selected("from"));
  const toStart = day(selected("to"));
  const to = toStart ? new Date(toStart.getTime() + 86_400_000) : null;
  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: from || to ? { capturedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : undefined,
    include: { publishedPost: { include: { scheduledPost: { include: { socialAccount: true, variant: { include: { contentPackage: { include: { scripts: true, project: { include: { chapter: { include: { book: true } }, generationCosts: true } } } } } } } } } } },
    orderBy: { capturedAt: "desc" },
  });
  const latest = [...new Map(snapshots.map((snapshot) => [snapshot.publishedPostId, snapshot])).values()];
  const platforms = [...new Set(latest.map((snapshot) => snapshot.publishedPost.scheduledPost.socialAccount.platform))].sort();
  const books = [...new Set(latest.map((snapshot) => snapshot.publishedPost.scheduledPost.variant.contentPackage.project.chapter.book.name))].sort();
  const filtered = latest.filter((snapshot) => {
    const scheduled = snapshot.publishedPost.scheduledPost;
    const project = scheduled.variant.contentPackage.project;
    const scripts = scheduled.variant.contentPackage.scripts;
    const searchable = [project.title, ...scripts.flatMap((script) => [script.title, script.hook, script.body])].join(" ").toLowerCase();
    return (!selected("platform") || scheduled.socialAccount.platform === selected("platform")) && (!selected("book") || project.chapter.book.name === selected("book")) && (!selected("chapter") || String(project.chapter.number) === selected("chapter")) && (!selected("type") || scheduled.variant.kind === selected("type")) && (!selected("topic") || searchable.includes(selected("topic").toLowerCase())) && (!selected("hook") || scripts.some((script) => script.hook.toLowerCase().includes(selected("hook").toLowerCase())));
  });
  const totals = filtered.reduce((sum, snapshot) => {
    const metrics = snapshot.metrics as Record<string, unknown>;
    sum.views += number(metrics.views); sum.impressions += number(metrics.impressions); sum.watch += number(metrics.watchTimeMinutes); sum.averageDuration += number(metrics.averageViewDurationSeconds); sum.completion += number(metrics.completionRate); sum.likes += number(metrics.likes); sum.comments += number(metrics.comments); sum.shares += number(metrics.shares); sum.saves += number(metrics.saves); sum.followers += number(metrics.followersGained); sum.revenue += number(metrics.revenueMicros);
    return sum;
  }, { views: 0, impressions: 0, watch: 0, averageDuration: 0, completion: 0, likes: 0, comments: 0, shares: 0, saves: 0, followers: 0, revenue: 0 });
  const averageDuration = filtered.length ? totals.averageDuration / filtered.length : 0;
  const completion = filtered.length ? totals.completion / filtered.length : 0;
  const types = [...new Set(latest.map((snapshot) => snapshot.publishedPost.scheduledPost.variant.kind))].sort();

  return <div className="page"><header className="topbar"><div><p className="eyebrow">Learning loop</p><h1>Performance analytics</h1><p>Only metrics collected from connected official platform APIs are shown; unavailable fields remain zero.</p></div></header>
    <section className="panel"><form className="settings-form" method="get"><label>Platform<select name="platform" defaultValue={selected("platform")}><option value="">All platforms</option>{platforms.map((value) => <option key={value}>{value}</option>)}</select></label><label>Book<select name="book" defaultValue={selected("book")}><option value="">All books</option>{books.map((value) => <option key={value}>{value}</option>)}</select></label><label>Chapter<input name="chapter" inputMode="numeric" defaultValue={selected("chapter")} placeholder="Any"/></label><label>Video type<select name="type" defaultValue={selected("type")}><option value="">All types</option>{types.map((value) => <option key={value}>{value}</option>)}</select></label><label>Topic<input name="topic" defaultValue={selected("topic")} placeholder="creation"/></label><label>Hook contains<input name="hook" defaultValue={selected("hook")} placeholder="opening phrase"/></label><label>From<input type="date" name="from" defaultValue={selected("from")}/></label><label>To<input type="date" name="to" defaultValue={selected("to")}/></label><button className="button button-primary">Apply report</button></form></section>
    <section className="metrics"><MetricCard label="Views" value={totals.views.toLocaleString()} detail={`${totals.impressions.toLocaleString()} impressions`} icon={Eye}/><MetricCard label="Watch time" value={`${Math.round(totals.watch)}m`} detail={`${Math.round(averageDuration)}s average · ${completion.toFixed(1)}% completion`} icon={Clock3}/><MetricCard label="Likes" value={totals.likes.toLocaleString()} detail={`${totals.shares.toLocaleString()} shares · ${totals.saves.toLocaleString()} saves`} icon={Heart}/><MetricCard label="Comments" value={totals.comments.toLocaleString()} detail={`${totals.followers.toLocaleString()} follower growth`} icon={MessageCircle}/></section>
    {filtered.length ? <section className="panel analytics-table"><div className="panel-heading"><div><p className="eyebrow">Latest snapshots</p><h2>Published content</h2></div><ChartNoAxesCombined size={20}/></div>{filtered.map((snapshot) => { const metrics = snapshot.metrics as Record<string, unknown>; const scheduled = snapshot.publishedPost.scheduledPost; const costs = scheduled.variant.contentPackage.project.generationCosts.reduce((sum, cost) => sum + cost.amountMicros, 0n); return <article key={snapshot.id}><div><strong>{scheduled.variant.contentPackage.project.title}</strong><small>{scheduled.variant.contentPackage.project.chapter.book.name} {scheduled.variant.contentPackage.project.chapter.number} · {scheduled.socialAccount.platform} · {scheduled.variant.kind.replaceAll("_", " ")} · {snapshot.capturedAt.toISOString().slice(0,10)}</small></div><span>{number(metrics.views).toLocaleString()} views</span><span>{number(metrics.likes).toLocaleString()} likes</span><span>{formatMoney(costs)} cost</span></article>; })}</section> : <section className="empty-state"><ChartNoAxesCombined size={30}/><h2>No matching analytics</h2><p>Publish through an official adapter and collect analytics, or broaden the report filters.</p></section>}
    <section className="panel"><p className="eyebrow">Recommendations</p><h2>Evidence threshold</h2><p className="settings-copy">{filtered.length >= 10 ? "Enough snapshots exist for a recommendation run. Recommendations are generated only on request so analytics collection cannot silently incur AI costs." : `At least 10 matching published artifacts are required before AI recommendations are enabled (${filtered.length}/10).`}</p>{totals.revenue ? <p className="settings-copy">Accessible platform revenue: {formatMoney(BigInt(Math.round(totals.revenue)))}</p> : null}</section>
  </div>;
}
