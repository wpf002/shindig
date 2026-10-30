"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CATEGORY_LABELS, colorName, EVENT_TYPE_LABELS, getCity, STYLE_LABELS, type Category, type EventType } from "@shindig/core";
import { api, type SharedPlan } from "@/lib/api";
import { MatchVisual, Stars } from "@/components/Matches";
import { Ring } from "@/components/Ring";

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Category | null>(null);

  useEffect(() => {
    api<SharedPlan>(`/share/${token}`)
      .then((d) => {
        setData(d);
        setTab(d.categories[0]?.category ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  if (error)
    return (
      <main className="wrap page">
        <div className="empty-state">
          <p className="muted">{error}</p>
        </div>
      </main>
    );
  if (!data)
    return (
      <main className="loading">
        <span className="spinner" />
      </main>
    );

  const { plan, brief } = data;
  const current = data.categories.find((c) => c.category === tab) ?? data.categories[0];
  const facts: Array<[string, string]> = [
    ["Event", EVENT_TYPE_LABELS[plan.eventType as EventType]],
    ["Date", plan.date ? new Date(plan.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD"],
    ["City", getCity(plan.cityId)?.name ?? ""],
    ["Guests", String(plan.guestCount)],
  ];

  return (
    <main className="wrap">
      <header className="plan-head">
        <p className="eyebrow">Shared Plan</p>
        <div className="plan-title">
          <h1>{plan.name}</h1>
        </div>
        <dl className="facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="plan-grid">
        <aside className="stack plan-aside">
          <div className="card brief">
            <section>
              <p className="eyebrow">The Look</p>
              {brief.palette.length > 0 && (
                <div className="swatch-strip" style={{ marginTop: 12 }}>
                  {brief.palette.map((c, i) => (
                    <div key={`${c}-${i}`} style={{ background: c }} title={`${colorName(c)} ${c}`} />
                  ))}
                </div>
              )}
              <p className="summary" style={{ marginTop: 16 }}>
                {brief.summary}
              </p>
            </section>
            <section>
              <p className="eyebrow" style={{ marginBottom: 10 }}>
                Styles
              </p>
              <div className="row" style={{ gap: 6 }}>
                {brief.styles.map((s) => (
                  <span key={s.style} className="chip">
                    {STYLE_LABELS[s.style]}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </aside>

        <section>
          <div className="tabs" role="tablist">
            {data.categories.map((c) => (
              <button key={c.category} role="tab" className="tab" aria-selected={c.category === current?.category} onClick={() => setTab(c.category)}>
                {CATEGORY_LABELS[c.category]}
                <span className="count">{c.matches.length}</span>
              </button>
            ))}
          </div>
          {!current || current.matches.length === 0 ? (
            <div className="empty-state" style={{ padding: "48px 24px" }}>
              <p className="muted">No Matches Yet</p>
            </div>
          ) : (
            current.matches.map((m, idx) => (
              <article key={m.vendor.id} className="match" style={{ animationDelay: `${idx * 50}ms` }}>
                <MatchVisual vendor={m.vendor} />
                <div className="match-body">
                  <div className="row" style={{ gap: 8 }}>
                    <h3>{m.vendor.name}</h3>
                    {m.saved && <span className="badge accent">Shortlisted</span>}
                    {m.vendor.isDemo && <span className="badge">Sample</span>}
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    <span>{getCity(m.vendor.cityId)?.name}</span>
                    {m.vendor.rating != null && <span><Stars vendor={m.vendor} /></span>}
                    <span>{m.vendor.styles.slice(0, 3).map((s) => STYLE_LABELS[s]).join(", ")}</span>
                  </div>
                  <p className="small muted clamp-2" style={{ marginTop: 8 }}>
                    {m.vendor.description}
                  </p>
                  <ul className="why">
                    {m.reasons.slice(0, 3).map((r) => (
                      <li key={r} title={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                <div className="side">
                  <Ring value={m.score} size={60} />
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
