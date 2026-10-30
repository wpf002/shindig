"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EVENT_TYPE_LABELS, getCity, STYLE_LABELS, type EventType } from "@shindig/core";
import { api, usd, type Plan } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { Swatches } from "@/components/Swatches";

export default function Plans() {
  const me = useMe("planner");
  const [plans, setPlans] = useState<Plan[] | null>(null);

  useEffect(() => {
    if (me) api<{ plans: Plan[] }>("/plans").then((r) => setPlans(r.plans));
  }, [me]);

  return (
    <main className="wrap" style={{ padding: "36px 20px 80px", maxWidth: 820 }}>
      <div className="row between" style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: "2.2rem" }}>My Plans</h1>
        <Link className="btn thread" href="/plans/new">
          New Plan
        </Link>
      </div>
      {plans === null ? (
        <p className="muted">Loading…</p>
      ) : plans.length === 0 ? (
        <div className="card">
          <h3>Nothing Here Yet</h3>
          <p className="muted" style={{ marginTop: 6 }}>
            Start a plan with the basics: date, guests, budget. Then bring your board.
          </p>
        </div>
      ) : (
        plans.map((p) => (
          <Link key={p.id} href={`/plans/${p.id}`} className="card list-plan">
            <div>
              <h3>{p.name}</h3>
              <p className="small muted">
                {EVENT_TYPE_LABELS[p.eventType as EventType]} · {getCity(p.cityId)?.name} · {p.guestCount} guests · {usd(p.budget)}
                {p.date ? ` · ${p.date}` : ""}
              </p>
              {p.brief && (
                <p className="small" style={{ marginTop: 4 }}>
                  {p.brief.styles.slice(0, 3).map((s) => STYLE_LABELS[s.style]).join(", ")}
                </p>
              )}
            </div>
            {p.brief ? <Swatches colors={p.brief.palette} /> : <span className="badge amber">Needs Inspiration</span>}
          </Link>
        ))
      )}
    </main>
  );
}
