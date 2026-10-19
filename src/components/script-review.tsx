import { ActionForm, SubmitButton } from "@/components/action-form";
import Link from "next/link";
import Image from "next/image";
import { Check, GitCompareArrows, RotateCcw, Save, ShieldCheck, X } from "lucide-react";
import { approveScript, regenerateScenePresenter, generatePresenter, selectSceneVisual, reviewPresenterVideo, generateContentThumbnail, generateNarration, generateVisuals, regenerateSceneNarration, regenerateSceneVisual, regenerateSection, rejectScript, renderLongVideo, reopenScript, saveScriptRevision, updateSceneVisualApproval } from "@/app/actions";
import { StatusPill } from "@/components/status-pill";

type Scene = {
  id: string;
  position: number;
  narration: string;
  visualPrompt: string;
  scriptureRef: string | null;
  durationMs: number;
  presentation?: string;
  scriptureCue?: string | null;
  scriptureExcerpt?: string | null;
  presenterIssue?: string | null;
  presenterVideo?: { id: string; url: string; status: string; mimeType?: string } | null;
  narrationUrl: string | null;
  visual: { id: string; url: string; status: string; mimeType?: string } | null;
};
type Script = { id: string; title: string; hook: string; body: string; status: string; revision: number; productionVersion?: number; presenterSnapshot?: unknown; scenes: Scene[] };
type Revision = { id: string; revision: number; status: string; createdAt: Date };

export function ScriptReview({ script, revisions, validation, narrationReady, visualsReady, avatarRatePerMinute = 2.31, supportingMedia = [] }: { script: Script; revisions: Revision[]; validation: unknown; narrationReady: boolean; visualsReady: boolean; avatarRatePerMinute?: number; supportingMedia?: Array<{ id: string; label: string }> }) {
  const report = validation as { valid?: boolean; citations?: Array<{ reference: string; supported: boolean; note?: string }> } | null;
  const estimate = script.scenes.filter((scene) => scene.presentation === "presenter").reduce((sum, scene) => sum + scene.durationMs, 0);
  const presenterReady = script.scenes.filter((scene) => scene.presentation === "presenter").every((scene) => scene.presenterVideo?.status === "APPROVED");
  const latest = revisions[0]?.id === script.id;
  return <section className="studio-card script-card" id="long-form">
    <span id={`script-${script.id}`} className="content-anchor"/>
    <div className="section-title"><div><span className="step-number">03</span><div><p className="eyebrow">Editorial review</p><h2>Your narrated lesson</h2></div></div><StatusPill status={script.status}/></div>
    <nav className="revision-tabs" aria-label="Script revision history"><GitCompareArrows size={15}/>{revisions.map((item) => <Link key={item.id} href={`/studio/genesis-1?script=${item.id}`} aria-current={item.id === script.id ? "page" : undefined}>v{item.revision}<small>{item.status.toLowerCase()}</small></Link>)}</nav>
    {!latest ? <p className="history-note">You are viewing an immutable historical revision. Select the newest revision to edit or approve.</p> : null}
    <div className="validation"><ShieldCheck size={20}/><div><strong>{report?.valid ? "References verified" : "Review references"}</strong><small>{report?.citations?.length ?? 0} citations checked against stored Scripture</small></div></div>
    {script.productionVersion !== 2 ? <p className="history-note">Legacy script format. Generate a new content package from your explanation to create the complete presenter-led lesson. Existing videos remain available.</p> : <p className="settings-copy">Scenes below are the complete spoken lesson. The transcript is assembled from them, so no teaching paragraphs are left out of the video.</p>}
    {latest ? <details className="lesson-transcript"><summary>Edit and save the full narration</summary>
      <p className="settings-copy">Edit the AI suggestion in your own words. Paragraphs can explain a range of verses together. Saving a changed transcript rebuilds the scenes and their visual directions, requires renewed approval, and leaves previous productions in history. Use the scene editor below to retain individual visual directions.</p>
      <ActionForm action={saveScriptRevision} className="script-editor">
        <input type="hidden" name="scriptId" value={script.id}/>
        <input type="hidden" name="title" value={script.title}/>
        <input type="hidden" name="hook" value={script.hook}/>
        <label>Full spoken narration<textarea name="transcript" defaultValue={script.body} required rows={16}/></label>
        <SubmitButton className="button button-secondary" pendingLabel="Saving narration…"><Save size={15}/> Save edited narration</SubmitButton>
      </ActionForm>
    </details> : null}
    <p className="settings-copy">You can also edit and save narration scene by scene below. A scene may explain several verses together; Scripture references accept ranges such as Genesis 1:1–5.</p>
    <ActionForm action={saveScriptRevision} className="script-editor">
      <input type="hidden" name="scriptId" value={script.id}/>
      <label>Working title<input name="title" defaultValue={script.title} required minLength={3} disabled={!latest}/></label>
      <label>Editorial hook (include spoken wording in a scene)<textarea name="hook" defaultValue={script.hook} required minLength={10} disabled={!latest}/></label>
      <details className="lesson-transcript"><summary>Full lesson transcript · derived from scenes</summary><p style={{ whiteSpace: "pre-wrap" }}>{script.body}</p></details>
      <div className="scene-editor-list">{script.scenes.map((scene) => <fieldset key={scene.id} disabled={!latest}>
        <legend>Scene {String(scene.position).padStart(2, "0")}</legend>
        <label>On-screen presentation<select name={`scene.${scene.id}.presentation`} defaultValue={scene.presentation ?? "cutaway"}><option value="presenter">AI presenter</option><option value="cutaway">Supporting visual / video cutaway</option></select></label>
        <label>Edit suggested narration<textarea name={`scene.${scene.id}.narration`} defaultValue={scene.narration} required/></label>
        {scene.narrationUrl ? <audio controls preload="metadata" src={scene.narrationUrl}>Your browser does not support audio playback.</audio> : null}
        <label>Visual direction<textarea name={`scene.${scene.id}.visualPrompt`} defaultValue={scene.visualPrompt} required/></label>
        {scene.presenterIssue ? <p role="status">Presenter generation: {scene.presenterIssue}</p> : null}
        {script.status === "APPROVED" && latest && (scene.presenterIssue || scene.presenterVideo) ? <SubmitButton className="button button-ghost" formAction={regenerateScenePresenter.bind(null, scene.id)} formNoValidate>Generate replacement presenter clip (new paid generation)</SubmitButton> : null}
        {scene.presenterVideo ? <div className="scene-presenter-review"><video controls preload="metadata" src={scene.presenterVideo.url}/><span>Presenter video: {scene.presenterVideo.status.toLowerCase()}</span>{scene.presenterVideo.status !== "APPROVED" ? <SubmitButton className="button button-secondary" type="submit" formAction={reviewPresenterVideo.bind(null, scene.presenterVideo.id)} formNoValidate>Approve presenter clip</SubmitButton> : null}</div> : null}
        {scene.visual ? <div className="scene-visual-review">{scene.visual.mimeType?.startsWith("video/") ? <video controls preload="metadata" src={scene.visual.url}/> : <Image src={scene.visual.url} alt={`Supporting visual for scene ${scene.position}`} width={960} height={540} unoptimized/>}<div className="action-row"><span>Visual status: {scene.visual.status.toLowerCase()}</span>{scene.visual.status !== "APPROVED" ? <><SubmitButton className="button button-primary" type="submit" formAction={updateSceneVisualApproval.bind(null, scene.id, "APPROVED")} formNoValidate>Approve visual</SubmitButton><SubmitButton className="button button-ghost" type="submit" formAction={updateSceneVisualApproval.bind(null, scene.id, "REJECTED")} formNoValidate>Reject</SubmitButton></> : null}</div></div> : null}
        {script.status === "APPROVED" && scene.presentation === "cutaway" && supportingMedia.length ? <div className="action-row"><label>Use approved library media<select name={`scene.${scene.id}.assetId`}>{supportingMedia.map((asset) => <option key={asset.id} value={asset.id}>{asset.label}</option>)}</select></label><SubmitButton className="button button-secondary" formAction={selectSceneVisual.bind(null, scene.id)} formNoValidate>Use selected media</SubmitButton></div> : null}
        {scene.scriptureExcerpt ? <blockquote>{scene.scriptureExcerpt}<small>{scene.scriptureRef}</small></blockquote> : null}
        <label>Scripture display cue (optional narration phrase)<input key={`${scene.id}:${scene.scriptureCue ?? "automatic"}`} name={`scene.${scene.id}.scriptureCue`} defaultValue={scene.scriptureCue ?? ""} placeholder="Defaults to the start of this scene"/><small>A matching phrase sets the display time. Empty or outdated cues show Scripture at the scene’s start.</small></label>
        <div className="scene-fields"><label>Scripture passage or verse range<input name={`scene.${scene.id}.scriptureRef`} defaultValue={scene.scriptureRef ?? ""}/></label><label>Duration (ms)<input name={`scene.${scene.id}.durationMs`} type="number" min={1000} max={300000} defaultValue={scene.durationMs} required/></label></div>
        {script.status === "APPROVED" ? <div className="action-row"><SubmitButton className="button button-ghost" type="submit" formAction={regenerateSceneNarration.bind(null, scene.id)} formNoValidate>Regenerate this narration</SubmitButton><SubmitButton className="button button-ghost" type="submit" formAction={regenerateSceneVisual.bind(null, scene.id)} formNoValidate disabled={!scene.narrationUrl}>Replace this visual</SubmitButton></div> : null}
      </fieldset>)}</div>
      {latest ? <div className="editor-save"><span>Saving creates a new immutable revision; this version is retained.</span><SubmitButton className="button button-secondary"><Save size={15}/> Save as revision {script.revision + 1}</SubmitButton></div> : null}
    </ActionForm>
    {latest ? <div className="action-row"><ActionForm action={regenerateSection}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-ghost" name="field" value="hook">Regenerate hook</SubmitButton></ActionForm><ActionForm action={regenerateSection}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-ghost" name="field" value="body">Regenerate body</SubmitButton></ActionForm></div> : null}
    {latest ? <div className="approval-controls">
      {script.status !== "APPROVED" ? <ActionForm action={approveScript}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-primary" disabled={script.productionVersion !== 2 && !report?.valid}><Check size={16}/> Approve for production</SubmitButton></ActionForm> : <ActionForm action={reopenScript}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-ghost"><RotateCcw size={15}/> Reopen script</SubmitButton></ActionForm>}
      {script.status !== "REJECTED" ? <ActionForm action={rejectScript} className="reject-form"><input type="hidden" name="scriptId" value={script.id}/><label className="sr-only" htmlFor={`rejection-${script.id}`}>Rejection reason</label><input id={`rejection-${script.id}`} name="note" required minLength={10} placeholder="Reason for rejection"/><SubmitButton className="button button-ghost"><X size={15}/> Reject</SubmitButton></ActionForm> : null}
    </div> : null}
    {latest && script.productionVersion === 2 ? <p className="production-estimate">Presenter screen time: {(estimate / 60000).toFixed(1)} min · estimated avatar cost ${(estimate / 60000 * avatarRatePerMinute).toFixed(2)} at ${avatarRatePerMinute.toFixed(2)}/min, plus speech and supporting images. Duration follows your explanation. Approve the script to authorize media production.</p> : null}
    {latest && script.status === "APPROVED" && script.productionVersion === 2 && narrationReady ? <ActionForm action={generatePresenter} className="visual-row"><input type="hidden" name="scriptId" value={script.id}/><div><strong>Generate presenter scenes</strong><small>Uses the approved presenter and existing scene audio. Retries resume saved jobs.</small></div><SubmitButton className="button button-primary">Generate / resume presenter</SubmitButton></ActionForm> : null}
    {latest && script.status === "APPROVED" ? <ActionForm action={generateNarration} className="narration-row"><div><strong>Generate scene narration</strong><small>Unchanged scene audio is reused by content, voice, speed, model, and pronunciation hash.</small></div><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-primary">Generate narration →</SubmitButton></ActionForm> : null}
    {latest && script.status === "APPROVED" ? <ActionForm action={generateContentThumbnail} className="visual-row"><div><strong>Generate YouTube thumbnail</strong><small>Uses the approved package concept and stores the result for review in Cloudinary.</small></div><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-primary">Generate thumbnail →</SubmitButton></ActionForm> : null}
    {latest && script.status === "APPROVED" && narrationReady ? <ActionForm action={generateVisuals} className="visual-row"><div><strong>{visualsReady ? "Scene visuals are approved" : "Generate or review scene visuals"}</strong><small>Generated visuals must be approved in the media library before rendering.</small></div><input type="hidden" name="scriptId" value={script.id}/>{visualsReady ? <Link className="button button-primary" href="/assets">Review assets</Link> : <SubmitButton className="button button-primary">Generate visuals →</SubmitButton>}</ActionForm> : null}
    {latest && script.status === "APPROVED" && visualsReady && presenterReady && script.productionVersion === 2 ? <ActionForm action={renderLongVideo} className="render-row"><div><strong>Render 16:9 master</strong><small>Runs on the dedicated Remotion/FFmpeg worker, never inside Vercel.</small></div><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-primary">Render video →</SubmitButton></ActionForm> : null}
  </section>;
}
