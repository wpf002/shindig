"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type User } from "./api";

/** Current user. With `require`, bounces signed-out visitors to /login. */
export function useMe(require?: "planner" | "vendor" | "any") {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const router = useRouter();

  useEffect(() => {
    let live = true;
    api<{ user: User | null }>("/auth/me")
      .then(({ user }) => {
        if (!live) return;
        setUser(user);
        if (require && !user) router.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        else if (user && require === "vendor" && user.role !== "vendor") router.replace("/plans");
        else if (user && require === "planner" && user.role !== "planner") router.replace("/vendor");
      })
      .catch(() => live && setUser(null));
    return () => {
      live = false;
    };
  }, [require, router]);

  return user;
}

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
