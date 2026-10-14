import { cn } from "@/lib/utils";

export function StatusPill({ status }: { status: string }) {
  const tone = status.includes("APPROVED") || status.includes("SUCCEEDED") || status.includes("PUBLISHED")
    ? "success"
    : status.includes("FAILED") ? "danger" : status.includes("PENDING") || status.includes("REVIEW") ? "warning" : "neutral";
  return <span className={cn("status", `status-${tone}`)}><i />{status.replaceAll("_", " ").toLowerCase()}</span>;
}
