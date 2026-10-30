"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CATEGORY_LABELS, getCity, STYLE_LABELS, type Match } from "@shindig/core";
import { api, usd, type PublicVendor } from "@/lib/api";
import { Swatches } from "@/components/Swatches";

function VendorView() {
  const { id } = useParams<{ id: string }>();
  const planId = useSearchParams().get("plan");
  const [data, setData] = useState<{ vendor: PublicVendor; match: Match | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = planId && /^[a-z0-9]+$/.test(planId) ? `?planId=${planId}` : "";
    api<{ vendor: PublicVendor; match: Match | null }>(`/vendors/${id}${q}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id, planId]);

  if (error) return <main className="wrap" style={{ padding: 40 }}><p className="error">{error}</p></main>;
  if (!data) return <main className="wrap" style={{ padding: 40 }}><p className="muted">Loading…</p></main>;
  const { vendor: v, match } = data;
  const price =
    v.priceUnit === "per_guest" ? `${usd(v.priceMin)}–${usd(v.priceMax)} per guest` : `${usd(v.priceMin)}–${usd(v.priceMax)}`;

  return (
    <main className="wrap" style={{ padding: "32px 20px 80px", maxWidth: 900 }}>
      {planId && (
        <Link href={`/plans/${planId}`} className="small muted">
          ← Back to Matches
        </Link>
      )}
      <div className="row between" style={{ marginTop: 10 }}>
        <div>
          <p className="eyebrow">{CATEGORY_LABELS[v.category]}</p>
          <h1 style={{ fontSize: "2.4rem", marginTop: 6 }}>{v.name}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {getCity(v.cityId)?.name} · {price}
            {v.capacityMax ? ` · up to ${v.capacityMax} guests` : ""}
          </p>
        </div>
        <Swatches colors={v.palette} size="lg" />
      </div>
      {v.isDemo && (
        <p className="note small" style={{ marginTop: 16 }}>
          Sample listing for demo purposes. Not a real business.
        </p>
      )}

      {match && (
        <section className="card" style={{ marginTop: 20 }}>
          <div className="row between">
            <h3>How They Fit Your Board</h3>
            <span className="score">
              {match.score}
              <small>Fit</small>
            </span>
          </div>
          <ul className="why">
            {match.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
            {match.caveats.map((r) => (
              <li key={r} className="caveat">
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" style={{ marginTop: 20 }}>
        <p>{v.description}</p>
        <div className="chips" style={{ marginTop: 14 }}>
          {v.styles.map((s) => (
            <span key={s} className="chip static">
              {STYLE_LABELS[s]}
            </span>
          ))}
        </div>
        {v.website && (
          <p style={{ marginTop: 14 }}>
            <a href={v.website} target="_blank" rel="noopener noreferrer nofollow">
              Visit Website
            </a>
          </p>
        )}
      </section>

      {v.images.length > 0 && (
        <section className="thumbs" style={{ marginTop: 20 }}>
          {v.images.map((img) => (
            <figure key={img.url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" loading="lazy" />
            </figure>
          ))}
        </section>
      )}
    </main>
  );
}

export default function VendorPage() {
  return (
    <Suspense>
      <VendorView />
    </Suspense>
  );
}
