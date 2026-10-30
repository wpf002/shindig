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

  const current = (href: string) => (path === href || path.startsWith(href + "/") ? "page" : undefined);

  return (
    <header className="nav">
      <div className="wrap">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          Shindig
        </Link>
        <nav className="nav-links">
          {user?.role === "planner" && (
            <Link href="/plans" aria-current={current("/plans")}>
              Plans
            </Link>
          )}
          {user?.role === "vendor" && (
            <Link href="/vendor" aria-current={current("/vendor")}>
              Portal
            </Link>
          )}
          {user ? (
            <button className="linkish" onClick={logout}>
              Sign Out
            </button>
          ) : (
            <>
              <Link href="/signup?role=vendor" aria-current={undefined}>
                For Vendors
              </Link>
              <Link href="/login" aria-current={current("/login")}>
                Sign In
              </Link>
              <Link href="/signup" className="btn sm accent">
                Start a Plan
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
