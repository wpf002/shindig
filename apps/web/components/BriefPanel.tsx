"use client";

import { useEffect, useState } from "react";
import {
  colorName,
  LIGHTING,
  SETTINGS,
  STYLE_LABELS,
  STYLES,
  TIER_LABELS,
  TIERS,
  VENUE_TYPES,
  type Brief,
  type Style,
} from "@shindig/core";
import { api, type Plan } from "@/lib/api";

const FORMALITY = ["", "Backyard Casual", "Relaxed", "Semi-Formal", "Formal", "Black Tie"];
const title = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export function BriefPanel({
  plan,
  onSaved,
  onReplace,
}: {
  plan: Plan;
  onSaved: (p: Plan) => void;
  onReplace: () => void;
}) {
  const [draft, setDraft] = useState<Brief>(plan.brief!);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(plan.brief!);
    setDirty(false);
  }, [plan.brief]);

  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  const hasStyle = (s: Style) => draft.styles.some((x) => x.style === s);
  const toggleStyle = (s: Style) =>
    set(
      "styles",
      hasStyle(s) ? draft.styles.filter((x) => x.style !== s) : [...draft.styles, { style: s, weight: 0.6 }].slice(0, 6),
    );
  const toggleIn = <T extends string>(k: "venueTypes" | "lighting", v: T, max: number) => {
    const cur = draft[k] as string[];
    set(k, (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].slice(-max)) as Brief[typeof k]);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { analyzer: _a, imageCount: _i, ...edit } = draft;
      const r = await api<{ plan: Plan }>(`/plans/${plan.id}/brief`, { method: "PATCH", json: edit });
      onSaved(r.plan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const wantsVenue = plan.categories.includes("venue");

  return (
    <div className="card stack" style={{ ["--gap" as string]: "18px" }}>
      <div>
        <div className="row between">
          <p className="eyebrow">Your Look</p>
          <button className="linkish small" onClick={onReplace}>
            Replace Board
          </button>
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>
          From {plan.briefLabel ?? "your images"}
          {draft.imageCount ? ` · ${draft.imageCount} images` : ""}
        </p>
      </div>

      {draft.palette.length > 0 && (
        <div>
          <div className="swatch-strip">
            {draft.palette.map((c, i) => (
              <div key={`${c}-${i}`} style={{ background: c }} title={c} />
            ))}
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {draft.palette.map((c, i) => (
              <button
                key={`${c}-${i}`}
                className="chip"
                onClick={() => set("palette", draft.palette.filter((_, j) => j !== i))}
                title="Remove this color"
              >
                {colorName(c)} ×
              </button>
            ))}
            {draft.palette.length < 8 && (
              <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                Add Color
                <input
                  type="color"
                  style={{ width: 22, height: 22, padding: 0, border: 0, background: "none" }}
                  onChange={(e) => set("palette", [...draft.palette, e.target.value])}
                />
              </label>
            )}
          </div>
        </div>
      )}

      <p style={{ fontFamily: "var(--display)", fontSize: "1.05rem", lineHeight: 1.4 }}>{draft.summary}</p>

      <div>
        <p className="eyebrow" style={{ marginBottom: 8 }}>Style</p>
        <div className="chips">
          {STYLES.map((s) => (
            <button key={s} className="chip" aria-pressed={hasStyle(s)} onClick={() => toggleStyle(s)}>
              {STYLE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>
          Formality: {FORMALITY[draft.formality]}
        </span>
        <input type="range" min={1} max={5} value={draft.formality} onChange={(e) => set("formality", Number(e.target.value) as Brief["formality"])} />
      </label>

      <div className="grid-2">
        <label className="field">
          <span>Looks Like</span>
          <select value={draft.tier} onChange={(e) => set("tier", e.target.value as Brief["tier"])}>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Setting</span>
          <select value={draft.setting} onChange={(e) => set("setting", e.target.value as Brief["setting"])}>
            {SETTINGS.map((s) => (
              <option key={s} value={s}>
                {s === "either" ? "Either" : title(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {wantsVenue && (
        <div>
          <p className="eyebrow" style={{ marginBottom: 8 }}>Venue Type</p>
          <div className="chips">
            {VENUE_TYPES.map((v) => (
              <button key={v} className="chip" aria-pressed={draft.venueTypes.includes(v)} onClick={() => toggleIn("venueTypes", v, 5)}>
                {title(v)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="eyebrow" style={{ marginBottom: 8 }}>Lighting</p>
        <div className="chips">
          {LIGHTING.map((l) => (
            <button key={l} className="chip" aria-pressed={draft.lighting.includes(l)} onClick={() => toggleIn("lighting", l, 4)}>
              {title(l)}
            </button>
          ))}
        </div>
      </div>

      {draft.keywords.length > 0 && (
        <div className="chips">
          {draft.keywords.map((k) => (
            <span key={k} className="chip static">
              {k}
            </span>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {dirty && (
        <button className="btn" onClick={save} disabled={busy || draft.styles.length === 0}>
          {busy ? <span className="spinner" /> : null} Update Matches
        </button>
      )}
    </div>
  );
}
