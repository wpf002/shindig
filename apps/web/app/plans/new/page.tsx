"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BASE_ALLOCATION,
  CATEGORIES,
  CATEGORY_LABELS,
  CITIES,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  type Category,
  type EventType,
} from "@shindig/core";
import { api, type Plan } from "@/lib/api";
import { useMe } from "@/lib/useMe";

const DEFAULTS: Record<EventType, Category[]> = {
  wedding: ["venue", "planner", "photographer", "caterer", "florist", "dj"],
  engagement: ["venue", "caterer", "photographer", "bar_service"],
  birthday: ["venue", "caterer", "dj", "decor_rentals"],
  shower: ["venue", "caterer", "decor_rentals", "florist"],
  quinceanera: ["venue", "caterer", "dj", "photographer", "decor_rentals"],
  corporate: ["venue", "caterer", "bar_service", "planner"],
  gathering: ["venue", "caterer", "bar_service"],
};

export default function NewPlan() {
  useMe("planner");
  const router = useRouter();
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [cats, setCats] = useState<Category[]>(DEFAULTS.wedding);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const offered = CATEGORIES.filter((c) => c in BASE_ALLOCATION[eventType]);

  function pickType(t: EventType) {
    setEventType(t);
    setCats(DEFAULTS[t]);
  }
  const toggle = (c: Category) => setCats((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c]));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const { plan } = await api<{ plan: Plan }>("/plans", {
        method: "POST",
        json: {
          name: String(f.get("name")),
          eventType,
          date: f.get("date") ? String(f.get("date")) : null,
          cityId: String(f.get("cityId")),
          guestCount: Number(f.get("guestCount")),
          budget: Number(String(f.get("budget")).replace(/[^0-9]/g, "")),
          categories: cats,
        },
      });
      router.push(`/plans/${plan.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="wrap" style={{ padding: "36px 20px 80px", maxWidth: 760 }}>
      <form className="card stack" style={{ ["--gap" as string]: "20px" }} onSubmit={submit}>
        <div>
          <p className="eyebrow">New Plan</p>
          <h2 style={{ marginTop: 6 }}>The Basics</h2>
          <p className="muted small" style={{ marginTop: 4 }}>
            Your board decides the look. These numbers decide what&apos;s realistic.
          </p>
        </div>
        {error && <p className="error">{error}</p>}

        <div className="chips" role="group" aria-label="Event type">
          {EVENT_TYPES.map((t) => (
            <button type="button" key={t} className="chip" aria-pressed={eventType === t} onClick={() => pickType(t)}>
              {EVENT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <label className="field">
          <span>Name</span>
          <input name="name" required maxLength={80} placeholder="Ava & Sam, Spring 2027" />
        </label>

        <div className="grid-2">
          <label className="field">
            <span>Date</span>
            <input name="date" type="date" />
          </label>
          <label className="field">
            <span>City</span>
            <select name="cityId" defaultValue="dallas">
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Guests</span>
            <input name="guestCount" type="number" min={1} max={5000} required defaultValue={100} />
          </label>
          <label className="field">
            <span>Total Budget ($)</span>
            <input name="budget" inputMode="numeric" required placeholder="30000" pattern="[0-9,$ ]+" />
          </label>
        </div>

        <div>
          <p className="field" style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--ink-2)", marginBottom: 8 }}>
            What You Need
          </p>
          <div className="chips">
            {offered.map((c) => (
              <button type="button" key={c} className="chip" aria-pressed={cats.includes(c)} onClick={() => toggle(c)}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          <button className="btn thread" disabled={busy || cats.length === 0}>
            {busy ? <span className="spinner" /> : null} Next: Your Board
          </button>
        </div>
      </form>
    </main>
  );
}
