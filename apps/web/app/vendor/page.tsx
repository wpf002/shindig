"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CITIES,
  colorName,
  EVENT_TYPE_LABELS,
  getCity,
  STYLE_LABELS,
  STYLES,
  VENUE_TYPES,
  type Brief,
  type Category,
  type EventType,
  type Style,
} from "@shindig/core";
import { api, usd, type PublicVendor } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { toFormData } from "@/lib/resize";
import { Swatches } from "@/components/Swatches";

type Mine = PublicVendor & { email: string; active: boolean };
interface Suggestion {
  styles: Style[];
  palette: string[];
  formalityMin: number;
  formalityMax: number;
  analyzer: "claude" | "palette";
}
interface Inq {
  id: string;
  from: string;
  message: string;
  status: "sent" | "replied" | "declined";
  vendorReply: string | null;
  event: { type: EventType; date: string | null; cityId: string; guestCount: number; categoryBudget: number | null };
  brief: Pick<Brief, "summary" | "styles" | "palette" | "formality" | "setting" | "keywords"> | null;
}

const title = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const FORMALITY = ["", "Casual", "Relaxed", "Semi-Formal", "Formal", "Black Tie"];

export default function VendorPortal() {
  const me = useMe("vendor");
  const [vendor, setVendor] = useState<Mine | null | undefined>(undefined);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [inquiries, setInquiries] = useState<Inq[]>([]);

  const load = useCallback(() => {
    api<{ vendor: Mine | null }>("/me/vendor").then((r) => setVendor(r.vendor));
    api<{ inquiries: Inq[] }>("/me/vendor/inquiries").then((r) => setInquiries(r.inquiries));
  }, []);
  useEffect(() => {
    if (me) load();
  }, [me, load]);

  if (vendor === undefined)
    return (
      <main className="loading">
        <span className="spinner" />
      </main>
    );

  const open = inquiries.filter((r) => r.status === "sent").length;

  return (
    <main className={vendor ? "wrap" : "wrap narrow"}>
      <header className="plan-head">
        <div className="row between" style={{ alignItems: "end" }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <p className="eyebrow">{vendor ? CATEGORY_LABELS[vendor.category] : "Portal"}</p>
              {vendor && <span className={`badge ${vendor.active ? "moss" : ""}`}>{vendor.active ? "Live" : "Hidden"}</span>}
            </div>
            <h1 style={{ marginTop: 10 }}>{vendor?.name ?? "Your Listing"}</h1>
          </div>
          {vendor && <Swatches colors={vendor.palette} size="lg" />}
        </div>
        {vendor && (
          <dl className="facts">
            <div>
              <dt>Inquiries</dt>
              <dd>{inquiries.length}</dd>
            </div>
            <div>
              <dt>Open</dt>
              <dd>{open}</dd>
            </div>
            <div>
              <dt>Photos</dt>
              <dd>{vendor.images.length}</dd>
            </div>
            <div>
              <dt>Styles</dt>
              <dd>{vendor.styles.length}</dd>
            </div>
          </dl>
        )}
      </header>

      <div className={vendor ? "portal" : ""} style={vendor ? undefined : { paddingBottom: 112 }}>
        {vendor && (
          <nav className="sticky" aria-label="Sections">
            {inquiries.length > 0 && (
              <a href="#inquiries">
                Inquiries {open > 0 && <span className="badge accent plain">{open}</span>}
              </a>
            )}
            <a href="#profile">Profile</a>
            <a href="#portfolio">Portfolio</a>
          </nav>
        )}
        <div className="stack" style={{ ["--gap" as string]: "24px" }}>
          {vendor && inquiries.length > 0 && <Inbox rows={inquiries} onReply={load} />}
          <ProfileForm vendor={vendor} suggestion={suggestion} onSaved={(v) => setVendor(v)} />
          {vendor && (
            <Portfolio
              vendor={vendor}
              onChange={(s) => {
                if (s) setSuggestion(s);
                load();
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function ProfileForm({ vendor, suggestion, onSaved }: { vendor: Mine | null; suggestion: Suggestion | null; onSaved: (v: Mine) => void }) {
  const [category, setCategory] = useState<Category>(vendor?.category ?? "photographer");
  const [styles, setStyles] = useState<Style[]>(vendor?.styles ?? []);
  const [palette, setPalette] = useState<string[]>(vendor?.palette ?? []);
  const [formality, setFormality] = useState<[number, number]>([vendor?.formalityMin ?? 2, vendor?.formalityMax ?? 4]);
  const [settings, setSettings] = useState<Array<"indoor" | "outdoor">>(vendor?.settings ?? ["indoor", "outdoor"]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggleStyle = (s: Style) => setStyles((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s].slice(-6)));
  const toggleSetting = (s: "indoor" | "outdoor") =>
    setSettings((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));

  function applySuggestion() {
    if (!suggestion) return;
    setStyles(suggestion.styles);
    setPalette(suggestion.palette);
    setFormality([suggestion.formalityMin, suggestion.formalityMax]);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => Number(String(f.get(k) ?? "").replace(/[^0-9]/g, ""));
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await api<{ vendor: Mine }>("/me/vendor", {
        method: "PUT",
        json: {
          name: f.get("name"),
          category,
          cityId: f.get("cityId"),
          serviceRadiusMi: num("serviceRadiusMi"),
          priceMin: num("priceMin"),
          priceMax: num("priceMax"),
          priceUnit: f.get("priceUnit"),
          capacityMax: category === "venue" ? num("capacityMax") || null : null,
          venueType: category === "venue" ? f.get("venueType") || null : null,
          styles,
          palette,
          formalityMin: formality[0],
          formalityMax: formality[1],
          settings,
          description: f.get("description"),
          website: f.get("website") || null,
          email: f.get("email"),
        },
      });
      onSaved(r.vendor);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="profile" className="card pad-lg stack" style={{ ["--gap" as string]: "22px" }} onSubmit={submit}>
      <h2>Profile</h2>
      <div className="grid-2">
        <label className="field">
          <span>Business Name</span>
          <input name="name" required maxLength={100} defaultValue={vendor?.name} />
        </label>
        <label className="field">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Based In</span>
          <select name="cityId" defaultValue={vendor?.cityId ?? "dallas"}>
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{category === "venue" ? "Planners Within (mi)" : "Will Travel (mi)"}</span>
          <input name="serviceRadiusMi" type="number" min={0} max={300} required defaultValue={vendor?.serviceRadiusMi ?? 50} />
        </label>
        <label className="field">
          <span>Starting Price</span>
          <input name="priceMin" inputMode="numeric" required defaultValue={vendor?.priceMin} />
        </label>
        <label className="field">
          <span>Typical High</span>
          <input name="priceMax" inputMode="numeric" required defaultValue={vendor?.priceMax} />
        </label>
        <label className="field">
          <span>Priced</span>
          <select name="priceUnit" defaultValue={vendor?.priceUnit ?? "flat"}>
            <option value="flat">Per Event</option>
            <option value="per_guest">Per Guest</option>
          </select>
        </label>
        <label className="field">
          <span>Inquiry Email</span>
          <input name="email" type="email" required defaultValue={vendor?.email} />
        </label>
        {category === "venue" && (
          <>
            <label className="field">
              <span>Max Guests</span>
              <input name="capacityMax" type="number" min={1} defaultValue={vendor?.capacityMax ?? undefined} />
            </label>
            <label className="field">
              <span>Venue Type</span>
              <select name="venueType" defaultValue={vendor?.venueType ?? "ballroom"}>
                {VENUE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {title(v)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <label className="field">
        <span>About</span>
        <textarea name="description" maxLength={1200} defaultValue={vendor?.description} placeholder="What you do, in a few lines." />
      </label>
      <label className="field">
        <span>Website</span>
        <input name="website" type="url" placeholder="https://" defaultValue={vendor?.website ?? ""} />
      </label>

      <div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span className="label" style={{ margin: 0 }}>Your Look</span>
          {suggestion && (
            <button type="button" className="btn sm ghost" onClick={applySuggestion}>
              Use Photo Tags
            </button>
          )}
        </div>
        {suggestion && (
          <p className="ok small" style={{ marginBottom: 10 }}>
            {suggestion.styles.map((s) => STYLE_LABELS[s]).join(", ") || "Mixed"}
            {suggestion.palette.length ? ` · ${[...new Set(suggestion.palette.map(colorName))].slice(0, 3).join(", ")}` : ""}
          </p>
        )}
        <div className="chips">
          {STYLES.map((s) => (
            <button type="button" key={s} className="chip" aria-pressed={styles.includes(s)} onClick={() => toggleStyle(s)}>
              {STYLE_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Swatches colors={palette} />
          {palette.length === 0 && <span className="small muted">No Palette Yet</span>}
        </div>
      </div>

      <div className="grid-2">
        <label className="field">
          <span className="row between">
            Least Formal <b style={{ color: "var(--ink)" }}>{FORMALITY[formality[0]]}</b>
          </span>
          <input type="range" min={1} max={5} value={formality[0]} style={{ ["--fill" as string]: `${((formality[0] - 1) / 4) * 100}%` }} onChange={(e) => setFormality(([, b]) => [Math.min(Number(e.target.value), b), b])} />
        </label>
        <label className="field">
          <span className="row between">
            Most Formal <b style={{ color: "var(--ink)" }}>{FORMALITY[formality[1]]}</b>
          </span>
          <input type="range" min={1} max={5} value={formality[1]} style={{ ["--fill" as string]: `${((formality[1] - 1) / 4) * 100}%` }} onChange={(e) => setFormality(([a]) => [a, Math.max(Number(e.target.value), a)])} />
        </label>
      </div>

      <div>
      <span className="label">Setting</span>
      <div className="chips">
        {(["indoor", "outdoor"] as const).map((s) => (
          <button type="button" key={s} className="chip" aria-pressed={settings.includes(s)} onClick={() => toggleSetting(s)}>
            {title(s)}
          </button>
        ))}
      </div>
      </div>

      {error && <p className="error">{error}</p>}
      {saved && <p className="ok">Saved. Live in Matches.</p>}
      <div>
        <button className="btn accent lg" disabled={busy}>
          {busy ? <span className="spinner" /> : null} {vendor ? "Save Changes" : "Create Listing"}
        </button>
      </div>
    </form>
  );
}

function Portfolio({ vendor, onChange }: { vendor: Mine; onChange: (s: Suggestion | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ suggestion: Suggestion | null }>("/me/vendor/images", {
        method: "POST",
        body: await toFormData([...files].slice(0, 12), 1600),
      });
      onChange(r.suggestion);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api(`/me/vendor/images/${id}`, { method: "DELETE" }).catch((e: Error) => setError(e.message));
    onChange(null);
  }

  return (
    <section id="portfolio" className="card pad-lg">
      <div className="panel-title">
        <h2>Portfolio</h2>
        <button className="btn sm accent" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? <span className="spinner" /> : null} Add Photos
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {vendor.images.length === 0 ? (
        <div
          className="dropzone"
          role="button"
          tabIndex={0}
          title="Your own work only. Shindig reads these to match you to boards."
          onClick={() => ref.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
        >
          <div>
            <span className="plus" aria-hidden>
              +
            </span>
            <strong>Add 3+ Photos</strong>
          </div>
        </div>
      ) : (
        <div className="thumbs">
          {vendor.images.map((img) => (
            <figure key={img.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" />
              <button className="btn sm ghost" onClick={() => remove(img.id)} aria-label="Remove photo">
                ×
              </button>
            </figure>
          ))}
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
    </section>
  );
}

function Inbox({ rows, onReply }: { rows: Inq[]; onReply: () => void }) {
  return (
    <section id="inquiries" className="card pad-lg">
      <h2 style={{ marginBottom: 18 }}>Inquiries</h2>
      <div>
        {rows.map((r) => (
          <InquiryRow key={r.id} row={r} onReply={onReply} />
        ))}
      </div>
    </section>
  );
}

function InquiryRow({ row, onReply }: { row: Inq; onReply: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e = row.event;

  async function send(status: "replied" | "declined") {
    setBusy(true);
    setError(null);
    try {
      await api(`/me/vendor/inquiries/${row.id}/reply`, {
        method: "POST",
        json: { reply: text || (status === "declined" ? "Sorry, we're not available for this one." : ""), status },
      });
      onReply();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="inq">
      <div className="row between">
        <div className="row" style={{ gap: 10 }}>
          <h3>{row.from}</h3>
          <span className={`badge ${row.status === "sent" ? "accent" : row.status === "replied" ? "moss" : ""}`}>
            {row.status === "sent" ? "New" : row.status === "replied" ? "Replied" : "Declined"}
          </span>
        </div>
        {row.brief && <Swatches colors={row.brief.palette.slice(0, 5)} />}
      </div>
      <div className="meta">
        <span>{EVENT_TYPE_LABELS[e.type]}</span>
        <span>{e.date ?? "Date Open"}</span>
        <span>{getCity(e.cityId)?.name}</span>
        <span>{e.guestCount} Guests</span>
        {e.categoryBudget ? <span>~{usd(e.categoryBudget)} Budget</span> : null}
      </div>
      {row.brief && (
        <p className="serif" style={{ marginTop: 10, fontStyle: "italic", color: "var(--ink-2)" }} title={row.brief.summary}>
          {row.brief.styles.map((s) => STYLE_LABELS[s.style]).join(" · ")}
        </p>
      )}
      <blockquote>{row.message}</blockquote>
      {row.status === "sent" ? (
        <div className="stack" style={{ marginTop: 12 }}>
          <textarea value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Reply" maxLength={2000} />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn sm accent" disabled={busy || !text.trim()} onClick={() => send("replied")}>
              Send Reply
            </button>
            <button className="btn sm ghost" disabled={busy} onClick={() => send("declined")}>
              Not Available
            </button>
          </div>
        </div>
      ) : row.vendorReply ? (
        <p className="small" style={{ marginTop: 12, color: "var(--smoke)" }}>
          <b style={{ color: "var(--ink-2)" }}>You</b> · {row.vendorReply}
        </p>
      ) : null}
    </div>
  );
}
