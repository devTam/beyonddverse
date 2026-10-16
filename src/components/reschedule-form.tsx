"use client";

import { useState } from "react";
import { Clock3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { reschedulePost } from "@/app/actions";

export function RescheduleForm({ postId }: { postId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="button button-ghost" onClick={() => setOpen(true)} aria-label="Reschedule publication"><Clock3 size={14}/></button>;
  return <ActionForm className="reschedule-form" action={async (formData) => {
    const instant = new Date(String(formData.get("localScheduledAt")));
    if (Number.isNaN(instant.getTime())) return { error: "Choose a valid publication date and time." };
    formData.set("postId", postId);
    formData.set("scheduledAt", instant.toISOString());
    await reschedulePost(formData); setOpen(false); router.refresh();
  }}><input name="localScheduledAt" type="datetime-local" required/><input type="hidden" name="postId"/><input type="hidden" name="scheduledAt"/><SubmitButton className="button button-secondary" pendingLabel="Rescheduling…">Save</SubmitButton><button type="button" className="button button-ghost" onClick={() => setOpen(false)}>Cancel</button></ActionForm>;
}
