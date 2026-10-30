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

  const chipGroup = (label: string, body: React.ReactNode) => (
    <div>
      <span className="label">{label}</span>
      <div className="chips">{body}</div>
    </div>
  );

  return (
    <div className="card brief">
      <section>
        <div className="panel-title">
          <p className="eyebrow">Your Look</p>
          <button className="linkish small" onClick={onReplace}>
            Replace Board
          </button>
        </div>
        {draft.palette.length > 0 && (
          <div className="swatch-strip">
            {draft.palette.map((c, i) => (
              <div key={`${c}-${i}`} style={{ background: c }} title={`${colorName(c)} ${c}`} />
            ))}
          </div>
        )}
        <p className="summary" style={{ marginTop: 16 }}>
          {draft.summary}
        </p>
        <p className="small muted" style={{ marginTop: 10 }}>
          {plan.briefLabel ?? "Your Images"}
          {draft.imageCount ? ` · ${draft.imageCount} Images` : ""}
        </p>
      </section>

      <section className="stack" style={{ ["--gap" as string]: "20px" }}>
        {chipGroup(
          "Palette",
          <>
            {draft.palette.map((c, i) => (
              <button
                key={`${c}-${i}`}
                className="chip"
                onClick={() => set("palette", draft.palette.filter((_, j) => j !== i))}
                title="Remove"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, boxShadow: "0 0 0 1px rgba(0,0,0,.1)" }} />
                {colorName(c)} <span className="muted">×</span>
              </button>
            ))}
            {draft.palette.length < 8 && (
              <label className="chip quiet" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                + Color
                <input
                  type="color"
                  style={{ width: 18, height: 18, padding: 0, border: 0, background: "none" }}
                  onChange={(e) => set("palette", [...draft.palette, e.target.value])}
                />
              </label>
            )}
          </>,
        )}

        {chipGroup(
          "Style",
          STYLES.map((s) => (
            <button key={s} className="chip" aria-pressed={hasStyle(s)} onClick={() => toggleStyle(s)}>
              {STYLE_LABELS[s]}
            </button>
          )),
        )}

        <label className="field">
          <span className="row between">
            Formality <b style={{ color: "var(--ink)" }}>{FORMALITY[draft.formality]}</b>
          </span>
          <input
            type="range"
            min={1}
            max={5}
            value={draft.formality}
            style={{ ["--fill" as string]: `${((draft.formality - 1) / 4) * 100}%` }}
            onChange={(e) => set("formality", Number(e.target.value) as Brief["formality"])}
          />
        </label>

        <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="field">
            <span>Tier</span>
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

        {wantsVenue &&
          chipGroup(
            "Venue Type",
            VENUE_TYPES.map((v) => (
              <button key={v} className="chip" aria-pressed={draft.venueTypes.includes(v)} onClick={() => toggleIn("venueTypes", v, 5)}>
                {title(v)}
              </button>
            )),
          )}

        {chipGroup(
          "Lighting",
          LIGHTING.map((l) => (
            <button key={l} className="chip" aria-pressed={draft.lighting.includes(l)} onClick={() => toggleIn("lighting", l, 4)}>
              {title(l)}
            </button>
          )),
        )}

        {draft.keywords.length > 0 &&
          chipGroup(
            "Keywords",
            draft.keywords.map((k) => (
              <span key={k} className="chip static quiet">
                {k}
              </span>
            )),
          )}
        {error && <p className="error">{error}</p>}
      </section>

      {dirty && (
        <div className="save-bar">
          <button className="btn accent block" onClick={save} disabled={busy || draft.styles.length === 0}>
            {busy ? <span className="spinner" /> : null} Update Matches
          </button>
        </div>
      )}
    </div>
  );
}
