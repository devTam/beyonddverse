"use client";

import Link from "next/link";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="page"><section className="empty-state" role="alert"><h1>We couldn’t load this workspace</h1><p>Please try again. If the issue continues, open the overview and select your chapter.</p><div className="action-row"><button type="button" className="button button-primary" onClick={reset}>Try again</button><Link className="button button-ghost" href="/">Open overview</Link></div></section></div>;
}
