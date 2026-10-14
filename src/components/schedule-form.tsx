"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { schedulePost } from "@/app/actions";

type Option = { id: string; label: string };

export function ScheduleForm({ variants, accounts }: { variants: Option[]; accounts: Option[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(formData: FormData) {
    setError(null);
    const local = String(formData.get("localScheduledAt"));
    const instant = new Date(local);
    if (!local || Number.isNaN(instant.getTime())) { setError("Choose a valid publication date and time."); return; }
    formData.set("scheduledAt", instant.toISOString());
    startTransition(async () => {
      try { await schedulePost(formData); router.refresh(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to schedule publication."); }
    });
  }
  return <form action={submit} className="schedule-form"><label>Approved media<select name="variantId" required defaultValue=""><option value="" disabled>Select media</option>{variants.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Account<select name="socialAccountId" required defaultValue=""><option value="" disabled>Select account</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Local date and time<input name="localScheduledAt" type="datetime-local" required/></label><input type="hidden" name="scheduledAt"/>{error ? <p role="alert" className="form-error">{error}</p> : null}<button className="button button-primary" disabled={pending || !variants.length || !accounts.length}>{pending ? "Scheduling…" : "Schedule publication"}</button></form>;
}
