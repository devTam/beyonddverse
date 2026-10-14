"use client";

import { useState, useTransition } from "react";
import { Clock3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { reschedulePost } from "@/app/actions";

export function RescheduleForm({ postId }: { postId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!open) return <button type="button" className="button button-ghost" onClick={() => setOpen(true)} aria-label="Reschedule publication"><Clock3 size={14}/></button>;
  return <form className="reschedule-form" action={(formData) => {
    const instant = new Date(String(formData.get("localScheduledAt")));
    if (Number.isNaN(instant.getTime())) return;
    formData.set("postId", postId);
    formData.set("scheduledAt", instant.toISOString());
    startTransition(async () => { await reschedulePost(formData); setOpen(false); router.refresh(); });
  }}><input name="localScheduledAt" type="datetime-local" required/><input type="hidden" name="postId"/><input type="hidden" name="scheduledAt"/><button className="button button-secondary" disabled={pending}>{pending ? "…" : "Save"}</button></form>;
}
