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

  if (vendor === undefined) return <main className="wrap" style={{ padding: 40 }}><p className="muted">Loading…</p></main>;

  return (
    <main className="wrap" style={{ padding: "32px 20px 80px", maxWidth: 900 }}>
      <p className="eyebrow">Vendor Portal</p>
      <h1 style={{ fontSize: "2.4rem", marginTop: 6 }}>{vendor?.name ?? "Your Listing"}</h1>
      <p className="muted" style={{ marginTop: 6, maxWidth: 560 }}>
        Planners find you by their Pinterest boards. Your photos and tags are how Shindig knows your look.
      </p>

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
    <form className="card stack" style={{ marginTop: 24, ["--gap" as string]: "18px" }} onSubmit={submit}>
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
          <span>Starting Price ($)</span>
          <input name="priceMin" inputMode="numeric" required defaultValue={vendor?.priceMin} />
        </label>
        <label className="field">
          <span>Typical High End ($)</span>
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
        <textarea name="description" maxLength={1200} defaultValue={vendor?.description} placeholder="What you do and what it's like to work with you. Keep it short." />
      </label>
      <label className="field">
        <span>Website</span>
        <input name="website" type="url" placeholder="https://" defaultValue={vendor?.website ?? ""} />
      </label>

      <div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <p className="eyebrow">Your Look</p>
          {suggestion && (
            <button type="button" className="btn sm ghost" onClick={applySuggestion}>
              Use Tags From Photos
            </button>
          )}
        </div>
        {suggestion && (
          <p className="small muted" style={{ marginBottom: 8 }}>
            Your photos read as {suggestion.styles.map((s) => STYLE_LABELS[s]).join(", ") || "hard to call"}
            {suggestion.palette.length ? `, in ${[...new Set(suggestion.palette.map(colorName))].slice(0, 3).join(", ")}` : ""}.
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
          {palette.length === 0 && <span className="small muted">Upload photos to set your palette.</span>}
        </div>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>Least Formal: {FORMALITY[formality[0]]}</span>
          <input type="range" min={1} max={5} value={formality[0]} onChange={(e) => setFormality(([, b]) => [Math.min(Number(e.target.value), b), b])} />
        </label>
        <label className="field">
          <span>Most Formal: {FORMALITY[formality[1]]}</span>
          <input type="range" min={1} max={5} value={formality[1]} onChange={(e) => setFormality(([a]) => [a, Math.max(Number(e.target.value), a)])} />
        </label>
      </div>

      <div className="chips">
        {(["indoor", "outdoor"] as const).map((s) => (
          <button type="button" key={s} className="chip" aria-pressed={settings.includes(s)} onClick={() => toggleSetting(s)}>
            {title(s)}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {saved && <p className="ok">Saved. You&apos;re live in matches.</p>}
      <div>
        <button className="btn thread" disabled={busy}>
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
    <section className="card" style={{ marginTop: 24 }}>
      <div className="panel-title">
        <h2>Portfolio</h2>
        <button className="btn sm" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? <span className="spinner" /> : null} Add Photos
        </button>
      </div>
      <p className="small muted" style={{ marginBottom: 14 }}>
        Your own work only. Shindig reads these to match you to boards that look like them.
      </p>
      {error && <p className="error">{error}</p>}
      {vendor.images.length === 0 ? (
        <p className="muted">No photos yet. Add at least 3.</p>
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
    <section className="card" style={{ marginTop: 24 }}>
      <h2 style={{ marginBottom: 14 }}>Inquiries</h2>
      <div className="stack" style={{ ["--gap" as string]: "18px" }}>
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
    <div className="card flat" style={{ padding: 16 }}>
      <div className="row between">
        <strong>
          {row.from} · {EVENT_TYPE_LABELS[e.type]}
        </strong>
        {row.brief && <Swatches colors={row.brief.palette.slice(0, 5)} />}
      </div>
      <p className="small muted" style={{ marginTop: 4 }}>
        {e.date ?? "Date open"} · {getCity(e.cityId)?.name} · {e.guestCount} guests
        {e.categoryBudget ? ` · about ${usd(e.categoryBudget)} for your category` : ""}
      </p>
      {row.brief && (
        <p className="small" style={{ marginTop: 8 }}>
          <strong>Their look:</strong> {row.brief.styles.map((s) => STYLE_LABELS[s.style]).join(", ")}. {row.brief.summary}
        </p>
      )}
      <p style={{ marginTop: 10 }}>{row.message}</p>
      {row.status === "sent" ? (
        <div className="stack" style={{ marginTop: 12 }}>
          <textarea value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Your reply" maxLength={2000} />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn sm thread" disabled={busy || !text.trim()} onClick={() => send("replied")}>
              Send Reply
            </button>
            <button className="btn sm ghost" disabled={busy} onClick={() => send("declined")}>
              Not Available
            </button>
          </div>
        </div>
      ) : (
        <p className="small muted" style={{ marginTop: 10 }}>
          You {row.status === "replied" ? "replied" : "declined"}: {row.vendorReply}
        </p>
      )}
    </div>
  );
}
