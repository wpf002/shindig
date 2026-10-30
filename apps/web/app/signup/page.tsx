"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, type User } from "@/lib/api";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<"planner" | "vendor">(params.get("role") === "vendor" ? "vendor" : "planner");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: User }>("/auth/signup", {
        method: "POST",
        json: { name: f.get("name"), email: f.get("email"), password: f.get("password"), role },
      });
      router.push(user.role === "vendor" ? "/vendor" : "/plans/new");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="wrap auth">
      <form className="card stack" onSubmit={submit}>
        <h2>{role === "vendor" ? "List Your Business" : "Start Planning"}</h2>
        <div className="chips" role="group" aria-label="Account type">
          <button type="button" className="chip" aria-pressed={role === "planner"} onClick={() => setRole("planner")}>
            I&apos;m Planning an Event
          </button>
          <button type="button" className="chip" aria-pressed={role === "vendor"} onClick={() => setRole("vendor")}>
            I&apos;m a Vendor
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <label className="field">
          <span>{role === "vendor" ? "Your Name" : "Name"}</span>
          <input name="name" autoComplete="name" required maxLength={80} />
        </label>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        <button className="btn thread" disabled={busy}>
          {busy ? <span className="spinner" /> : null} Create Account
        </button>
        <p className="small muted">
          Have an account? <Link href="/login">Sign In</Link>
        </p>
      </form>
    </main>
  );
}

export default function Signup() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
