import { Check, ShieldCheck } from "lucide-react";
import { approveScript } from "@/app/actions";
import { StatusPill } from "@/components/status-pill";

type Scene = { id: string; position: number; narration: string; scriptureRef: string | null; durationMs: number };
type Script = { id: string; title: string; hook: string; body: string; status: string; scenes: Scene[] };

export function ScriptReview({ script, validation }: { script: Script; validation: unknown }) {
  const report = validation as { valid?: boolean; citations?: Array<{ reference: string; supported: boolean }> } | null;
  return <section className="studio-card script-card">
    <div className="section-title"><div><span className="step-number">03</span><div><p className="eyebrow">Editorial review</p><h2>Long-form script</h2></div></div><StatusPill status={script.status}/></div>
    <div className="script-header"><div><p className="eyebrow">Working title</p><h3>{script.title}</h3><p className="hook">{script.hook}</p></div><div className="validation"><ShieldCheck size={20}/><div><strong>{report?.valid ? "References verified" : "Review references"}</strong><small>{report?.citations?.length ?? 0} citations checked against stored Scripture</small></div></div></div>
    <div className="scene-list">{script.scenes.map((scene) => <article className="scene" key={scene.id}><span>{String(scene.position).padStart(2, "0")}</span><div><p>{scene.narration}</p><small>{scene.scriptureRef ?? "No direct citation"} · {Math.round(scene.durationMs / 1000)} sec</small></div></article>)}</div>
    {script.status !== "APPROVED" ? <form action={approveScript} className="approval-row"><p>Approval is required before narration and visual generation can spend provider credits.</p><input type="hidden" name="scriptId" value={script.id}/><button className="button button-primary"><Check size={16}/> Approve for production</button></form> : <div className="approved-banner"><Check size={18}/> Approved. Media production is unlocked.</div>}
  </section>;
}
