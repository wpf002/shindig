"use client";

import type { Brief, Category, Conflict, Match, Style } from "@shindig/core";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? "Something went wrong", res.status);
  return data as T;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: "planner" | "vendor";
}

export interface Plan {
  id: string;
  name: string;
  eventType: string;
  date: string | null;
  cityId: string;
  guestCount: number;
  budget: number;
  categories: Category[];
  brief: Brief | null;
  briefSource: "pinterest" | "upload" | null;
  briefLabel: string | null;
  shareToken: string | null;
  updatedAt: string;
}

export interface PublicVendor {
  id: string;
  slug: string;
  name: string;
  category: Category;
  cityId: string;
  serviceRadiusMi: number;
  priceMin: number;
  priceMax: number;
  priceUnit: "flat" | "per_guest";
  capacityMax: number | null;
  styles: Style[];
  palette: string[];
  formalityMin: number;
  formalityMax: number;
  settings: Array<"indoor" | "outdoor">;
  venueType: string | null;
  description: string;
  website: string | null;
  isDemo: boolean;
  verified: boolean;
  images: Array<{ id: string; url: string; width: number; height: number; credit: string | null }>;
  /** Imported from Google and not claimed yet. Contact goes through their website or phone. */
  listed: boolean;
  priceEstimated: boolean;
  address: string | null;
  phone: string | null;
  rating: number | null;
  ratingCount: number | null;
}

export interface MatchRow extends Match {
  vendor: PublicVendor;
  saved: boolean;
  inquiry: "sent" | "replied" | "declined" | null;
}

export interface MatchesResponse {
  brief: Brief;
  conflicts: Conflict[];
  categories: Array<{ category: Category; allotted: number; matches: MatchRow[] }>;
}

export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export interface SharedPlan {
  plan: Pick<Plan, "name" | "eventType" | "date" | "cityId" | "guestCount">;
  brief: Brief;
  categories: Array<{
    category: Category;
    matches: Array<Pick<MatchRow, "vendor" | "saved" | "score" | "reasons">>;
  }>;
}
