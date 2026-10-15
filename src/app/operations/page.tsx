import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { resolveOperationalAlert } from "@/app/actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const [alerts, failedWorkflows, failedRenders, backupTests] = await Promise.all([
    prisma.operationalAlert.findMany({ take: 100, include: { deliveries: { take: 1, orderBy: { createdAt: "desc" } } }, orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }] }),
    prisma.workflowRun.count({ where: { status: "FAILED" } }),
    prisma.videoRender.count({ where: { status: "FAILED" } }),
    prisma.backupTest.findMany({ take: 10, orderBy: { startedAt: "desc" } }),
  ]);
  const open = alerts.filter((alert) => !alert.resolvedAt).length;
  return <div className="page"><header className="topbar"><div><p className="eyebrow">Reliability</p><h1>Operations</h1><p>Publishing, credential, workflow, rendering, and budget failures requiring attention.</p></div></header>
    <div className="stat-grid"><article className="panel"><p className="eyebrow">Open alerts</p><h2>{open}</h2></article><article className="panel"><p className="eyebrow">Failed workflows</p><h2>{failedWorkflows}</h2></article><article className="panel"><p className="eyebrow">Failed renders</p><h2>{failedRenders}</h2></article></div>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Incident queue</p><h2>Operational alerts</h2></div><AlertTriangle size={20}/></div>
      <div className="account-list">{alerts.length ? alerts.map((alert) => <article key={alert.id}><strong>{alert.severity} · {alert.category}</strong><span>{alert.message}</span><small>{alert.createdAt.toLocaleString()} {alert.entityType ? `· ${alert.entityType} ${alert.entityId ?? ""}` : ""}</small>{alert.deliveries[0] ? <small>Latest notification: {alert.deliveries[0].status.toLowerCase()}</small> : <small>Notification not attempted</small>}{alert.resolvedAt ? <small><CheckCircle2 size={14}/> Resolved {alert.resolvedAt.toLocaleString()}</small> : <form action={resolveOperationalAlert}><input type="hidden" name="alertId" value={alert.id}/><button className="button">Mark resolved</button></form>}</article>) : <p className="settings-copy">No operational alerts have been recorded.</p>}</div>
    </section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Recovery evidence</p><h2>Backup restoration tests</h2></div></div><div className="account-list">{backupTests.length ? backupTests.map((test) => <article key={test.id}><strong>{test.status} · {test.source}</strong><span>{test.target}</span><small>{test.startedAt.toLocaleString()}{test.durationMs ? ` · ${Math.round(test.durationMs / 1000)}s` : ""}</small></article>) : <p className="settings-copy">No measured disposable restore test has been recorded yet.</p>}</div></section></div>;
}
