"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { unstable_rethrow } from "next/navigation";
import { LoaderCircle } from "lucide-react";

type Action = (formData: FormData) => void | Promise<unknown>;
type Feedback = { error?: string; success?: string } | null;

async function perform(action: Action, data: FormData): Promise<Feedback> {
  try {
    const result = await action(data);
    if (result && typeof result === "object" && "error" in result) return { error: String(result.error) };
    return { success: "Changes saved." };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Unable to complete this action. Please try again." };
  }
}

export function ActionForm({ action, children, ...props }: Omit<ComponentProps<"form">, "action"> & { action: Action }) {
  const [feedback, submit, pending] = useActionState(async (_previous: Feedback, data: FormData) => perform(action, data), null);
  return <form {...props} action={submit} aria-busy={pending}>
    {children}
    {!pending && feedback ? <p className={feedback.error ? "form-error action-feedback" : "form-success action-feedback"} role={feedback.error ? "alert" : "status"}>{feedback.error ?? feedback.success}</p> : null}
  </form>;
}

export function SubmitButton({ children, pendingLabel = "Working…", formAction, disabled, ...props }: Omit<ComponentProps<"button">, "formAction"> & { pendingLabel?: string; formAction?: Action; children?: ReactNode }) {
  const form = useFormStatus();
  const [feedback, submit, actionPending] = useActionState(async (_previous: Feedback, data: FormData) => formAction ? perform(formAction, data) : null, null);
  const pending = form.pending || actionPending;
  // Only the clicked button changes its label; every submit in its form is locked.
  const clicked = actionPending || (form.pending && (formAction ? form.action === submit : !props.name || form.data?.get(props.name) === props.value));
  return <>
    <button {...props} type={props.type ?? "submit"} formAction={formAction ? submit : undefined} disabled={disabled || pending} aria-busy={clicked}>
      {clicked ? <><LoaderCircle size={15} className="spin" aria-hidden="true"/>{pendingLabel}</> : children}
    </button>
    {!pending && feedback ? <span className={feedback.error ? "form-error action-feedback" : "form-success action-feedback"} role={feedback.error ? "alert" : "status"}>{feedback.error ?? feedback.success}</span> : null}
  </>;
}
