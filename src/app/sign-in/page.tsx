import { Suspense } from "react";
import { SignInForm } from "@/components/sign-in-form";

export default function SignInPage() {
  return <main className="auth-page"><section className="auth-card">
    <p className="eyebrow">Beyond the Verse</p>
    <h1>Administrator sign in</h1>
    <p>The production studio is private. Use the configured administrator account.</p>
    <Suspense fallback={<p>Loading secure sign in…</p>}><SignInForm /></Suspense>
  </section></main>;
}
