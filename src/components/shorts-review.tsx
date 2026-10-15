import { Check, ImageIcon, Mic2, Play } from "lucide-react";
import { approveScript, generateNarration, generateVisuals, renderShortVideo } from "@/app/actions";
import { StatusPill } from "@/components/status-pill";

type ShortScript = {
  id: string;
  kind: string;
  title: string;
  hook: string;
  body: string;
  status: string;
  scenes: Array<{ narrations: unknown[]; assetUsages: Array<{ role: string; asset: { status: string } }> }>;
};

export function ShortsReview({ scripts, citationsValid }: { scripts: ShortScript[]; citationsValid: boolean }) {
  return <section className="studio-card shorts-card">
    <div className="section-title"><div><span className="step-number">04</span><div><p className="eyebrow">Repurposing</p><h2>Three standalone shorts</h2></div></div></div>
    <div className="short-grid">{scripts.map((script, index) => {
      const narrationReady = script.scenes.length > 0 && script.scenes.every((scene) => scene.narrations.length > 0);
      const visualsReady = script.scenes.length > 0 && script.scenes.every((scene) => scene.assetUsages.some((usage) => usage.role === "PRIMARY_VISUAL" && usage.asset.status === "APPROVED"));
      return <article key={script.id} className="short-card">
        <div className="short-heading"><span>Short {index + 1}</span><StatusPill status={script.status}/></div>
        <h3>{script.title}</h3><blockquote>{script.hook}</blockquote><p>{script.body}</p>
        <div className="short-actions">
          {script.status !== "APPROVED" ? <form action={approveScript}><input type="hidden" name="scriptId" value={script.id}/><button className="button button-primary" disabled={!citationsValid}><Check size={14}/> Approve</button></form> : null}
          {script.status === "APPROVED" ? <form action={generateNarration}><input type="hidden" name="scriptId" value={script.id}/><button className="button button-ghost"><Mic2 size={14}/>{narrationReady ? "Narration ready" : "Narrate"}</button></form> : null}
          {script.status === "APPROVED" && narrationReady ? <form action={generateVisuals}><input type="hidden" name="scriptId" value={script.id}/><button className="button button-ghost"><ImageIcon size={14}/>{visualsReady ? "Visual ready" : "Create visual"}</button></form> : null}
          {script.status === "APPROVED" && visualsReady ? <form action={renderShortVideo}><input type="hidden" name="scriptId" value={script.id}/><button className="button button-secondary"><Play size={14}/> Render 9:16</button></form> : null}
        </div>
      </article>;
    })}</div>
  </section>;
}
