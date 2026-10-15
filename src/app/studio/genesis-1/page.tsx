import Link from "next/link";
import { ArrowLeft, BookMarked, Check, Circle, LockKeyhole } from "lucide-react";
import { ExplanationForm } from "@/components/explanation-form";
import { ScriptReview } from "@/components/script-review";
import { StatusPill } from "@/components/status-pill";
import { WorkflowStatus } from "@/components/workflow-status";
import { ShortsReview } from "@/components/shorts-review";
import { getGenesisProject } from "@/lib/data";

export const dynamic = "force-dynamic";

const stages = ["Source", "Explanation", "Script", "Narration", "Visuals", "Publish"];

export default async function GenesisStudio({ searchParams }: { searchParams: Promise<{ workflow?: string; script?: string }> }) {
  const { workflow, script: requestedScriptId } = await searchParams;
  const project = await getGenesisProject();
  const explanation = project.explanations[0];
  const contentPackage = project.contentPackages[0];
  const revisions = contentPackage?.scripts.filter((item) => item.kind === "LONG_FORM") ?? [];
  const script = revisions.find((item) => item.id === requestedScriptId) ?? revisions[0];
  const shorts = contentPackage?.scripts.filter((item, index, items) => item.kind.startsWith("SHORT_") && items.findIndex((candidate) => candidate.kind === item.kind) === index) ?? [];
  const validation = contentPackage?.validationReport as { valid?: boolean } | null;
  return <div className="page studio-page">
    <header className="studio-top"><div><Link href="/" className="back"><ArrowLeft size={16}/> Dashboard</Link><div className="title-row"><div><p className="eyebrow">{project.chapter.book.name} · Chapter {project.chapter.number}</p><h1>{project.title}</h1></div><StatusPill status={project.status}/></div></div><div className="autosave"><i/> Database connected</div></header>
    <ol className="stagebar">{stages.map((stage, index) => <li className={index + 1 <= project.currentStage ? "complete" : ""} key={stage}>{index + 1 < project.currentStage ? <Check size={13}/> : index + 1 === project.currentStage ? <Circle size={13} fill="currentColor"/> : <LockKeyhole size={12}/>}<span>{stage}</span></li>)}</ol>
    {workflow ? <WorkflowStatus workflowId={workflow}/> : null}
    <div className="studio-layout"><div className="studio-main">
      <section className="studio-card scripture-card"><div className="section-title"><div><span className="step-number">01</span><div><p className="eyebrow">Source of truth</p><h2>World English Bible</h2></div></div><BookMarked size={20}/></div><div className="scripture-scroll">{project.chapter.verses.map((verse) => <p key={verse.id}><sup>{verse.number}</sup>{verse.text}</p>)}</div></section>
      <ExplanationForm projectId={project.id} value={explanation?.editableText ?? ""} revision={explanation?.revision}/>
      {script && <ScriptReview script={script} narrationReady={script.scenes.every((scene) => scene.narrations.length > 0)} visualsReady={script.scenes.every((scene) => scene.assetUsages.some((usage) => usage.role === "PRIMARY_VISUAL" && usage.asset.status === "APPROVED"))} revisions={revisions.map((item) => ({ id: item.id, revision: item.revision, status: item.status, createdAt: item.createdAt }))} validation={contentPackage.validationReport}/>}
      {shorts.length ? <ShortsReview scripts={shorts} citationsValid={Boolean(validation?.valid)}/> : null}
    </div><aside className="context-panel"><p className="eyebrow">Production notes</p><h3>Guardrails</h3><ul><li><Check size={14}/>Creator explanation remains the interpretive source.</li><li><Check size={14}/>Direct quotations are checked against WEB text.</li><li><Check size={14}/>Generated commentary stays visibly distinct.</li><li><Check size={14}/>Media spend is locked until approval.</li></ul><hr/><p className="eyebrow">Latest activity</p>{project.workflowRuns.length ? project.workflowRuns.map((run) => <div className="activity" key={run.id}><i/><div><strong>{run.type.replaceAll("_", " ").toLowerCase()}</strong><small>{run.status.toLowerCase()}</small></div></div>) : <p className="empty-note">No workflows have run yet.</p>}</aside></div>
  </div>;
}
