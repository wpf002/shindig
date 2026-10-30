"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User } from "@/lib/api";

export function Nav() {
  const [user, setUser] = useState<User | null>(null);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    api<{ user: User | null }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, [path]);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    router.push("/");
  }

  return (
    <header className="nav">
      <div className="wrap">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden />
          Shindig
        </Link>
        <nav className="nav-links">
          {user?.role === "planner" && <Link href="/plans">My Plans</Link>}
          {user?.role === "vendor" && <Link href="/vendor">Vendor Portal</Link>}
          {user ? (
            <button className="linkish" onClick={logout}>
              Sign Out
            </button>
          ) : (
            <>
              <Link href="/login">Sign In</Link>
              <Link href="/signup" className="btn sm">
                Start a Plan
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
