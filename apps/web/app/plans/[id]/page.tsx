"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { EVENT_TYPE_LABELS, getCity, type EventType } from "@shindig/core";
import { api, usd, type MatchesResponse, type Plan } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { Inspiration } from "@/components/Inspiration";
import { BriefPanel } from "@/components/BriefPanel";
import { Matches } from "@/components/Matches";
import { InquiryList } from "@/components/InquiryList";

const PIN_NOTICE: Record<string, string> = {
  connected: "Pinterest is connected. Pick a board.",
  denied: "Pinterest access wasn't granted.",
  error: "Couldn't connect Pinterest. Try again.",
};

function PlanView() {
  const me = useMe("planner");
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [matches, setMatches] = useState<MatchesResponse | null>(null);
  const [replacing, setReplacing] = useState(Boolean(params.get("pinterest")));
  const [error, setError] = useState<string | null>(null);

  const loadMatches = useCallback(() => {
    api<MatchesResponse>(`/plans/${id}/matches`)
      .then(setMatches)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!me) return;
    api<{ plan: Plan }>(`/plans/${id}`)
      .then((r) => {
        setPlan(r.plan);
        if (r.plan.brief) loadMatches();
      })
      .catch((e: Error) => setError(e.message));
  }, [me, id, loadMatches]);

  function onBrief(p: Plan) {
    setPlan(p);
    setReplacing(false);
    setMatches(null);
    loadMatches();
  }

  if (error && !plan) return <main className="wrap" style={{ padding: 40 }}><p className="error">{error}</p></main>;
  if (!plan) return <main className="wrap" style={{ padding: 40 }}><p className="muted">Loading…</p></main>;

  const pin = params.get("pinterest");
  const needsBoard = !plan.brief || replacing;

  return (
    <main className="wrap">
      <header className="plan-head">
        <Link href="/plans" className="small muted">
          ← My Plans
        </Link>
        <h1 style={{ fontSize: "2.4rem", marginTop: 8 }}>{plan.name}</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          {EVENT_TYPE_LABELS[plan.eventType as EventType]} · {getCity(plan.cityId)?.name} · {plan.guestCount} guests · {usd(plan.budget)}
          {plan.date ? ` · ${plan.date}` : ""}
        </p>
      </header>

      {needsBoard ? (
        <div style={{ maxWidth: 760, paddingBottom: 80 }}>
          <h2 style={{ marginBottom: 6 }}>Bring Your Board</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            This is how Shindig learns the look. The more pins, the better the read.
          </p>
          <Inspiration plan={plan} onRead={onBrief} notice={pin ? PIN_NOTICE[pin] : null} />
          {replacing && (
            <button className="linkish small" style={{ marginTop: 16 }} onClick={() => setReplacing(false)}>
              Keep the Current Board
            </button>
          )}
        </div>
      ) : (
        <div className="plan-grid">
          <aside>
            <BriefPanel plan={plan} onSaved={onBrief} onReplace={() => setReplacing(true)} />
            <InquiryList planId={plan.id} version={matches} />
          </aside>
          <section>
            {error && <p className="error">{error}</p>}
            {matches ? <Matches plan={plan} data={matches} onChange={loadMatches} /> : <p className="muted">Finding your vendors…</p>}
          </section>
        </div>
      )}
    </main>
  );
}

export default function PlanPage() {
  return (
    <Suspense>
      <PlanView />
    </Suspense>
  );
}
