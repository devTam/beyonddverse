import Image from "next/image";
import { Check, ImageIcon, Mic2, Play } from "lucide-react";
import { approveScript, generateNarration, generateVisuals, renderShortVideo, updateSceneVisualApproval, regenerateSceneVisual, regenerateSceneNarration } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusPill } from "@/components/status-pill";

type ShortScript = {
  id: string;
  kind: string;
  title: string;
  hook: string;
  body: string;
  status: string;
  scenes: Array<{
    id: string; position: number; narration: string; visualPrompt: string;
    narrationUrl: string | null;
    visual: { id: string; status: string; url: string } | null;
  }>;
};

export function ShortsReview({ scripts, citationsValid }: { scripts: ShortScript[]; citationsValid: boolean }) {
  return <section className="studio-card shorts-card" id="shorts">
    <div className="section-title"><div><span className="step-number">04</span><div><p className="eyebrow">Repurposing</p><h2>Standalone shorts</h2></div></div></div>
    <p className="review-help">Review each short’s script, listen to its narration, and approve its visuals here before rendering a vertical video.</p>
    <div className="short-grid">{scripts.map((script, index) => {
      const narrationReady = script.scenes.length > 0 && script.scenes.every((scene) => scene.narrationUrl);
      const hasVisuals = script.scenes.length > 0 && script.scenes.every((scene) => scene.visual);
      const visualsReady = script.scenes.length > 0 && script.scenes.every((scene) => scene.visual?.status === "APPROVED");
      return <article key={script.id} className="short-card" id={`script-${script.id}`}>
        <div className="short-heading"><span>Short {index + 1}</span><StatusPill status={script.status}/></div>
        <h3>{script.title}</h3><blockquote>{script.hook}</blockquote><p>{script.body}</p>
        <ol className="media-checklist" aria-label="Production progress">
          <li data-ready={script.status === "APPROVED"}>1. Script {script.status === "APPROVED" ? "approved" : "needs approval"}</li>
          <li data-ready={narrationReady}>2. Narration {narrationReady ? "ready to play" : "needed"}</li>
          <li data-ready={visualsReady}>3. Visuals {visualsReady ? "approved" : hasVisuals ? "need review below" : "needed"}</li>
        </ol>
        <div className="short-scenes">{script.scenes.map((scene) => <section className="short-scene" key={scene.id}>
          <h4>Scene {scene.position}</h4>
          <p>{scene.narration}</p>
          {scene.narrationUrl ? <><label htmlFor={`audio-${scene.id}`}>Scene narration</label><audio id={`audio-${scene.id}`} controls preload="metadata" src={scene.narrationUrl}/></> : <p className="review-help">Narration has not been generated yet.</p>}
          {scene.visual ? <div className="scene-visual-review">
            <a href={scene.visual.url} target="_blank" rel="noreferrer" aria-label={`Open short ${index + 1}, scene ${scene.position} visual`}><Image src={scene.visual.url} alt={`Short ${index + 1}, scene ${scene.position} visual`} width={540} height={960} unoptimized/></a>
            <StatusPill status={scene.visual.status}/>
            {script.status === "APPROVED" ? <ActionForm action={updateSceneVisualApproval.bind(null, scene.id, "APPROVED")} className="action-row">
              {scene.visual.status !== "APPROVED" ? <SubmitButton className="button button-primary" pendingLabel="Approving…">Approve visual</SubmitButton> : null}
              {scene.visual.status !== "REJECTED" ? <SubmitButton className="button button-ghost" formAction={updateSceneVisualApproval.bind(null, scene.id, "REJECTED")} pendingLabel="Rejecting…">Reject visual</SubmitButton> : null}
            </ActionForm> : null}
          </div> : <p className="review-help">The generated visual will appear here for approval.</p>}
          {script.status === "APPROVED" && scene.narrationUrl ? <div className="action-row"><ActionForm action={regenerateSceneNarration.bind(null, scene.id)}><SubmitButton className="button button-ghost" pendingLabel="Starting narration…">Regenerate narration</SubmitButton></ActionForm>{scene.visual ? <ActionForm action={regenerateSceneVisual.bind(null, scene.id)}><SubmitButton className="button button-ghost" pendingLabel="Starting replacement…">Replace visual</SubmitButton></ActionForm> : null}</div> : null}
        </section>)}</div>
        <div className="short-actions">
          {script.status !== "APPROVED" ? <ActionForm action={approveScript}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-primary" disabled={!citationsValid} pendingLabel="Approving…"><Check size={14}/> Approve script</SubmitButton></ActionForm> : null}
          {script.status === "APPROVED" && !narrationReady ? <ActionForm action={generateNarration}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-ghost" pendingLabel="Starting narration…"><Mic2 size={14}/> Generate narration</SubmitButton></ActionForm> : null}
          {script.status === "APPROVED" && narrationReady && !hasVisuals ? <ActionForm action={generateVisuals}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-ghost" pendingLabel="Starting visuals…"><ImageIcon size={14}/> Create visuals</SubmitButton></ActionForm> : null}
          {script.status === "APPROVED" && narrationReady && visualsReady ? <ActionForm action={renderShortVideo}><input type="hidden" name="scriptId" value={script.id}/><SubmitButton className="button button-secondary" pendingLabel="Starting render…"><Play size={14}/> Render 9:16 video</SubmitButton></ActionForm> : null}
        </div>
      </article>;
    })}</div>
  </section>;
}
