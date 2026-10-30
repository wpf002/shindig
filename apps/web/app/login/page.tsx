"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, type User } from "@/lib/api";
import { safeNext } from "@/lib/useMe";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: User }>("/auth/login", {
        method: "POST",
        json: { email: f.get("email"), password: f.get("password") },
      });
      router.push(safeNext(params.get("next"), user.role === "vendor" ? "/vendor" : "/plans"));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="wrap auth">
      <form className="card stack" onSubmit={submit}>
        <h2>Welcome Back</h2>
        {error && <p className="error">{error}</p>}
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn" disabled={busy}>
          {busy ? <span className="spinner" /> : null} Sign In
        </button>
        <p className="small muted">
          New here? <Link href="/signup">Create an Account</Link>
        </p>
      </form>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
