"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EVENT_TYPE_LABELS, getCity, STYLE_LABELS, type EventType } from "@shindig/core";
import { api, usd, type Plan } from "@/lib/api";
import { useMe } from "@/lib/useMe";

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Plans() {
  const me = useMe("planner");
  const [plans, setPlans] = useState<Plan[] | null>(null);

  useEffect(() => {
    if (me) api<{ plans: Plan[] }>("/plans").then((r) => setPlans(r.plans));
  }, [me]);

  return (
    <main className="wrap narrow page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{me ? me.name : " "}</p>
          <h1>Plans</h1>
        </div>
        {plans && plans.length > 0 && (
          <Link className="btn accent" href="/plans/new">
            New Plan
          </Link>
        )}
      </div>
      {plans === null ? (
        <div className="loading">
          <span className="spinner" />
        </div>
      ) : plans.length === 0 ? (
        <div className="empty-state">
          <div className="swatches lg" style={{ justifyContent: "center", marginBottom: 24 }}>
            {["#8f3a46", "#e8c4bc", "#a3ae8d", "#c9a77c"].map((c) => (
              <span key={c} className="swatch" style={{ background: c }} />
            ))}
          </div>
          <h3>No Plans Yet</h3>
          <Link className="btn accent lg" href="/plans/new">
            Start a Plan <span className="arrow">→</span>
          </Link>
        </div>
      ) : (
        <div className="plan-list">
          {plans.map((p) => (
            <div key={p.id} className="plan-item">
            <Link href={`/plans/${p.id}`} className="card plan-row">
              <span className={p.brief ? "bar" : "bar empty"}>
                {p.brief?.palette.map((c) => <i key={c} style={{ background: c }} />)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 10 }}>
                  <h3>{p.name}</h3>
                  {!p.brief && <span className="badge amber">Needs Board</span>}
                </div>
                <div className="meta">
                  <span>{EVENT_TYPE_LABELS[p.eventType as EventType]}</span>
                  {p.date && <span>{fmtDate(p.date)}</span>}
                  <span>{getCity(p.cityId)?.name}</span>
                  <span>{p.guestCount} Guests</span>
                  <span>{usd(p.budget)}</span>
                </div>
                {p.brief && (
                  <p className="serif" style={{ marginTop: 8, fontStyle: "italic", color: "var(--ink-2)" }}>
                    {p.brief.styles
                      .slice(0, 3)
                      .map((s) => STYLE_LABELS[s.style])
                      .join(" · ")}
                  </p>
                )}
              </div>
              <span className="go" aria-hidden>
                →
              </span>
            </Link>
            <Link href={`/plans/${p.id}/edit`} className="plan-edit linkish small">
              Edit
            </Link>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
