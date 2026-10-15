"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";
import { generateContent, saveExplanation } from "@/app/actions";
import { AudioExplanation } from "@/components/audio-explanation";

export function ExplanationForm({ projectId, value, revision }: { projectId: string; value: string; revision?: number }) {
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generating, startGeneration] = useTransition();

  function generate(formData: FormData) {
    setGenerationError(null);
    startGeneration(async () => {
      try {
        const result = await generateContent(formData);
        if (result?.error) setGenerationError(result.error);
      } catch (error) {
        setGenerationError(error instanceof Error ? error.message : "Unable to start content generation.");
      }
    });
  }

  return <section className="studio-card">
    <div className="section-title"><div><span className="step-number">02</span><div><p className="eyebrow">Creator source</p><h2>Your explanation</h2></div></div><span className="revision">Revision {revision ?? 0}</span></div>
    <AudioExplanation projectId={projectId}/>
    <form action={saveExplanation}>
      <input type="hidden" name="projectId" value={projectId}/>
      <label htmlFor="explanation" className="sr-only">Chapter explanation</label>
      <textarea id="explanation" name="explanation" defaultValue={value} minLength={80} required placeholder="Explain the chapter in your own words. What should your audience understand, feel, and remember?" />
      <div className="form-footer"><span>Your source is versioned—saving never overwrites history.</span><button className="button button-secondary"><Save size={16}/> Save revision</button></div>
    </form>
    <form action={generate} className="generate-row"><input type="hidden" name="projectId" value={projectId}/><div><strong>Ready to shape the teaching?</strong><small>Creates a structured script and validates its Scripture references.</small>{generationError ? <p role="alert" className="form-error">{generationError}</p> : null}</div><button className="button button-primary" disabled={!value || generating}>{generating ? "Starting…" : "Generate content package"} <span>→</span></button></form>
  </section>;
}
