import { ActionForm, SubmitButton } from "@/components/action-form";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Check, Circle, Download, LockKeyhole, Play } from "lucide-react";
import { ExplanationForm } from "@/components/explanation-form";
import { ScriptReview } from "@/components/script-review";
import { StatusPill } from "@/components/status-pill";
import { WorkflowStatus } from "@/components/workflow-status";
import { ShortsReview } from "@/components/shorts-review";
import { getChapterProject } from "@/lib/data";
import { approveVariant, updateAssetApproval } from "@/app/actions";
import { createSignedDeliveryUrl } from "@/lib/storage/cloudinary";
import { getProductionSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const stages = ["Explanation", "References", "Lesson", "Narration", "Presenter & visuals", "Publish"];

export default async function GenesisStudio({ searchParams }: { searchParams: Promise<{ workflow?: string; script?: string; project?: string }> }) {
  const { workflow, script: requestedScriptId, project: requestedProjectId } = await searchParams;
  const project = await getChapterProject(requestedProjectId, workflow, requestedScriptId);
  const thumbnails = await prisma.asset.findMany({ where: { projectId: project.id, kind: "THUMBNAIL" }, orderBy: { createdAt: "desc" }, take: 6 });
  const [settings, presenterJobs, supportingMedia] = await Promise.all([
    getProductionSettings(),
    prisma.avatarGeneration.findMany({ where: { projectId: project.id, sceneId: { not: null } }, orderBy: { createdAt: "desc" } }),
    prisma.asset.findMany({ where: { kind: { in: ["IMAGE", "VIDEO"] }, status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const presenterAssetIds = presenterJobs.flatMap((job) => job.assetId ? [job.assetId] : []);
  const presenterAssets = presenterAssetIds.length ? await prisma.asset.findMany({ where: { id: { in: presenterAssetIds } } }) : [];
  const explanation = project.explanations[0];
  const contentPackage = project.contentPackages[0];
  const revisions = contentPackage?.scripts.filter((item) => item.kind === "LONG_FORM") ?? [];
  const script = revisions.find((item) => item.id === requestedScriptId) ?? revisions[0];
  const shorts = contentPackage?.scripts.filter((item, index, items) => item.kind.startsWith("SHORT_") && items.findIndex((candidate) => candidate.kind === item.kind) === index) ?? [];
  const validation = contentPackage?.validationReport as { valid?: boolean } | null;
  const reviewScript = script ? { ...script, scenes: script.scenes.map((scene) => {
    const visual = scene.assetUsages.find((usage) => usage.role === "PRIMARY_VISUAL");
    const job = presenterJobs.find((item) => item.sceneId === scene.id && item.narrationId === scene.narrations[0]?.id);
    const avatar = presenterAssets.find((asset) => asset.id === job?.assetId);
    return { ...scene, durationMs: scene.narrations[0]?.asset.durationMs ?? scene.durationMs, narrationUrl: scene.narrations[0] ? createSignedDeliveryUrl(scene.narrations[0].asset) : null, visual: visual ? { id: visual.asset.id, url: `/api/assets/${visual.asset.id}`, status: visual.asset.status, mimeType: visual.asset.mimeType } : null, presenterIssue: job?.status === "FAILED" ? job.error : null, presenterVideo: avatar ? { id: avatar.id, url: `/api/assets/${avatar.id}`, status: avatar.status } : null };
  }) } : null;
  const reviewShorts = shorts.map((short) => ({ ...short, scenes: short.scenes.map((scene) => { const visual = scene.assetUsages.find((usage) => usage.role === "PRIMARY_VISUAL"); const job = presenterJobs.find((job) => job.sceneId === scene.id && job.narrationId === scene.narrations[0]?.id); const avatar = presenterAssets.find((asset) => asset.id === job?.assetId); return { ...scene, presenterVideo: avatar ? { id: avatar.id, url: `/api/assets/${avatar.id}`, status: avatar.status } : null, narrationUrl: scene.narrations[0] ? `/api/assets/${scene.narrations[0].asset.id}` : null, visual: visual ? { id: visual.asset.id, url: `/api/assets/${visual.asset.id}`, status: visual.asset.status } : null }; }) }));
  const rendered = contentPackage?.variants.filter((variant) => variant.videoRender?.status === "SUCCEEDED" && variant.videoRender.asset) ?? [];
  return <div className="page studio-page">
    <header className="studio-top"><div><Link href="/" className="back"><ArrowLeft size={16}/> Dashboard</Link><div className="title-row"><div><p className="eyebrow">{project.chapter.book.name} · Chapter {project.chapter.number}</p><h1>{project.title}</h1></div><StatusPill status={project.status}/></div></div><div className="autosave"><i/> Database connected</div></header>
    <ol className="stagebar">{stages.map((stage, index) => <li className={index + 1 <= project.currentStage ? "complete" : ""} key={stage}>{index + 1 < project.currentStage ? <Check size={13}/> : index + 1 === project.currentStage ? <Circle size={13} fill="currentColor"/> : <LockKeyhole size={12}/>}<span>{stage}</span></li>)}</ol>
    {workflow ? <WorkflowStatus key={workflow} workflowId={workflow} projectId={project.id}/> : null}
    <nav className="studio-sections" aria-label="Chapter content">{reviewScript ? <a href="#long-form">Long-form script</a> : null}{shorts.length ? <a href="#shorts">Shorts ({shorts.length})</a> : null}{rendered.length ? <a href="#video-output">Rendered videos ({rendered.length})</a> : null}</nav>
    <div className="studio-layout"><div className="studio-main">
      <ExplanationForm projectId={project.id} value={explanation?.editableText ?? ""} revision={explanation?.revision}/>
      <details className="studio-card scripture-card"><summary>Supporting Scripture · {project.chapter.verses[0]?.translation.name ?? settings.bibleTranslationCode}</summary><div className="scripture-scroll">{project.chapter.verses.map((verse) => <p key={verse.id}><sup>{verse.number}</sup>{verse.text}</p>)}</div></details>
      <p className="settings-copy"><Link href="/settings">Set up or review your consistent AI presenter →</Link></p>
      {reviewScript ? <ScriptReview
        script={reviewScript}
        narrationReady={reviewScript.scenes.every((scene) => scene.narrations.length > 0)}
        visualsReady={reviewScript.scenes.every((scene) => scene.presentation === "presenter" || scene.assetUsages.some((usage) => usage.role === "PRIMARY_VISUAL" && usage.asset.status === "APPROVED"))}
        revisions={revisions.map((item) => ({ id: item.id, revision: item.revision, status: item.status, createdAt: item.createdAt }))}
        avatarRatePerMinute={settings.avatarRatePerMinute}
        supportingMedia={supportingMedia.map((asset) => ({ id: asset.id, label: `${asset.kind.toLowerCase()} · ${asset.storageKey}` }))}
        validation={contentPackage.validationReport}
      /> : null}
      {thumbnails.length ? <section className="studio-card thumbnail-review"><div className="section-title"><div><span className="step-number">04</span><div><p className="eyebrow">Publication artwork</p><h2>Thumbnail review</h2></div></div></div><div className="thumbnail-grid">{thumbnails.map((thumbnail) => <article key={thumbnail.id}><Image src={`/api/assets/${thumbnail.id}`} alt="Generated YouTube thumbnail" width={1280} height={720} unoptimized/><div className="action-row"><span>{thumbnail.status.toLowerCase()}</span>{thumbnail.status !== "APPROVED" ? <ActionForm action={updateAssetApproval}><input type="hidden" name="assetId" value={thumbnail.id}/><SubmitButton className="button button-primary" name="status" value="APPROVED">Approve</SubmitButton><SubmitButton className="button button-ghost" name="status" value="REJECTED">Reject</SubmitButton></ActionForm> : null}</div></article>)}</div></section> : null}
      {shorts.length ? <ShortsReview scripts={reviewShorts} citationsValid={Boolean(validation?.valid)}/> : null}
      {rendered.length ? <section className="studio-card render-output" id="video-output"><div className="section-title"><div><span className="step-number">05</span><div><p className="eyebrow">Completed media</p><h2>Video output</h2></div></div><Play size={20}/></div>{rendered.map((variant) => { const asset = variant.videoRender?.asset; if (!asset) return null; return <article key={variant.id} id={`video-${variant.id}`} className="video-output-card"><div><strong>{variant.kind.replaceAll("_", " ")}</strong><small>{variant.videoRender?.format} · {variant.status.toLowerCase()}</small></div><video controls preload="metadata" src={`/api/assets/${asset.id}`}>Your browser does not support video playback.</video><div className="action-row"><a className="button button-secondary" href={`/api/assets/${asset.id}`} download><Download size={15}/> Download video</a>{variant.status !== "APPROVED" ? <ActionForm action={approveVariant}><input type="hidden" name="variantId" value={variant.id}/><SubmitButton className="button button-primary"><Check size={15}/> Approve final video</SubmitButton></ActionForm> : null}</div></article>; })}</section> : null}
    </div><aside className="context-panel"><p className="eyebrow">Production notes</p><h3>Guardrails</h3><ul><li><Check size={14}/>Creator explanation remains the interpretive source.</li><li><Check size={14}/>Direct quotations are checked against WEB text.</li><li><Check size={14}/>Generated commentary stays visibly distinct.</li><li><Check size={14}/>Media spend is locked until approval.</li></ul><hr/><p className="eyebrow">Latest activity</p>{project.workflowRuns.length ? project.workflowRuns.map((run) => <div className="activity" key={run.id}><i/><div><strong>{run.type.replaceAll("_", " ").toLowerCase()}</strong><small>{run.status.toLowerCase()}</small></div></div>) : <p className="empty-note">No workflows have run yet.</p>}</aside></div>
  </div>;
}
