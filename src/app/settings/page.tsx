import { Settings2 } from "lucide-react";
import { createManualSocialAccount } from "@/app/actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const accounts = await prisma.socialAccount.findMany({ orderBy: [{ platform: "asc" }, { displayName: "asc" }] });
  return <div className="page"><header className="topbar"><div><p className="eyebrow">Workspace</p><h1>Settings</h1><p>Provider credentials remain server-side. Manual accounts create official-export fallbacks without storing credentials.</p></div></header>
    <div className="settings-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Distribution</p><h2>Publishing accounts</h2></div><Settings2 size={20}/></div>
      <form action={createManualSocialAccount} className="settings-form"><label>Platform<select name="platform" required><option>YOUTUBE</option><option>TIKTOK</option><option>INSTAGRAM</option><option>FACEBOOK</option><option>X</option></select></label><label>Display name<input name="displayName" required placeholder="Beyond the Verse"/></label><label>IANA time zone<input name="timezone" required defaultValue="Africa/Lagos" placeholder="Africa/Lagos"/></label><button className="button button-primary">Add manual account</button></form>
      <div className="account-list">{accounts.map((account) => <article key={account.id}><strong>{account.displayName}</strong><span>{account.platform} · {account.timezone}</span><small>{account.encryptedToken ? "Official connection" : "Manual publishing fallback"}</small></article>)}</div>
    </section><section className="panel"><p className="eyebrow">Providers</p><h2>Environment-managed configuration</h2><p className="settings-copy">AI Gateway, Trigger.dev, Cloudinary, authentication, and render-worker credentials are configured as encrypted deployment environment variables. They are never returned to this interface.</p></section></div>
  </div>;
}
