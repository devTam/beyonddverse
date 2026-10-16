"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

type Workflow = {
  type: string;
  input: { scriptId?: string } | null;
  status: string;
  error: string | null;
  steps: Array<{ name: string; position: number; status: string; attempts: number; error: string | null }>;
};

const terminalStatuses = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

export function WorkflowStatus({ workflowId, projectId }: { workflowId: string; projectId: string }) {
  const router = useRouter();
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
        else if (next.status === "SUCCEEDED") router.refresh();
      } catch (error) {
        if (!active) return;
        setRequestError(error instanceof Error ? error.message : "Unable to retrieve workflow status.");
        timer = setTimeout(refresh, 5_000);
      }
    }
    void refresh();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [workflowId, router]);

  const canceled = workflow?.status === "CANCELED";
  const finished = workflow ? terminalStatuses.has(workflow.status) : false;
  const target = workflow?.input?.scriptId;
  const resultHref = `/studio/genesis-1?project=${projectId}${target ? `&script=${target}` : ""}${workflow?.type.includes("RENDER") ? "#video-output" : target ? `#script-${target}` : "#long-form"}`;

  return <section className="workflow-banner" aria-live="polite">
    <div className="workflow-title">
      {workflow?.status === "FAILED" || canceled ? <CircleAlert size={18}/> : workflow?.status === "SUCCEEDED" ? <CircleCheck size={18}/> : <LoaderCircle className="spin" size={18}/>}
      <div><strong>{workflow?.status === "FAILED" ? "Production failed" : canceled ? "Production canceled" : workflow?.status === "SUCCEEDED" ? "Production complete" : "Production in progress"}</strong><small>{requestError ?? workflow?.error ?? (finished ? "Review the result below or start the next production step." : "This job continues safely if you close the page.")}</small></div>
    </div>
    {workflow?.status === "SUCCEEDED" ? <Link href={resultHref} className="workflow-result">View generated content →</Link> : null}
    {workflow ? <ol>{workflow.steps.map((step) => <li key={step.position} data-status={step.status}><i/>{step.name}<span>{step.status.toLowerCase()}</span></li>)}</ol> : null}
  </section>;
}
