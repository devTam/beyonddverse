import { Suspense } from "react";
import { SignInForm } from "@/components/sign-in-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const allowBootstrap = await prisma.user.count() === 0;
  return <main className="auth-page"><section className="auth-card">
    <p className="eyebrow">Beyond the Verse</p>
    <h1>Administrator sign in</h1>
    <p>{allowBootstrap ? "Create the first administrator using the configured owner email." : "The production studio is private. Use the configured administrator account."}</p>
    <Suspense fallback={<p>Loading secure sign in…</p>}><SignInForm allowBootstrap={allowBootstrap}/></Suspense>
  </section></main>;
}
