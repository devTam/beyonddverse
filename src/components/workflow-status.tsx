"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

type Workflow = {
  status: string;
  error: string | null;
  steps: Array<{ name: string; position: number; status: string; attempts: number; error: string | null }>;
};

const terminalStatuses = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

export function WorkflowStatus({ workflowId, projectId }: { workflowId: string; projectId: string }) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const response = await fetch(`/api/workflows/${workflowId}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Status request failed (${response.status})`);
        const next = (await response.json()) as Workflow;
        if (!active) return;
        setWorkflow(next);
        setRequestError(null);
        if (!terminalStatuses.has(next.status)) timer = setTimeout(refresh, 2_000);
        else if (next.status === "SUCCEEDED") window.location.replace(`/studio/genesis-1?project=${projectId}`);
      } catch (error) {
        if (!active) return;
        setRequestError(error instanceof Error ? error.message : "Unable to retrieve workflow status.");
        timer = setTimeout(refresh, 5_000);
      }
    }
    void refresh();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [workflowId, projectId]);

  return <section className="workflow-banner" aria-live="polite">
    <div className="workflow-title">
      {workflow?.status === "FAILED" ? <CircleAlert size={18}/> : workflow?.status === "SUCCEEDED" ? <CircleCheck size={18}/> : <LoaderCircle className="spin" size={18}/>}
      <div><strong>{workflow?.status === "FAILED" ? "Generation failed" : workflow?.status === "SUCCEEDED" ? "Content package ready" : "Content pipeline running"}</strong><small>{requestError ?? workflow?.error ?? "This job continues safely if you close the page."}</small></div>
    </div>
    {workflow ? <ol>{workflow.steps.map((step) => <li key={step.position} data-status={step.status}><i/>{step.name}<span>{step.status.toLowerCase()}</span></li>)}</ol> : null}
  </section>;
}
