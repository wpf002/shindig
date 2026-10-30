"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CATEGORY_LABELS,
  colorName,
  EVENT_TYPE_LABELS,
  getCity,
  STYLE_LABELS,
  type Category,
  type EventType,
} from "@shindig/core";
import { api, usd, type MatchesResponse, type MatchRow, type Plan } from "@/lib/api";
import { Swatches } from "./Swatches";

const FIT_LABEL = { under: "Under Budget", within: "In Budget", stretch: "A Stretch", over: "Over Budget" } as const;
const FIT_BADGE = { under: "moss", within: "moss", stretch: "amber", over: "thread" } as const;

export function Matches({ plan, data, onChange }: { plan: Plan; data: MatchesResponse; onChange: () => void }) {
  const [tab, setTab] = useState<Category>(data.categories[0]!.category);
  const [asking, setAsking] = useState<MatchRow | null>(null);
  const current = data.categories.find((c) => c.category === tab) ?? data.categories[0]!;

  async function toggleSave(m: MatchRow) {
    await api(`/plans/${plan.id}/saved/${m.vendor.id}`, { method: m.saved ? "DELETE" : "PUT" });
    onChange();
  }

  return (
    <div>
      {data.conflicts.length > 0 && (
        <div className="stack" style={{ marginBottom: 20 }}>
          {data.conflicts.map((c, i) => (
            <div key={i} className="note">
              <strong>{c.message}</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {c.options.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="tabs" role="tablist">
        {data.categories.map((c) => (
          <button key={c.category} role="tab" className="tab" aria-selected={c.category === tab} onClick={() => setTab(c.category)}>
            {CATEGORY_LABELS[c.category]}
            <span className="count">{c.matches.length}</span>
          </button>
        ))}
      </div>

      <p className="small muted" style={{ marginBottom: 12 }}>
        About {usd(current.allotted)} of your budget goes here. Ranked on fit alone; vendors can&apos;t pay to move up.
      </p>

      {current.matches.length === 0 ? (
        <div className="card flat">
          <p className="muted">No {CATEGORY_LABELS[current.category].toLowerCase()} fit this plan yet.</p>
        </div>
      ) : (
        current.matches.map((m) => (
          <article key={m.vendor.id} className="match">
            <div className="match-visual" aria-hidden>
              {m.vendor.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.vendor.images[0].url} alt="" />
              ) : (
                m.vendor.palette.slice(0, 4).map((c, i) => <div key={i} style={{ background: c }} />)
              )}
            </div>
            <div>
              <div className="row" style={{ gap: 8 }}>
                <h3>
                  <Link href={`/vendors/${m.vendor.id}?plan=${plan.id}`} style={{ textDecoration: "none" }}>
                    {m.vendor.name}
                  </Link>
                </h3>
                {m.vendor.isDemo && <span className="badge">Sample</span>}
                {m.vendor.verified && <span className="badge moss">Verified</span>}
              </div>
              <p className="small muted">
                {getCity(m.vendor.cityId)?.name} · {m.vendor.styles.map((s) => STYLE_LABELS[s]).join(", ")}
              </p>
              <ul className="why">
                {m.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
                {m.caveats.map((r) => (
                  <li key={r} className="caveat">
                    {r}
                  </li>
                ))}
              </ul>
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                {m.inquiry ? (
                  <span className="badge moss">{m.inquiry === "sent" ? "Asked" : m.inquiry === "replied" ? "Replied" : "Declined"}</span>
                ) : (
                  <button className="btn sm thread" onClick={() => setAsking(m)}>
                    Ask About Your Date
                  </button>
                )}
                <button className="btn sm ghost" onClick={() => toggleSave(m)}>
                  {m.saved ? "Saved" : "Save"}
                </button>
              </div>
            </div>
            <div>
              <div className="score">
                {m.score}
                <small>Fit</small>
              </div>
              <div style={{ marginTop: 10, textAlign: "right" }}>
                <span className={`badge ${FIT_BADGE[m.priceFit]}`}>{FIT_LABEL[m.priceFit]}</span>
              </div>
            </div>
          </article>
        ))
      )}

      {asking && (
        <InquiryDialog
          plan={plan}
          brief={data.brief}
          match={asking}
          onClose={() => setAsking(null)}
          onSent={() => {
            setAsking(null);
            onChange();
          }}
        />
      )}
    </div>
  );
}

function InquiryDialog({
  plan,
  brief,
  match,
  onClose,
  onSent,
}: {
  plan: Plan;
  brief: MatchesResponse["brief"];
  match: MatchRow;
  onClose: () => void;
  onSent: () => void;
}) {
  const look = brief.styles.slice(0, 2).map((s) => STYLE_LABELS[s.style].toLowerCase()).join(" and ");
  const colors = [...new Set(brief.palette.slice(0, 3).map(colorName))].join(", ");
  const when = plan.date ? `on ${plan.date}` : "(date still open)";
  const [msg, setMsg] = useState(
    `Hi! We're planning a ${EVENT_TYPE_LABELS[plan.eventType as EventType].toLowerCase()} ${when} in ${getCity(plan.cityId)?.name} for about ${plan.guestCount} guests. The look is ${look}${colors ? `, mostly ${colors}` : ""}. Are you available, and what would that run?`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api(`/plans/${plan.id}/inquiries`, { method: "POST", json: { vendorId: match.vendor.id, message: msg } });
      onSent();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="card dialog stack" role="dialog" aria-modal aria-label={`Message ${match.vendor.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h3>Ask {match.vendor.name}</h3>
          <Swatches colors={brief.palette.slice(0, 4)} />
        </div>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={2000} />
        <p className="small muted">
          They&apos;ll see your event details, your look, and your {CATEGORY_LABELS[match.category].toLowerCase()} budget. Not your
          email.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn thread" onClick={send} disabled={busy || !msg.trim()}>
            {busy ? <span className="spinner" /> : null} Send
          </button>
        </div>
      </div>
    </div>
  );
}
