import { CalendarDays, Check, X } from "lucide-react";
import { approveVariant, cancelScheduledPost } from "@/app/actions";
import { ScheduleForm } from "@/components/schedule-form";
import { StatusPill } from "@/components/status-pill";
import { prisma } from "@/lib/prisma";
import { RescheduleForm } from "@/components/reschedule-form";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [accounts, variants, posts] = await Promise.all([
    prisma.socialAccount.findMany({ orderBy: { platform: "asc" } }),
    prisma.contentVariant.findMany({ where: { videoRender: { status: "SUCCEEDED", assetId: { not: null } } }, include: { contentPackage: { include: { project: true } }, videoRender: true }, orderBy: { id: "desc" } }),
    prisma.scheduledPost.findMany({ include: { socialAccount: true, variant: { include: { contentPackage: { include: { project: true } } } }, publishedPost: true }, orderBy: { scheduledAt: "asc" } }),
  ]);
  const approved = variants.filter((variant) => variant.status === "APPROVED");
  return <div className="page"><header className="topbar"><div><p className="eyebrow">Distribution</p><h1>Publishing calendar</h1><p>Browser-local scheduling is converted to UTC; account time zones remain explicit.</p></div></header>
    <div className="calendar-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Ready media</p><h2>Final approval</h2></div><Check size={20}/></div><div className="approval-list">{variants.length ? variants.map((variant) => <article key={variant.id}><div><strong>{variant.contentPackage.project.title}</strong><small>{variant.kind.replaceAll("_", " ")} · {variant.videoRender?.format}</small></div>{variant.videoRender?.assetId ? <a className="text-link" href={`/api/assets/${variant.videoRender.assetId}`} target="_blank" rel="noreferrer">Preview render</a> : null}<StatusPill status={variant.status}/>{variant.status !== "APPROVED" ? <form action={approveVariant}><input type="hidden" name="variantId" value={variant.id}/><button className="button button-primary"><Check size={14}/> Final approve</button></form> : null}</article>) : <p className="empty-note">Completed renders appear here for final approval.</p>}</div></section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">New publication</p><h2>Schedule</h2></div><CalendarDays size={20}/></div><ScheduleForm variants={approved.map((variant) => ({ id: variant.id, label: `${variant.contentPackage.project.title} · ${variant.platform} · ${variant.kind.replaceAll("_", " ")}` }))} accounts={accounts.map((account) => ({ id: account.id, label: `${account.platform} · ${account.displayName}` }))}/></section></div>
    <section className="panel calendar-list"><div className="panel-heading"><div><p className="eyebrow">UTC timeline</p><h2>Scheduled and published</h2></div></div>{posts.length ? posts.map((post) => <article key={post.id}><time dateTime={post.scheduledAt.toISOString()}>{post.scheduledAt.toISOString().replace("T", " ").slice(0, 16)} UTC</time><div><strong>{post.variant.contentPackage.project.title}</strong><small>{post.socialAccount.platform} · {post.socialAccount.displayName}</small></div><StatusPill status={post.status}/>{post.publishedPost ? <a className="text-link" href={post.publishedPost.url} target="_blank" rel="noreferrer">View post</a> : post.status === "MANUAL_REQUIRED" ? <a className="text-link" href={`/api/publishing/package/${post.id}`}>Download package</a> : null}{["SCHEDULED", "MANUAL_REQUIRED"].includes(post.status) ? <RescheduleForm postId={post.id}/> : null}{["SCHEDULED", "AWAITING_APPROVAL", "MANUAL_REQUIRED"].includes(post.status) ? <form action={cancelScheduledPost}><input type="hidden" name="postId" value={post.id}/><button className="button button-ghost" aria-label="Cancel publication"><X size={14}/></button></form> : null}</article>) : <div className="empty-state"><CalendarDays size={30}/><h2>No posts scheduled</h2><p>Approve completed media and choose a connected or manual account.</p></div>}</section>
  </div>;
}
