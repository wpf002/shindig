"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  allocateBudget,
  BASE_ALLOCATION,
  CATEGORIES,
  CATEGORY_LABELS,
  CITIES,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  type Category,
  type EventType,
} from "@shindig/core";
import { api, usd, type Plan } from "@/lib/api";
import { DatePicker } from "@/components/DatePicker";

const DEFAULTS: Record<EventType, Category[]> = {
  wedding: ["venue", "planner", "photographer", "caterer", "florist", "dj"],
  engagement: ["venue", "caterer", "photographer", "bar_service"],
  birthday: ["venue", "caterer", "dj", "decor_rentals"],
  shower: ["venue", "caterer", "decor_rentals", "florist"],
  quinceanera: ["venue", "caterer", "dj", "photographer", "decor_rentals"],
  corporate: ["venue", "caterer", "bar_service", "planner"],
  gathering: ["venue", "caterer", "bar_service"],
};

/** Create a plan, or edit one when `plan` is passed. */
export function PlanForm({ plan }: { plan?: Plan }) {
  const router = useRouter();
  const editing = Boolean(plan);
  const [eventType, setEventType] = useState<EventType>((plan?.eventType as EventType) ?? "wedding");
  const [cats, setCats] = useState<Category[]>((plan?.categories as Category[]) ?? DEFAULTS.wedding);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [budget, setBudget] = useState(plan ? plan.budget.toLocaleString("en-US") : "");
  const [guests, setGuests] = useState(plan?.guestCount ?? 100);

  const total = Number(budget.replace(/[^0-9]/g, "")) || 0;
  const split = allocateBudget({ eventType, budget: total, categories: cats });
  const rows = cats.map((c) => ({ c, amt: split[c] ?? 0 })).sort((a, b) => b.amt - a.amt);
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
      const saved = await api<{ plan: Plan }>(editing ? `/plans/${plan!.id}` : "/plans", {
        method: editing ? "PATCH" : "POST",
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
      router.push(`/plans/${saved.plan.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="wrap page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{editing ? "Edit Plan" : "New Plan"}</p>
          <h1>{editing ? plan!.name : "The Basics"}</h1>
        </div>
        {editing && (
          <Link className="btn ghost" href={`/plans/${plan!.id}`}>
            Cancel
          </Link>
        )}
      </div>
      <form className="split" onSubmit={submit}>
        <div className="card pad-lg stack" style={{ ["--gap" as string]: "28px" }}>
          {error && <p className="error">{error}</p>}

          <div>
            <span className="label">Event</span>
            <div className="seg" role="group" aria-label="Event type">
              {EVENT_TYPES.map((t) => (
                <button type="button" key={t} aria-pressed={eventType === t} onClick={() => pickType(t)}>
                  {EVENT_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>Name</span>
            <input name="name" required maxLength={80} placeholder="Ava & Sam, Spring 2027" defaultValue={plan?.name} />
          </label>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="plan-date" className="label">Date</label>
              <DatePicker name="date" id="plan-date" defaultValue={plan?.date ?? ""} />
            </div>
            <label className="field">
              <span>City</span>
              <select name="cityId" defaultValue={plan?.cityId ?? "dallas"}>
                {CITIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Guests</span>
              <input
                name="guestCount"
                type="number"
                min={1}
                max={5000}
                required
                value={guests}
                onChange={(e) => setGuests(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Budget</span>
              <span className="input-prefix">
                <b>$</b>
                <input
                  name="budget"
                  inputMode="numeric"
                  required
                  placeholder="30,000"
                  pattern="[0-9,$ ]+"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </span>
            </label>
          </div>

          <div>
            <span className="label">Vendors</span>
            <div className="chips">
              {offered.map((c) => (
                <button type="button" key={c} className="chip" aria-pressed={cats.includes(c)} onClick={() => toggle(c)}>
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="card sticky">
          <p className="eyebrow">Budget Split</p>
          <p className="big-num" style={{ marginTop: 10 }}>
            {total ? usd(total) : "$—"}
          </p>
          <p className="small muted" style={{ marginTop: 4 }}>
            {total && guests > 0 ? `${usd(total / guests)} Per Guest` : `${EVENT_TYPE_LABELS[eventType]}`}
          </p>
          <ul className="alloc" style={{ marginTop: 18 }}>
            {rows.map(({ c, amt }) => (
              <li key={c}>
                <span>{CATEGORY_LABELS[c]}</span>
                <b>{total ? usd(amt) : "—"}</b>
                <span className="track">
                  <i style={{ width: `${total ? (amt / total) * 100 : (BASE_ALLOCATION[eventType][c] ?? 0.04) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <button className="btn accent lg block" style={{ marginTop: 20 }} disabled={busy || cats.length === 0}>
            {busy ? <span className="spinner" /> : null}{" "}
            {editing ? "Save Changes" : (
              <>
                Add Your Board <span className="arrow">→</span>
              </>
            )}
          </button>
        </aside>
      </form>
    </main>
  );
}
