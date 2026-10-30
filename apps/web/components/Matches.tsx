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
import { api, usd, type MatchesResponse, type MatchRow, type Plan, type PublicVendor } from "@/lib/api";
import { Swatches } from "./Swatches";
import { Ring } from "./Ring";

const FIT_LABEL = { under: "Under Budget", within: "In Budget", stretch: "A Stretch", over: "Over Budget" } as const;
const FIT_BADGE = { under: "moss", within: "moss", stretch: "amber", over: "accent" } as const;

export function Stars({ vendor }: { vendor: PublicVendor }) {
  if (vendor.rating == null) return null;
  return (
    <span className="stars" title={`${vendor.ratingCount ?? 0} Google reviews`}>
      ★ {vendor.rating.toFixed(1)}
      <span className="muted"> ({(vendor.ratingCount ?? 0).toLocaleString("en-US")})</span>
    </span>
  );
}

export function MatchVisual({ vendor }: { vendor: PublicVendor }) {
  const img = vendor.images[0];
  return (
    <div className="match-visual" title={img?.credit ?? undefined}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.url} alt={vendor.name} loading="lazy" />
      ) : (
        vendor.palette.slice(0, 4).map((c, i) => <div key={i} style={{ background: c }} aria-hidden />)
      )}
      {vendor.images.length > 1 && <span className="photo-count">{vendor.images.length} Photos</span>}
    </div>
  );
}

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
        <div style={{ marginBottom: 20 }}>
          {data.conflicts.map((c, i) => (
            <div key={i} className="conflict">
              <span className="icon">!</span>
              <div>
                <strong>{c.message}</strong>
                <ul>
                  {c.options.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </div>
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

      <div className="cat-bar">
        <div>
          <p className="eyebrow">{CATEGORY_LABELS[current.category]} Budget</p>
          <p className="small muted" title="Ranked on fit alone. Vendors can't pay to move up.">
            {Math.round((current.allotted / plan.budget) * 100)}% of {usd(plan.budget)} · Fit-Ranked
          </p>
        </div>
        <span className="big-num">{usd(current.allotted)}</span>
      </div>

      {current.matches.length === 0 ? (
        <div className="empty-state" style={{ padding: "48px 24px" }}>
          <p className="muted">No {CATEGORY_LABELS[current.category]} Matches Yet</p>
        </div>
      ) : (
        current.matches.map((m, idx) => (
          <article key={m.vendor.id} className="match" style={{ animationDelay: `${idx * 50}ms` }}>
            <MatchVisual vendor={m.vendor} />
            <div className="match-body">
              <div className="row" style={{ gap: 8 }}>
                <h3>
                  <Link href={`/vendors/${m.vendor.id}?plan=${plan.id}`}>
                    {m.vendor.name}
                  </Link>
                </h3>
                {m.vendor.isDemo && <span className="badge">Sample</span>}
                {m.vendor.verified && <span className="badge moss">Verified</span>}
              </div>
              <div className="meta" style={{ marginTop: 4 }}>
                <span>{getCity(m.vendor.cityId)?.name}</span>
                {m.vendor.rating != null && <span><Stars vendor={m.vendor} /></span>}
                <span>{m.vendor.styles.slice(0, 3).map((s) => STYLE_LABELS[s]).join(", ")}</span>
              </div>
              <ul className="why">
                {m.reasons.slice(0, m.caveats.length ? 2 : 3).map((r) => (
                  <li key={r} title={r}>{r}</li>
                ))}
                {m.caveats.slice(0, 1).map((r) => (
                  <li key={r} className="caveat" title={r}>
                    {r}
                  </li>
                ))}
              </ul>
              <div className="row match-actions" style={{ gap: 8 }}>
                {m.inquiry ? (
                  <span className="badge moss">{m.inquiry === "sent" ? "Asked" : m.inquiry === "replied" ? "Replied" : "Declined"}</span>
                ) : m.vendor.listed ? (
                  <>
                    {m.vendor.website && (
                      <a className="btn sm accent" href={m.vendor.website} target="_blank" rel="noopener noreferrer nofollow">
                        Website
                      </a>
                    )}
                    {m.vendor.phone && (
                      <a className={`btn sm ${m.vendor.website ? "ghost" : "accent"}`} href={`tel:${m.vendor.phone.replace(/[^0-9+]/g, "")}`}>
                        Call
                      </a>
                    )}
                  </>
                ) : (
                  <button className="btn sm accent" onClick={() => setAsking(m)}>
                    Check Date
                  </button>
                )}
                <button className="btn sm ghost" aria-pressed={m.saved} onClick={() => toggleSave(m)}>
                  {m.saved ? "♥ Saved" : "♡ Save"}
                </button>
              </div>
            </div>
            <div className="side">
              <Ring value={m.score} size={60} />
              <div className="cost">
                <b title={m.vendor.priceEstimated ? "Typical range for the area. This vendor hasn't set prices." : undefined}>
                  {m.vendor.priceEstimated && <span className="est">Est.</span>}
                  {usd(m.estimatedCost.low)}
                  {m.estimatedCost.high !== m.estimatedCost.low ? `–${usd(m.estimatedCost.high)}` : ""}
                </b>
                <span className={`badge ${FIT_BADGE[m.priceFit]}`} style={{ marginTop: 6 }}>
                  {FIT_LABEL[m.priceFit]}
                </span>
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
      <div className="card pad-lg dialog stack" role="dialog" aria-modal aria-label={`Message ${match.vendor.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <p className="eyebrow">{CATEGORY_LABELS[match.category]}</p>
            <h2 style={{ marginTop: 4 }}>{match.vendor.name}</h2>
          </div>
          <Swatches colors={brief.palette.slice(0, 4)} />
        </div>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={2000} />
        <p className="small muted">They see your event, look and budget. Not your email.</p>
        {error && <p className="error">{error}</p>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn accent" onClick={send} disabled={busy || !msg.trim()}>
            {busy ? <span className="spinner" /> : null} Send
          </button>
        </div>
      </div>
    </div>
  );
}
