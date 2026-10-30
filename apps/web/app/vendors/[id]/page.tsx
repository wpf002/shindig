"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CATEGORY_LABELS, getCity, STYLE_LABELS, type Match } from "@shindig/core";
import { api, usd, type PublicVendor } from "@/lib/api";
import { Swatches } from "@/components/Swatches";
import { Ring } from "@/components/Ring";

const PARTS = [
  ["style", "Style"],
  ["palette", "Palette"],
  ["formality", "Formality"],
  ["setting", "Setting"],
  ["price", "Price"],
] as const;

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

  if (error)
    return (
      <main className="wrap page">
        <p className="error">{error}</p>
      </main>
    );
  if (!data)
    return (
      <main className="loading">
        <span className="spinner" />
      </main>
    );
  const { vendor: v, match } = data;
  const price =
    v.priceUnit === "per_guest" ? `${usd(v.priceMin)}–${usd(v.priceMax)} / Guest` : `${usd(v.priceMin)}–${usd(v.priceMax)}`;

  const imgs = v.images.slice(0, 5);

  return (
    <main className="wrap page" style={{ paddingTop: 32 }}>
      {planId && (
        <Link href={`/plans/${planId}`} className="back">
          ← Matches
        </Link>
      )}
      <div className="row between" style={{ marginTop: 14, alignItems: "end" }}>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <p className="eyebrow">{CATEGORY_LABELS[v.category]}</p>
            {v.isDemo && (
              <span className="badge plain" title="Sample listing. Not a real business.">
                Sample
              </span>
            )}
            {v.verified && <span className="badge moss">Verified</span>}
          </div>
          <h1 style={{ marginTop: 10 }}>{v.name}</h1>
        </div>
        {imgs.length >= 3 && <Swatches colors={v.palette} size="lg" />}
      </div>

      <div className={imgs.length >= 3 ? `gallery n${Math.min(imgs.length, 5)}` : "gallery swatch-only"}>
        {imgs.length >= 3
          ? imgs.slice(0, 5).map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={img.url} src={img.url} alt="" />
            ))
          : v.palette.slice(0, 5).map((c, i) => <div key={i} style={{ background: c }} />)}
      </div>

      <div className="vendor-grid">
        <div>
          <p className="desc">{v.description}</p>
          <div className="chips" style={{ marginTop: 20 }}>
            {v.styles.map((s) => (
              <span key={s} className="chip static">
                {STYLE_LABELS[s]}
              </span>
            ))}
          </div>
          <dl className="kv">
            <div>
              <dt>Based In</dt>
              <dd>{getCity(v.cityId)?.name}</dd>
            </div>
            <div>
              <dt>Price</dt>
              <dd>{price}</dd>
            </div>
            <div>
              <dt>Travels</dt>
              <dd>{v.serviceRadiusMi} mi</dd>
            </div>
            {v.capacityMax ? (
              <div>
                <dt>Capacity</dt>
                <dd>{v.capacityMax} Guests</dd>
              </div>
            ) : null}
          </dl>
          {v.website && (
            <a className="btn ghost" style={{ marginTop: 24 }} href={v.website} target="_blank" rel="noopener noreferrer nofollow">
              Website <span className="arrow">↗</span>
            </a>
          )}
          {v.images.length > 5 && (
            <section className="thumbs" style={{ marginTop: 32 }}>
              {v.images.slice(5).map((img) => (
                <figure key={img.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" loading="lazy" />
                </figure>
              ))}
            </section>
          )}
        </div>

        {match && (
          <aside className="card sticky">
            <div className="row between">
              <div>
                <p className="eyebrow">Fit</p>
                <h3 style={{ marginTop: 6 }}>Your Board</h3>
              </div>
              <Ring value={match.score} size={72} />
            </div>
            <ul className="parts">
              {PARTS.map(([k, label]) => (
                <li key={k}>
                  <span className="muted">{label}</span>
                  <span className="track">
                    <i style={{ width: `${Math.round(match.parts[k] * 100)}%` }} />
                  </span>
                  <b>{Math.round(match.parts[k] * 100)}</b>
                </li>
              ))}
            </ul>
            <hr className="divider" style={{ margin: "18px 0 6px" }} />
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
          </aside>
        )}
      </div>
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
