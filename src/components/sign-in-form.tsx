"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.email({ email: String(formData.get("email")), password: String(formData.get("password")) });
    if (result.error) {
      setError("The email or password is incorrect.");
      setBusy(false);
      return;
    }
    const callbackUrl = searchParams.get("callbackUrl");
    router.replace(callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/");
    router.refresh();
  }

  return <form action={submit} className="sign-in-form">
    <label>Email<input name="email" type="email" autoComplete="username" required /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" minLength={12} required /></label>
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    <button className="button button-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
  </form>;
}
