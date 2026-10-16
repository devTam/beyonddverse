import { ActionForm, SubmitButton } from "@/components/action-form";
import Link from "next/link";
import Image from "next/image";
import { Check, GitCompareArrows, RotateCcw, Save, ShieldCheck, X } from "lucide-react";
import { approveScript, generateContentThumbnail, generateNarration, generateVisuals, regenerateSceneNarration, regenerateSceneVisual, regenerateSection, rejectScript, renderLongVideo, reopenScript, saveScriptRevision, updateSceneVisualApproval } from "@/app/actions";
import { StatusPill } from "@/components/status-pill";

type Scene = {
  id: string;
  position: number;
  narration: string;
  visualPrompt: string;
  scriptureRef: string | null;
  durationMs: number;
  narrationUrl: string | null;
  visual: { id: string; url: string; status: string } | null;
};
type Script = { id: string; title: string; hook: string; body: string; status: string; revision: number; scenes: Scene[] };
type Revision = { id: string; revision: number; status: string; createdAt: Date };

export function ScriptReview({ script, revisions, validation, narrationReady, visualsReady }: { script: Script; revisions: Revision[]; validation: unknown; narrationReady: boolean; visualsReady: boolean }) {
  const report = validation as { valid?: boolean; citations?: Array<{ reference: string; supported: boolean; note?: string }> } | null;
  const latest = revisions[0]?.id === script.id;
  return <section className="studio-card script-card" id="long-form">
    <span id={`script-${script.id}`} className="content-anchor"/>
    <div className="section-title"><div><span className="step-number">03</span><div><p className="eyebrow">Editorial review</p><h2>Long-form script</h2></div></div><StatusPill status={script.status}/></div>
    <nav className="revision-tabs" aria-label="Script revision history"><GitCompareArrows size={15}/>{revisions.map((item) => <Link key={item.id} href={`/studio/genesis-1?script=${item.id}`} aria-current={item.id === script.id ? "page" : undefined}>v{item.revision}<small>{item.status.toLowerCase()}</small></Link>)}</nav>
    {!latest ? <p className="history-note">You are viewing an immutable historical revision. Select the newest revision to edit or approve.</p> : null}
    <div className="validation"><ShieldCheck size={20}/><div><strong>{report?.valid ? "References verified" : "Review references"}</strong><small>{report?.citations?.length ?? 0} citations checked against stored Scripture</small></div></div>
    <ActionForm action={saveScriptRevision} className="script-editor">
      <input type="hidden" name="scriptId" value={script.id}/>
      <label>Working title<input name="title" defaultValue={script.title} required minLength={3} disabled={!latest}/></label>
      <label>Hook<textarea name="hook" defaultValue={script.hook} required minLength={10} disabled={!latest}/></label>
      <label>Full teaching script<textarea name="body" defaultValue={script.body} required minLength={200} disabled={!latest}/></label>
      <div className="scene-editor-list">{script.scenes.map((scene) => <fieldset key={scene.id} disabled={!latest}>
        <legend>Scene {String(scene.position).padStart(2, "0")}</legend>
        <label>Narration<textarea name={`scene.${scene.id}.narration`} defaultValue={scene.narration} required/></label>
        {scene.narrationUrl ? <audio controls preload="metadata" src={scene.narrationUrl}>Your browser does not support audio playback.</audio> : null}
        <label>Visual direction<textarea name={`scene.${scene.id}.visualPrompt`} defaultValue={scene.visualPrompt} required/></label>
        {scene.visual ? <div className="scene-visual-review"><Image src={scene.visual.url} alt={`Generated visual for scene ${scene.position}`} width={960} height={540} unoptimized/><div className="action-row"><span>Visual status: {scene.visual.status.toLowerCase()}</span>{scene.visual.status !== "APPROVED" ? <><SubmitButton className="button button-primary" type="submit" formAction={updateSceneVisualApproval.bind(null, scene.id, "APPROVED")} formNoValidate>Approve visual</SubmitButton><SubmitButton className="button button-ghost" type="submit" formAction={updateSceneVisualApproval.bind(null, scene.id, "REJECTED")} formNoValidate>Reject</SubmitButton></> : null}</div></div> : null}
        <div className="scene-fields"><label>Scripture reference<input name={`scene.${scene.id}.scriptureRef`} defaultValue={scene.scriptureRef ?? ""}/></label><label>Duration (ms)<input name={`scene.${scene.id}.durationMs`} type="number" min={1000} max={300000} defaultValue={scene.durationMs} required/></label></div>
        {script.status === "APPROVED" ? <div className="action-row"><SubmitButton className="button button-ghost" type="submit" formAction={regenerateSceneNarration.bind(null, scene.id)} formNoValidate>Regenerate this narration</SubmitButton><SubmitButton className="button button-ghost" type="submit" formAction={regenerateSceneVisual.bind(null, scene.id)} formNoValidate disabled={!scene.narrationUrl}>Replace this visual</SubmitButton></div> : null}
      </fieldset>)}</div>
      {latest ? <div className="editor-save"><span>Saving creates a new immutable revision; this version is retained.</span><SubmitButton className="button button-secondary"><Save size={15}/> Save as revision {script.revision + 1}</SubmitButton></div> : null}
    </ActionForm>
    {latest ? <div className="action-row"><ActionForm action={regenerateSection}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-ghost" name="field" value="hook">Regenerate hook</SubmitButton></ActionForm><ActionForm action={regenerateSection}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-ghost" name="field" value="body">Regenerate body</SubmitButton></ActionForm></div> : null}
    {latest ? <div className="approval-controls">
      {script.status !== "APPROVED" ? <ActionForm action={approveScript}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-primary" disabled={!report?.valid}><Check size={16}/> Approve for production</SubmitButton></ActionForm> : <ActionForm action={reopenScript}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-ghost"><RotateCcw size={15}/> Reopen script</SubmitButton></ActionForm>}
      {script.status !== "REJECTED" ? <ActionForm action={rejectScript} className="reject-form"><input type="hidden" name="scriptId" value={script.id}/><label className="sr-only" htmlFor={`rejection-${script.id}`}>Rejection reason</label><input id={`rejection-${script.id}`} name="note" required minLength={10} placeholder="Reason for rejection"/><SubmitButton className="button button-ghost"><X size={15}/> Reject</SubmitButton></ActionForm> : null}
    </div> : null}
    {latest && script.status === "APPROVED" ? <ActionForm action={generateNarration} className="narration-row"><div><strong>Generate scene narration</strong><small>Unchanged scene audio is reused by content, voice, speed, model, and pronunciation hash.</small></div><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-primary">Generate narration →</SubmitButton></ActionForm> : null}
    {latest && script.status === "APPROVED" ? <ActionForm action={generateContentThumbnail} className="visual-row"><div><strong>Generate YouTube thumbnail</strong><small>Uses the approved package concept and stores the result for review in Cloudinary.</small></div><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-primary">Generate thumbnail →</SubmitButton></ActionForm> : null}
    {latest && script.status === "APPROVED" && narrationReady ? <ActionForm action={generateVisuals} className="visual-row"><div><strong>{visualsReady ? "Scene visuals are approved" : "Generate or review scene visuals"}</strong><small>Generated visuals must be approved in the media library before rendering.</small></div><input type="hidden" name="scriptId" value={script.id}/>{visualsReady ? <Link className="button button-primary" href="/assets">Review assets</Link> : <SubmitButton className="button button-primary">Generate visuals →</SubmitButton>}</ActionForm> : null}
    {latest && script.status === "APPROVED" && visualsReady ? <ActionForm action={renderLongVideo} className="render-row"><div><strong>Render 16:9 master</strong><small>Runs on the dedicated Remotion/FFmpeg worker, never inside Vercel.</small></div><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-primary">Render video →</SubmitButton></ActionForm> : null}
  </section>;
}
