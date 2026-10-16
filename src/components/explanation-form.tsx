"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";

import { Save } from "lucide-react";
import { generateContent, saveExplanation } from "@/app/actions";
import { AudioExplanation } from "@/components/audio-explanation";

export function ExplanationForm({ projectId, value, revision }: { projectId: string; value: string; revision?: number }) {
  return <section className="studio-card">
    <div className="section-title"><div><span className="step-number">02</span><div><p className="eyebrow">Creator source</p><h2>Your explanation</h2></div></div><span className="revision">Revision {revision ?? 0}</span></div>
    <AudioExplanation projectId={projectId}/>
    <ActionForm action={saveExplanation}>
      <input type="hidden" name="projectId" value={projectId}/>
      <label htmlFor="explanation" className="sr-only">Chapter explanation</label>
      <textarea id="explanation" name="explanation" defaultValue={value} minLength={80} required placeholder="Explain the chapter in your own words. What should your audience understand, feel, and remember?" />
      <div className="form-footer"><span>Your source is versioned—saving never overwrites history.</span><SubmitButton className="button button-secondary"><Save size={16}/> Save revision</SubmitButton></div>
    </ActionForm>
    <ActionForm action={generateContent} className="generate-row"><input type="hidden" name="projectId" value={projectId}/><div><strong>Ready to shape the teaching?</strong><small>Creates a structured script and validates its Scripture references.</small></div><SubmitButton className="button button-primary" disabled={!value} pendingLabel="Starting generation…">Generate content package <span>→</span></SubmitButton></ActionForm>
  </section>;
}
