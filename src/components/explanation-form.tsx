import { Mic, Save } from "lucide-react";
import { generateContent, saveExplanation } from "@/app/actions";

export function ExplanationForm({ projectId, value, revision }: { projectId: string; value: string; revision?: number }) {
  return <section className="studio-card">
    <div className="section-title"><div><span className="step-number">02</span><div><p className="eyebrow">Creator source</p><h2>Your explanation</h2></div></div><span className="revision">Revision {revision ?? 0}</span></div>
    <form action={saveExplanation}>
      <input type="hidden" name="projectId" value={projectId}/>
      <label htmlFor="explanation" className="sr-only">Chapter explanation</label>
      <textarea id="explanation" name="explanation" defaultValue={value} minLength={80} required placeholder="Explain the chapter in your own words. What should your audience understand, feel, and remember?" />
      <div className="form-footer"><button type="button" className="button button-ghost" disabled title="Audio capture requires transcription credentials"><Mic size={16}/> Record audio</button><span>Your source is versioned—saving never overwrites history.</span><button className="button button-secondary"><Save size={16}/> Save revision</button></div>
    </form>
    <form action={generateContent} className="generate-row"><input type="hidden" name="projectId" value={projectId}/><div><strong>Ready to shape the teaching?</strong><small>Creates a structured script and validates its Scripture references.</small></div><button className="button button-primary" disabled={!value}>Generate content package <span>→</span></button></form>
  </section>;
}
