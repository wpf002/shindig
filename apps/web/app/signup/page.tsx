"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, type User } from "@/lib/api";
import { AuthArt } from "@/components/AuthArt";

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
    <main className="auth">
      <AuthArt>
        <p className="eyebrow">{role === "vendor" ? "For Vendors" : "For Planners"}</p>
        <h2 style={{ marginTop: 12 }}>
          {role === "vendor" ? (
            <>
              Get found for <em>your style.</em>
            </>
          ) : (
            <>
              Your board, <em>booked.</em>
            </>
          )}
        </h2>
      </AuthArt>
      <div className="auth-form">
      <form className="stack" style={{ ["--gap" as string]: "20px" }} onSubmit={submit}>
        <h1>{role === "vendor" ? "List Your Business" : "Start a Plan"}</h1>
        <div className="seg two" role="group" aria-label="Account type">
          <button type="button" aria-pressed={role === "planner"} onClick={() => setRole("planner")}>
            Planning an Event
          </button>
          <button type="button" aria-pressed={role === "vendor"} onClick={() => setRole("vendor")}>
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
          <input name="password" type="password" autoComplete="new-password" minLength={10} required placeholder="10+ characters" />
        </label>
        <button className="btn accent lg block" disabled={busy}>
          {busy ? <span className="spinner" /> : null} Create Account
        </button>
        <p className="small muted">
          Have an account?{" "}
          <Link href="/login" className="linkish">
            Sign In
          </Link>
        </p>
      </form>
      </div>
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
